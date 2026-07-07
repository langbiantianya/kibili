<script>
  import Router from "svelte-spa-router";
  import { onMount } from "svelte";
  import { isLogin, hydrateFromNav } from "./lib/stores/user.js";
  import { refreshWbiKeys } from "./lib/api/wbi.js";
  import { back } from "./lib/router/index.js";
  import SoftkeyBar from "./lib/components/SoftkeyBar.svelte";
  import Toast from "./lib/components/Toast.svelte";

  // Route definitions
  import MainLayout from "./lib/views/MainLayout.svelte";
  import History from "./lib/views/History.svelte";
  import Favorites from "./lib/views/Favorites.svelte";
  import FolderContents from "./lib/views/FolderContents.svelte";
  import Player from "./lib/views/Player.svelte";
  import Login from "./lib/views/Login.svelte";
  import DynamicDetail from "./lib/views/DynamicDetail.svelte";

  const routes = {
    "/home": MainLayout,
    "/following": MainLayout,
    "/profile": MainLayout,
    "/history": History,
    "/favorites": Favorites,
    "/folder": FolderContents,
    "/player": Player,
    "/login": Login,
    "/dynamic-detail": DynamicDetail,
    "*": MainLayout, // fallback
  };

  // 全局键位
  function onGlobalKey(e) {
    // 返回键返回上一级路由
    if (e.key === "Backspace" || e.key === "BrowserBack" || e.key === "Back") {
      // 1. 获取当前页面上获得焦点的元素
      const activeElement = document.activeElement;

      // 2. 检查该元素是否是输入框
      const isInput =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.isContentEditable); // 兼容富文本编辑框

      if (isInput) {
        // 如果在输入框内，直接 return，不调用 preventDefault()
        // 这样系统就会执行默认的“删除文字”功能
        return;
      }
      e.preventDefault();
      back();
    }
    // Send/End/Escape 键不拦截
    if (e.key === "BrowserStop" || e.keyCode === 413 || e.key === "Escape")
      return;
  }

  onMount(() => {
    // 启动时预加载 WBI keys (即使未登录也需要, B站多数接口强制 WBI 签名)
    refreshWbiKeys();

    // 启动时尝试 hydrate 用户信息
    if ($isLogin) {
      hydrateFromNav();
    }

    window.addEventListener("keydown", onGlobalKey);

    return () => {
      window.removeEventListener("keydown", onGlobalKey);
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
