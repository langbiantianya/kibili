// Rollup config for B 站 KaiOS 2.4 (Gecko 48) SPA
//
// 参考 Svelte 3 官方 rollup 模板结构, 适配以下目标环境:
//   - 单文件 IIFE bundle (无 module loader, 无 dynamic chunks)
//   - ES5 输出 (Babel + terser ecma:5)
//   - CSS 变量全部内联展开 (Firefox 48 不支持 var())
//   - production 时移除 Svelte dev runtime warnings
//
// 插件顺序 (与官方模板一致):
//   replace → svelte → postcss(raw .css) → resolve → commonjs → babel → terser → cssOnly → copy → html

import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import svelte from 'rollup-plugin-svelte';
import cssOnly from 'rollup-plugin-css-only';
import { terser } from 'rollup-plugin-terser';
import copy from 'rollup-plugin-copy';
import * as babelCore from '@babel/core';
import postcss from 'postcss';
import postcssCssVariables from 'postcss-css-variables';
import postcssGapProperties from 'postcss-gap-properties';
import postcssPresetEnv from 'postcss-preset-env';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.ROLLUP_WATCH === 'true';
const outDir = path.resolve(__dirname, 'build');

// 单源 PostCSS 管线: 跑在 cssOnly 之后, 对聚合后的整棵 CSS 树做兼容性处理.
// 此时 :root { --md-sys-color-* } 已经在同一棵 CSS 树上, postcss-css-variables 自动解析,
// 不需要手动注入 variables 映射.
const postcssPlugins = [
  // 1. CSS 变量全部内联展开 (Firefox 48 / KaiOS WebKit fork 上不可靠).
  postcssCssVariables({ preserve: false }),
  // 2. CSS Grid gap → grid-gap (Firefox 48 部分支持 grid, 老语法更稳).
  //    注: flexbox gap 没有可用的 postcss polyfill (postcss-flexbox-gap 注入的
  //    --pfg-gap 在子选择器块里 postcss-css-variables 跨不过去, 展开为 fallback 0).
  //    项目里基本都是单行 flex + 小 gap (4-8px), Firefox 48 上视觉差异有限, 暂接受.
  postcssGapProperties(),
  // 3. 其他现代 CSS 特性
  postcssPresetEnv({ browsers: 'firefox 48', stage: 2 })
];

// cssOnly 的 generateBundle 钩子在 writeBundle 之前触发, 但仍是同步回调.
// 用模块级变量把聚合 CSS 桥接到 bilibili-postcss-and-html 的 writeBundle 阶段,
// 由那里 await 跑 PostCSS + 写盘.
let pendingCss = null;

export default {
  input: 'src/main.js',
  output: {
    file: path.join(outDir, 'app.js'),
    format: 'iife',
    name: 'BilibiliKaiOS',
    inlineDynamicImports: true, // 单文件 bundle (KaiOS 不能拆 chunk)
    sourcemap: false
  },

  // Svelte runtime 有内部循环依赖 + eval, 屏蔽这两类警告
  onwarn(warning, warn) {
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    if (warning.code === 'EVAL') return;
    warn(warning);
  },

  plugins: [
    // 1. inject process.env.NODE_ENV 让 Svelte 切到 prod/dev runtime
    replace({
      preventAssignment: true,
      values: {
        'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production')
      }
    }),

    // 2. Svelte 编译器, 把 <style> 抽出为合成 import -> 由 cssOnly 收集
    //    不在这里跑 PostCSS: svelte 单独处理 <style> 时看不到 :root 变量,
    //    整棵 CSS 树的兼容性处理放到 cssOnly.output 之后的 writeBundle 阶段统一跑.
    svelte({
      compilerOptions: {
        hydratable: false,
        css: 'external',
        generate: 'dom',
        dev: isDev,
        accessors: false,
        immutable: true
      }
    }),

    // 4. 解析 svelte / svelte-spa-router / qrcode-generator 等依赖
    resolve({
      browser: true,
      dedupe: ['svelte'],
      preferBuiltins: false
    }),

    // 5. CommonJS 转 ESM (仅 node_modules, 提速)
    commonjs({ include: /node_modules/ }),

    // 6. Babel 降级: 必须 enforce:'post' 才能覆盖 node_modules/svelte/**
    {
      name: 'bilibili-babel',
      enforce: 'post',
      transform(code, id) {
        // 跳过二进制 / 资源 / 已经是 ES5 的 .svelte 产物外的非 JS
        if (/\.(css|json|map|svg|png|webapp|properties)(\?|$)/.test(id)) return null;
        const result = babelCore.transformSync(code, {
          babelrc: false,
          configFile: false,
          filename: id,
          sourceMaps: false,
          presets: [
            ['@babel/preset-env', {
              targets: 'firefox 48',
              modules: false,
              useBuiltIns: false,
              loose: true,
              bugfixes: true
            }]
          ]
        });
        return { code: result.code, map: null };
      }
    },

    // 7. 抽出 Svelte 组件 CSS + raw CSS → 暂存, writeBundle 时再写盘
    cssOnly({
      output(styles) {
        // fire-and-forget 会在 process.exit 前丢文件; 改用模块级变量在 writeBundle 阶段 await 写盘
        pendingCss = styles;
      }
    }),

    // 8. 仅生产: terser 压成 ES5 (必须在 cssOnly 之后, 否则会处理到 synthetic css import)
    !isDev && terser({
      ecma: 5,
      compress: { arrows: false, typeofs: false },
      format: { ecma: 5, safari10: true },
      mangle: { reserved: ['App', 'BilibiliKaiOS'] }
    }),

    // 9. 拷 public/ 到 build/ (icons/, locales/, manifest.webapp)
    copy({
      targets: [{ src: 'public/*', dest: outDir, flatten: false }],
      hook: 'writeBundle'
    }),

    // 10. 整棵 CSS 树过 PostCSS (此时 :root { --var: ... } 和各组件 .class 选择器在同一棵树上,
    //     postcss-css-variables 能直接解析 var(), 不需要手动注入 variables 映射),
    //     然后改写 index.html 写入 build/
    {
      name: 'bilibili-postcss-and-html',
      async writeBundle() {
        await fs.mkdir(outDir, { recursive: true });

        // 1) PostCSS 处理聚合 CSS (svelte 组件样式 + src/app.css 全部 :root + 组件级 raw CSS)
        let processedCss = '';
        if (pendingCss != null) {
          const result = await postcss(postcssPlugins).process(pendingCss, {
            from: 'app.css',
            to: 'app.css',
            map: false
          });
          processedCss = result.css;
          await fs.writeFile(path.join(outDir, 'app.css'), processedCss, 'utf8');
          pendingCss = null;
        }

        // 2) 把源 index.html 改写成 build/index.html (绝对路径 → 相对)
        const src = await fs.readFile(path.resolve(__dirname, 'index.html'), 'utf8');
        const out = src
          .replace('type="module" src="/src/main.js"', 'src="./app.js"')
          .replace('href="/manifest.webapp"', 'href="./manifest.webapp"')
          .replace('</title>', '</title>\n<link rel="stylesheet" href="./app.css" />');
        await fs.writeFile(path.join(outDir, 'index.html'), out, 'utf8');
      }
    }
  ].filter(Boolean)
};