<script>
  import { location as routerLocation } from 'svelte-spa-router';
  import TopNav from '../components/TopNav.svelte';
  import Home from './Home.svelte';
  import Following from './Following.svelte';
  import Profile from './Profile.svelte';

  const pages = {
    '/home': Home,
    '/following': Following,
    '/profile': Profile
  };

  /** @param {string} path */
  function getPage(path) {
    // Remove query string if any
    const cleanPath = path.split('?')[0];
    // 未知路径返回 null (而不是回退到 Home):
    // MainLayout 同时是 App.svelte 的 "*" 兜底路由, 从主 Tab 跳到 /history 等二级页时,
    // 路由还没卸载 MainLayout 而 $routerLocation 已更新, 若回退到 Home 就会在过渡帧里
    // 多挂载一个 Home。
    //
    // (以前这里多挂载的 Home 会残留按键处理器, 导致右软键在二级页仍触发搜索;
    //  现在按键作用域按实例注册/注销, 多挂载一个也不会互相干扰 ——
    //  每个实例在 onDestroy 时只移除自己注册的那个作用域。)
    // @ts-ignore
    return pages[cleanPath] || null;
  }

  $: currentPage = getPage($routerLocation);
</script>

<div class="main-layout">
  <TopNav />
  <div class="main-content">
    {#if currentPage === Home}
      <div class="page-wrap active">
        <Home />
      </div>
    {:else if currentPage === Following}
      <div class="page-wrap active">
        <Following />
      </div>
    {:else if currentPage === Profile}
      <div class="page-wrap active">
        <Profile />
      </div>
    {/if}
  </div>
</div>

<style>
  .main-layout {
    display: flex;
    flex-direction: column;
    width: 100%;
    flex: 1;
    min-height: 0;
  }
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
  .page-wrap {
    display: flex;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
  /* 确保内部 .screen 也能正确撑开 */
  .page-wrap :global(.screen) {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
  .page-wrap :global(.main) {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
</style>
