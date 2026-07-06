import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import legacy from '@vitejs/plugin-legacy'
import crypto from 'crypto'

// 生成 buvid 设备标识 (B站风控要求, 缺失会 -412)
// buvid3: 32位hex + 8位随机hex
// buvid4: 格式为 XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX+时间戳
// b_nut: Unix 时间戳 (ms)
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
        // 改写 Referer: 浏览器自动设为 http://localhost:5173, B 站不认
        proxyReq.setHeader('Referer', 'https://www.bilibili.com/')
        proxyReq.setHeader(
          'User-Agent',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        // 转发客户端手动设置的 Cookie header
        // 浏览器 XHR 无法直接设置 Cookie, 但可以通过 X-Cookie 自定义 header 传递
        let cookieHeader = req.headers['x-cookie'] || req.headers['cookie'] || ''
        // 补充 buvid 设备标识 (B站风控要求, 缺失会 -412)
        // 注意: 即使无 x-cookie 也要注入 buvid
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
        // Host 也会被 changeOrigin 重写, OK
      })
    }
  }
}

// KaiOS 2.4 (Gecko 48) build configuration
export default defineConfig({
  // ⚠️ 極其重要：設置為空字符串或 './'，確保打包後的 index.html 中
  // 引入的 JS/CSS 路徑是相對路徑（如 src="assets/index.js"），否則在手機上會找不到資源
  base: '',

  plugins: [
    svelte(),
    legacy({
      // 精準對齊 KaiOS 2.5 的內核版本
      targets: ['firefox 48'],
      // 啟用傳統瀏覽器區塊
      renderLegacyChunks: true,
      // 按需引入 polyfill，避免包體積過大
      polyfills: ['es.promise', 'es.array.iterator', 'es.object.assign', 'es.symbol']
    })
  ],

  build: {
    // 設定基礎編譯目標為 es2015，legacy 插件會在此基礎上進一步降級
    target: 'es2015',
    // 禁用 CSS 代碼分割，將所有 CSS 打包進一個檔案，少 KaiOS 文件的加載開銷
    cssCodeSplit: false,
    // 輸出目錄名稱
    outDir: 'build',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // 第三方依赖打包到 vendor chunk
          if (id.includes('node_modules')) {
            // svelte 运行时单独打包（核心库，缓存优先级高）
            if (id.includes('svelte')) {
              return 'svelte'
            }
            return 'vendor'
          }

          // API 层：所有网络请求相关模块
          if (id.includes('/lib/api/')) {
            return 'api'
          }

          // 状态管理层：stores 及持久化逻辑
          if (id.includes('/lib/stores/')) {
            return 'stores'
          }

          // 工具/共享模块
          if (id.includes('/lib/utils/') || id.includes('/lib/helpers/')) {
            return 'utils'
          }

          // 默认：留在主 chunk（页面组件、路由等）
        }
      }
    }
  },

  server: {
    proxy: {
      '/api-proxy': makeProxyConfig('https://api.bilibili.com'),
      '/passport-proxy': makeProxyConfig('https://passport.bilibili.com'),
      '/vc-proxy': makeProxyConfig('https://api.vc.bilibili.com'),
      '/app-proxy': makeProxyConfig('https://app.bilibili.com'),
      '/search-proxy': makeProxyConfig('https://s.search.bilibili.com')
    }
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
})
