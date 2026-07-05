<script>
  import { route } from '../router/index.js';
  import TopNav from '../components/TopNav.svelte';
  import Home from './Home.svelte';
  import Following from './Following.svelte';
  import Profile from './Profile.svelte';

  const pages = {
    '#/home': Home,
    '#/following': Following,
    '#/profile': Profile
  };

  function getPage(hash) {
    const path = hash.split('?')[0];
    return pages[path] || Home;
  }

  $: currentPage = getPage($route);
</script>

<div class="main-layout">
  <TopNav />
  <div class="main-content">
    <svelte:component this={currentPage} />
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
</style>
