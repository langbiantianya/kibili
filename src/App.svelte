<script>
  import Router, { location as routerLocation, replace } from "svelte-spa-router";
  import { onMount } from "svelte";
  import { isLogin, hydrateFromNav } from "./lib/stores/user.js";
  import { refreshWbiKeys } from "./lib/api/wbi.js";
  import { request } from "./lib/api/bili.js";
  import SoftkeyBar from "./lib/components/SoftkeyBar.svelte";
  import Toast from "./lib/components/Toast.svelte";

  // Route definitions
  import MainLayout from "./lib/views/MainLayout.svelte";
  import History from "./lib/views/History.svelte";
  import Favorites from "./lib/views/Favorites.svelte";
  import FolderContents from "./lib/views/FolderContents.svelte";
  import Player from "./lib/views/Player.svelte";
  import FullscreenPlayer from "./lib/views/FullscreenPlayer.svelte";
  import Login from "./lib/views/Login.svelte";
  import DynamicDetail from "./lib/views/DynamicDetail.svelte";
  import Search from "./lib/views/Search.svelte";
  import SearchResults from "./lib/views/SearchResults.svelte";
  import Settings from "./lib/views/Settings.svelte";
  import About from "./lib/views/About.svelte";
  import KeyTest from "./lib/views/KeyTest.svelte";

  const routes = {
    "/home": MainLayout,
    "/following": MainLayout,
    "/profile": MainLayout,
    "/history": History,
    "/favorites": Favorites,
    "/folder": FolderContents,
    "/player": Player,
    "/fullscreen": FullscreenPlayer,
    "/login": Login,
    "/dynamic-detail": DynamicDetail,
    "/search": Search,
    "/search-results": SearchResults,
    "/settings": Settings,
    "/about": About,
    "/keytest": KeyTest,
    "*": MainLayout, // fallback
  };

  // 返回键统一由 lib/keyboard/index.js 的全局 app-back 作用域处理
  // (SoftRight / Back 两个键都归一化后走同一处, 顶层路由不拦截)
  // 这里不再单独监听 keydown, 避免同一个按键被处理两遍。

  onMount(() => {
    // 启动时预加载 WBI keys (即使未登录也需要, B站多数接口强制 WBI 签名)
    refreshWbiKeys();

    // 启动时访问 bilibili.com 首页以设置 cookies (buvid 等)
    request("https://www.bilibili.com/", { rawData: true }).catch(() => {});

    // 启动时尝试 hydrate 用户信息
    if ($isLogin) {
      hydrateFromNav();
    }

    // 未匹配到路由的路径 (含冷启动的 "#/" 与无 hash 的裸 URL) 重定向到首页。
    // 兜底路由 "*" 指向 MainLayout, 但 MainLayout 只渲染它自己的三个主 Tab 页面;
    // 若让它把未知路径渲染成 Home, 从主 Tab 过渡到二级页 (/history 等) 的那一帧会多挂载一个
    // Home (MainLayout.getPage 返回 null 避免了这一点, 这里只是双保险)。
    const knownPaths = Object.keys(routes).filter(p => p !== "*");
    const unsubLocation = routerLocation.subscribe(loc => {
      const path = loc || "/";
      if (knownPaths.indexOf(path) < 0) replace("/home");
    });

    return () => {
      unsubLocation();
    };
  });
</script>

<div class="app-root">
  <Router {routes} />
  <SoftkeyBar />
  <Toast />
</div>

<style>
  .app-root {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background: var(--md-sys-color-surface-bright);
    color: var(--md-sys-color-on-surface);
  }
  .app-root > :global(.main-layout),
  .app-root > :global(.screen) {
    flex: 1;
    min-height: 0;
  }
</style>
