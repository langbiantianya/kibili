import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import legacy from '@vitejs/plugin-legacy';

// 改写 Referer / User-Agent, 让 B 站服务端不拒绝 (请求来自 localhost)
function makeProxyConfig(target) {
  return {
    target,
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace(/^\/api-proxy|^\/passport-proxy|^\/vc-proxy|^\/app-proxy|^\/search-proxy/, ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq, req) => {
        // 改写 Referer: 浏览器自动设为 http://localhost:5173, B 站不认
        proxyReq.setHeader('Referer', 'https://www.bilibili.com/');
        proxyReq.setHeader('User-Agent',
          'Mozilla/5.0 (Mobile; KaiOS; rv:48.0) Gecko/48.0 Firefox/48.0 KaiOS/2.4');
        // 转发客户端手动设置的 Cookie header
        // 浏览器 XHR 无法直接设置 Cookie, 但可以通过 X-Cookie 等自定义 header 传递
        const cookieHeader = req.headers['x-cookie'] || req.headers['cookie'];
        if (cookieHeader) {
          proxyReq.setHeader('Cookie', cookieHeader);
        }
        // Host 也会被 changeOrigin 重写, OK
      });
    }
  };
}

// KaiOS 2.4 (Gecko 48) build configuration
export default defineConfig({
  base: '',
  plugins: [
    svelte(),
    legacy({
      targets: ['firefox 48'],
      renderLegacyChunks: true,
      polyfills: ['es.promise', 'es.array.iterator', 'es.object.assign', 'es.symbol']
    })
  ],
  build: {
    target: 'es2015',
    cssCodeSplit: false,
    outDir: 'build',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          api: [
            './src/lib/api/bili.js',
            './src/lib/api/feed.js',
            './src/lib/api/video.js',
            './src/lib/api/user.js',
            './src/lib/api/dynamic.js',
            './src/lib/api/followings.js',
            './src/lib/api/auth.js',
            './src/lib/api/interact.js'
          ],
          stores: [
            './src/lib/stores/user.js',
            './src/lib/stores/queue.js',
            './src/lib/stores/settings.js',
            './src/lib/stores/ui.js',
            './src/lib/stores/history.js',
            './src/lib/stores/persist.js'
          ]
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
});
