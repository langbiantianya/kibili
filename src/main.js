import './app.css';
import App from './App.svelte';
import { refreshWbiKeys } from './lib/api/wbi.js';

const app = new App({
  target: document.getElementById('app'),
});

// 启动时预热 wbi 鉴权 keys (拉一次 getNav 拿 wbi_img)
// 不阻塞启动, 后台异步执行
refreshWbiKeys().catch(() => {});

export default app;
