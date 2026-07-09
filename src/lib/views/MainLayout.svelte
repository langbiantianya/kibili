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
