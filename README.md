# Kibili — KaiOS 哔哩哔哩客户端

基于 Svelte 3 + Rollup 构建的 KaiOS 第三方哔哩哔哩（B站）客户端，使用 AI 辅助开发。

> **下载最新安装包** 👉 [Releases](https://github.com/langbiantianya/kibili/releases)

## 功能

- 🏠 **首页推荐** — 个性化视频推荐信息流
- 👥 **关注列表** — 已关注 UP 主的视频与动态
- 🔍 **搜索** — 关键词搜索视频
- 🔐 **账号登录** — 扫码登录，支持 Cookie 持久化
- ▶️ **视频播放** — 自适应码率播放，全屏模式，音量控制
- 💬 **视频评论** — 查看评论与回复
- 📜 **历史记录** — 观看历史，播放进度上报
- ⭐ **收藏列表** — 查看收藏夹及内容
- ⚙️ **设置** — 基础应用设置

### 开发中 / 计划中

- [ ] 弹幕
- [ ] 用户主页
- [ ] 一键三连（点赞 / 收藏 / 投币）
- [ ] 关注 / 取关

## 技术栈

| 类别 | 技术 |
| ------ | ------ |
| UI 框架 | [Svelte 3](https://svelte.dev/) |
| 构建工具 | [Rollup](https://rollupjs.org/) |
| 路由 | [svelte-spa-router](https://github.com/EmilTholin/svelte-spa-router) |
| CSS 兼容 | PostCSS（CSS 变量展开 / gap 降级 / preset-env） |
| ES 降级 | Babel + Terser → ES5（目标 Firefox 48 / KaiOS 2.4） |
| 二维码 | [qrcode-generator](https://github.com/nicennnnnnnlee/qrcode-generator) |
| 许可证 | AGPL-3.0 |

## 项目结构

```text
├── public/                  # 静态资源 (图标, manifest.webapp)
├── scripts/
│   └── dev-server.js        # 开发服务器 (Express + 代理)
├── src/
│   ├── main.js              # 入口
│   ├── App.svelte           # 根组件 + 路由
│   ├── app.css              # 全局样式 + CSS 变量
│   └── lib/
│       ├── api/             # B站 API 封装
│       │   ├── auth.js      #   登录鉴权
│       │   ├── bili.js      #   请求基础层 (WBI 签名)
│       │   ├── dynamic.js   #   动态
│       │   ├── feed.js      #   推荐信息流
│       │   ├── followings.js#   关注
│       │   ├── interact.js  #   互动 (点赞/收藏/投币)
│       │   ├── user.js      #   用户信息
│       │   ├── video.js     #   视频详情/播放
│       │   └── wbi.js       #   WBI 签名算法
│       ├── components/      # UI 组件
│       ├── keyboard/        # 键盘导航 (焦点漫游)
│       ├── player/          # 视频播放器
│       ├── router/          # 路由工具
│       ├── stores/          # Svelte stores (状态管理)
│       ├── utils/           # 工具函数
│       └── views/           # 页面视图
├── index.html               # HTML 模板
├── rollup.config.js         # Rollup 构建配置
└── package.json
```

## 如何构建

### 环境要求

- Node.js ≥ 14
- npm

### 开发

```bash
# 安装依赖
npm install

# 启动开发服务器 (Express + B站 API 代理)
npm run dev
```

### 生产构建

```bash
# 清理 + 构建
npm run build
```

构建产物输出到 `build/` 目录，包含：

| 文件 | 说明 |
| ------ | ------ |
| `app.js` | IIFE 格式单文件 bundle（ES5） |
| `app.css` | PostCSS 处理后的样式（CSS 变量已展开） |
| `index.html` | 入口页面 |
| `manifest.webapp` | KaiOS 应用清单 |
| `icons/` | 应用图标 |

## 兼容性说明

本项目专为 **KaiOS 2.4**（基于 Firefox 48 / Gecko 引擎）优化：

- **CSS 变量** — 构建时通过 `postcss-css-variables` 全部展开为具体值，运行时无需 `var()` 支持
- **Flexbox gap** — 通过 `postcss-gap-properties` 降级；flexbox gap 在 Firefox 48 上无完美 polyfill，小间距（4-8px）视觉差异可接受
- **ES5 输出** — Babel `preset-env` + Terser 确保 `ecma:5` 输出，无箭头函数、模板字符串等现代语法
- **单文件 bundle** — IIFE 格式，`inlineDynamicImports: true`，KaiOS 不支持 ES module loader

## 致谢

- [bili-apis](https://github.com/realysy/bili-apis) — B站 API 参考
- [Svelte](https://svelte.dev/) — UI 框架
- [Rollup](https://rollupjs.org/) — 模块打包

## 许可证

[AGPL-3.0](LICENSE)
