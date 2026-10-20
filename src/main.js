import './app.css';
import App from './App.svelte';
import { refreshWbiKeys } from './lib/api/wbi.js';
import { onKey, installKeyboard } from './lib/keyboard/index.js';
import { back } from './lib/router/index.js';

// ── 全局返回键 ─────────────────────────────────────────────────────────
// KaiOS 设备上能当"返回/取消"用的键有一整个家族 (DOM key 名, 官方表格见
// kaios.dev "Special Keys on KaiOS"):
//
//   Back         退格键 (keyCode 8) —— **主力**
//                官方语义就是"返回上一级"; Nokia 6300 4G 这类机型上, 方向键
//                右边那颗"←"物理返回键上报的就是它 (e.key = "Backspace")
//   GoBack       Smart Touch 机型的返回键 (KaiOS 3, 如 Nokia 8000)
//   BrowserBack  浏览器里的返回键 (浏览器环境才有, 顺手支持)
//
// 这些键注册成 priority = -100 的**全局**作用域: 页面自己接管了 (首页=搜索 /
// 关注页=切Tab / 播放器的返回) 就由页面处理, 否则视为"返回"。
// 顶层页面不拦截, 让系统默认行为 (退出应用) 生效。
//
// ⚠️ **通话键 Call / 挂断键 EndCall 不在返回家族里**。
// 它们关系到打电话本身 —— 网页吞掉, 用户就没法拨号、没法挂断。框架在按键总线
// 的最前面就把这两个键放行了 (NEVER_INTERCEPT), 连页面都接管不到。
//
// ⚠️ **右软键 SoftRight 不再兜底返回**。
// 软键是"页面动作"键, 不是导航键: 页面想用就自己声明 (首页=搜索 /
// 关注页=切Tab / 我的=登出), 页面没声明就什么都不做。
// 以前把右软键塞进返回家族, 副作用是每个子页面的右软键都被"返回"占住,
// 页面自己声明的动作还容易被全局兜底抢走 (旧实现里就出过"右软键在二级页
// 仍然触发搜索"的回归)。
//
// 旧实现里返回逻辑散落在两处: main.js 的 app-back 只管 SoftRight,
// App.svelte 的 onGlobalKey 只管 Backspace/Back/BrowserBack 且没有防长按连发,
// 一次长按会连续 pop 掉多级路由。现在统一到一处。
const TOP_LEVEL_ROUTES = ['/home', '/following', '/profile'];

function currentPath() {
  return (location.hash.replace('#', '').split('?')[0]) || '/home';
}

function handleBack(e) {
  if (TOP_LEVEL_ROUTES.indexOf(currentPath()) >= 0) return;
  // 长按连发时只退一层, 否则一次长按会连续 pop 掉多级路由
  if (e && e.repeat) return;
  e.preventDefault();
  back();
}

onKey('app-back', {
  Back: handleBack,
  GoBack: handleBack,
  BrowserBack: handleBack
}, { priority: -100, global: true });

// 按键总线只装一次, 全应用共用同一个入口
installKeyboard();

const app = new App({
  target: document.getElementById('app'),
});

// 启动时预热 wbi 鉴权 keys (拉一次 getNav 拿 wbi_img)
// 不阻塞启动, 后台异步执行
refreshWbiKeys().catch(() => {});

export default app;
