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
    // @ts-ignore
    return pages[cleanPath] || Home;
  }

  $: currentPage = getPage($routerLocation);
</script>

<div class="main-layout">
  <TopNav />
  <div class="main-content">
    <!-- 同时挂载三个页面，通过 CSS 控制显示/隐藏。
         切换页面时组件不被销毁，数据保持；
         刷新时重新挂载，数据重新加载。 -->
    <div class="page-wrap" class:active={currentPage === Home}>
      <Home />
    </div>
    <div class="page-wrap" class:active={currentPage === Following}>
      <Following />
    </div>
    <div class="page-wrap" class:active={currentPage === Profile}>
      <Profile />
    </div>
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
    display: none;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
  .page-wrap.active {
    display: flex;
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
