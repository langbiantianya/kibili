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
    base: '',

    plugins: [
      svelte(),
      // legacy 插件：只在 build 时生成 legacy chunk
      // dev 模式下 Vite 使用原生 ES Modules，这是正常的
      legacy({
        targets: ['firefox 48'],
        renderLegacyChunks: true,
        modernPolyfills: false,
        polyfills: [
          'es.promise',
          'es.array.iterator',
          'es.object.assign',
          'es.symbol',
          'es.string.starts-with',
          'es.string.includes',
          'es.array.from',
          'es.array.find',
          'es.array.find-index',
          'es.object.keys',
          'es.object.values',
          'es.object.entries'
        ]
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
      target: 'es2015',
      cssCodeSplit: false,
      outDir: 'build',
      sourcemap: false,
      assetsInlineLimit: 4096,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2
        },
        mangle: {
          properties: false
        }
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('svelte')) {
                return 'svelte'
              }
              return 'vendor'
            }
            if (id.includes('/lib/api/')) {
              return 'api'
            }
            if (id.includes('/lib/stores/')) {
              return 'stores'
            }
            if (id.includes('/lib/utils/') || id.includes('/lib/helpers/')) {
              return 'utils'
            }
          }
        }
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
  }
})
