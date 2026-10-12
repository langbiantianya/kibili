import './app.css';
import App from './App.svelte';
import { refreshWbiKeys } from './lib/api/wbi.js';
import { onKey } from './lib/keyboard/index.js';
import { modalKeyGuard } from './lib/keyboard/modalkeys.js';
import { back } from './lib/router/index.js';

// 全局兜底: 本机右软键上报的是 DOM key "SoftRight" (KaiOS 把 KEY_BACK 映射为 SoftRight),
// App.svelte 里只监听 Backspace/Back/BrowserBack, 因此子页面没有返回键可用。
// 这里在 main.js 提前注册 (此时各路由视图还没 mount), 保证它位于按键处理栈最底部:
// 页面自己绑定了 SoftRight 就由页面处理, 否则视为"返回"。
const TOP_LEVEL_ROUTES = ['/home', '/following', '/profile'];

function currentPath() {
  return (location.hash.replace('#', '').split('?')[0]) || '/home';
}

function topLevelBack(e) {
  if (TOP_LEVEL_ROUTES.indexOf(currentPath()) >= 0) return;
  // 软键不同于退格键: 输入框聚焦时也应能返回
  e.preventDefault();
  back();
}

onKey('app-back', { SoftRight: topLevelBack });

// 回复框等模态组件打开时独占按键:
// 组件自己在捕获阶段处理按键 (见 lib/keyboard/modalkeys.js), 这里在冒泡阶段 (先于其它
// window 监听注册) 吞掉整次按键, 避免播放器等组件在 keyup 阶段重复响应同一次按下。
window.addEventListener('keydown', modalKeyGuard, false);
window.addEventListener('keyup', modalKeyGuard, false);

const app = new App({
  target: document.getElementById('app'),
});

// 启动时预热 wbi 鉴权 keys (拉一次 getNav 拿 wbi_img)
// 不阻塞启动, 后台异步执行
refreshWbiKeys().catch(() => {});

export default app;
