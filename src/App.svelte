<script>
  import { onMount } from 'svelte';
  import { route, loadView, navigate } from './lib/router/index.js';
  import { onKey, offKey, moveFocus } from './lib/keyboard/index.js';
  import { isLogin, hydrateFromNav } from './lib/stores/user.js';
  import { showToast, setSoftkeys } from './lib/stores/ui.js';
  import { refreshWbiKeys } from './lib/api/wbi.js';
  import SoftkeyBar from './lib/components/SoftkeyBar.svelte';
  import Toast from './lib/components/Toast.svelte';

  let currentView = null;
  let currentRoute = '';

  async function renderRoute(hash) {
    if (hash === currentRoute && currentView) return;
    currentRoute = hash;
    try {
      const Comp = await loadView(hash);
      currentView = Comp;
    } catch (e) {
      console.error('load view err:', e);
      showToast('页面加载失败');
    }
  }

  $: renderRoute($route);

  // 全局键位
  function onGlobalKey(e) {
    // Send/End 键不拦截
    if (e.key === 'BrowserStop' || e.keyCode === 413) return;
  }

  // 主 Tab 切换：左右键切换首页/关注/我的
  function switchMainTab(direction) {
    const mainTabs = ['#/home', '#/following', '#/profile'];
    const currentHash = $route || '#/home';
    // 找到当前属于哪个主 tab
    let currentMainIdx = 0;
    for (let i = 0; i < mainTabs.length; i++) {
      if (currentHash.startsWith(mainTabs[i])) {
        currentMainIdx = i;
        break;
      }
    }
    // 只在主页面之间切换
    const isMainPage = mainTabs.some(t => currentHash.startsWith(t));
    if (!isMainPage) return;

    const newIdx = Math.max(0, Math.min(mainTabs.length - 1, currentMainIdx + direction));
    if (newIdx !== currentMainIdx) {
      navigate(mainTabs[newIdx]);
    }
  }

  onMount(() => {
    // 启动时预加载 WBI keys (即使未登录也需要, B站多数接口强制 WBI 签名)
    refreshWbiKeys();

    // 启动时尝试 hydrate 用户信息
    if ($isLogin) {
      hydrateFromNav();
    }

    // 全局左右键切换主 Tab
    onKey('global', {
      ArrowLeft: () => switchMainTab(-1),
      ArrowRight: () => switchMainTab(+1),
      '0': () => { location.hash = '#/home'; }
    });

    window.addEventListener('keydown', onGlobalKey);
    return () => {
      window.removeEventListener('keydown', onGlobalKey);
      offKey('global');
    };
  });
</script>

<div class="app-root">
  {#if currentView}
    <svelte:component this={currentView} />
  {:else}
    <div class="loading-screen">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>
  {/if}
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
  .loading-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--md-sys-typescale-body-medium-size);
  }
  .loading-screen .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--md-sys-color-outline-variant);
    border-top-color: var(--md-sys-color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
