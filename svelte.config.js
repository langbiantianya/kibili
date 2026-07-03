import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import legacy from '@vitejs/plugin-legacy'

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
      polyfills: ['es.promise', 'es.array.iterator'] 
    })
  ],
  
  build: {
    // 設定基礎編譯目標為 es2015，legacy 插件會在此基礎上進一步降級
    target: 'es2015',
    // 禁用 CSS 代碼分割，將所有 CSS 打包進一個檔案，減少 KaiOS 文件的加載開銷
    cssCodeSplit: false,
    // 輸出目錄名稱
    outDir: 'build'
  }
})