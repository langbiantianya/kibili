<script>
  import Router from 'svelte-spa-router';
  import { onMount } from 'svelte';
  import { isLogin, hydrateFromNav } from './lib/stores/user.js';
  import { refreshWbiKeys } from './lib/api/wbi.js';
  import SoftkeyBar from './lib/components/SoftkeyBar.svelte';
  import Toast from './lib/components/Toast.svelte';

  // Route definitions
  import MainLayout from './lib/views/MainLayout.svelte';
  import History from './lib/views/History.svelte';
  import Favorites from './lib/views/Favorites.svelte';
  import FolderContents from './lib/views/FolderContents.svelte';
  import Player from './lib/views/Player.svelte';
  import Login from './lib/views/Login.svelte';
  import DynamicDetail from './lib/views/DynamicDetail.svelte';

  const routes = {
    '/home': MainLayout,
    '/following': MainLayout,
    '/profile': MainLayout,
    '/history': History,
    '/favorites': Favorites,
    '/folder': FolderContents,
    '/player': Player,
    '/login': Login,
    '/dynamic-detail': DynamicDetail,
    '*': MainLayout // fallback
  };

  // 全局键位
  function onGlobalKey(e) {
    // Send/End 键不拦截
    if (e.key === 'BrowserStop' || e.keyCode === 413) return;
  }

  onMount(() => {
    // 启动时预加载 WBI keys (即使未登录也需要, B站多数接口强制 WBI 签名)
    refreshWbiKeys();

    // 启动时尝试 hydrate 用户信息
    if ($isLogin) {
      hydrateFromNav();
    }

    window.addEventListener('keydown', onGlobalKey);
    return () => {
      window.removeEventListener('keydown', onGlobalKey);
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
