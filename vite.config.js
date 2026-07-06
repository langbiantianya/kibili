import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import legacy from '@vitejs/plugin-legacy'
import crypto from 'crypto'

// 生成 buvid 设备标识 (B站风控要求, 缺失会 -412)
function generateBuvid() {
  const hex32 = crypto.randomBytes(16).toString('hex')
  const buvid3 = hex32 + crypto.randomBytes(4).toString('hex')
  const ts = Date.now()
  const buvid4 = crypto.randomUUID().toUpperCase() + ts
  const b_nut = ts
  return { buvid3, buvid4, b_nut }
}

// 改写 Referer / User-Agent, 让 B 站服务端不拒绝 (请求来自 localhost)
function makeProxyConfig(target) {
  const buvid = generateBuvid()
  return {
    target,
    changeOrigin: true,
    secure: true,
    rewrite: (path) =>
      path.replace(
        /^\/api-proxy|^\/passport-proxy|^\/vc-proxy|^\/app-proxy|^\/search-proxy/,
        ''
      ),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq, req) => {
        proxyReq.setHeader('Referer', 'https://www.bilibili.com/')
        proxyReq.setHeader(
          'User-Agent',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        let cookieHeader = req.headers['x-cookie'] || req.headers['cookie'] || ''
        if (!cookieHeader.includes('buvid3')) {
          cookieHeader += (cookieHeader ? '; ' : '') + 'buvid3=' + buvid.buvid3
        }
        if (!cookieHeader.includes('buvid4')) {
          cookieHeader += '; buvid4=' + buvid.buvid4
        }
        if (!cookieHeader.includes('b_nut')) {
          cookieHeader += '; b_nut=' + buvid.b_nut
        }
        proxyReq.setHeader('Cookie', cookieHeader)
      })
    }
  }
}

// KaiOS 2.4 (Gecko 48) build configuration
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'

  return {
    // ⚠️ 重要：使用相对路径，确保 KaiOS 设备上能正确加载资源
    base: './',

    plugins: [
      svelte(),
      // legacy 插件：只在 build 时生成 legacy chunk
      // dev 模式下 Vite 使用原生 ES Modules，这是正常的
      legacy({
        targets: ['Firefox >= 48'], // KaiOS 2.4 的真实内核版本
        // core-js 会自动根据 targets 注入所需的 polyfill（如 Promise, Map 等）
        polyfills: true,
        // 如果你用到了 async/await，必须开启 regenerator
        additionalLegacyPolyfills: ['regenerator-runtime/runtime']
      })
    ],

    // 开发服务器配置
    server: {
      // 开发模式下使用 es2015 目标
      // 注意：Vite dev 仍然使用 ES Modules，这是设计如此
      // 如果需要在 KaiOS 2.4 上测试，请使用 npm run build + npm run preview
      proxy: {
        '/api-proxy': makeProxyConfig('https://api.bilibili.com'),
        '/passport-proxy': makeProxyConfig('https://passport.bilibili.com'),
        '/vc-proxy': makeProxyConfig('https://api.vc.bilibili.com'),
        '/app-proxy': makeProxyConfig('https://app.bilibili.com'),
        '/search-proxy': makeProxyConfig('https://s.search.bilibili.com')
      }
    },

    build: {
      // 3. 基础目标设置为 es2015
      target: "es2015",
      cssTarget: "firefox48",
      // 4. 指定压缩器为 terser（Vite 3+ 默认是 esbuild，但 legacy 插件最好配合 terser 使用）
      minify: 'terser',
      // 5. 设置打包输出目录（可选，KaiOS 常用 build 或 www）
      outDir: 'build',
      // 让打包后的文件结构更扁平一点，避免某些奇怪的文件系统截断问题
      assetsDir: 'assets',
      cssCodeSplit: false,
      modulePreload: false,
      assetsInlineLimit: 0,
      minify: true,
      ssr: false,
      rollupOptions: {
        output: {
          format: "iife",
        },
      },
    },

    preview: {
      port: 4173,
      proxy: {
        '/api-proxy': makeProxyConfig('https://api.bilibili.com'),
        '/passport-proxy': makeProxyConfig('https://passport.bilibili.com'),
        '/vc-proxy': makeProxyConfig('https://api.vc.bilibili.com'),
        '/app-proxy': makeProxyConfig('https://app.bilibili.com'),
        '/search-proxy': makeProxyConfig('https://s.search.bilibili.com')
      }
    }
  }
})
