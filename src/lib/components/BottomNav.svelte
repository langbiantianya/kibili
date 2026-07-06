<script>
  import { onMount, onDestroy } from 'svelte';
  import { location as routerLocation } from 'svelte-spa-router';
  import { navigate } from '../router/index.js';
  import { ui, setSoftkeys } from '../stores/ui.js';

  // 五 Tab: home / following / profile / search / settings
  // 当前应用只有前 3 个; 4=search, 5=settings 暂留空
  const tabs = [
    { key: 'home',      label: '首页',   path: '/home' },
    { key: 'following', label: '关注',   path: '/following' },
    { key: 'profile',   label: '我的',   path: '/profile' }
  ];

  function currentKey() {
    const p = $routerLocation || '/home';
    const t = tabs.find(x => p.startsWith(x.path));
    if (t) return t.key;
    if (p.startsWith('/folder') || p.startsWith('/favorites')) return 'profile';
    if (p.startsWith('/player')) return 'home';
    if (p.startsWith('/history')) return 'profile';
    if (p.startsWith('/login')) return 'profile';
    return 'home';
  }

  $: cur = currentKey();

  function clickTab(t) {
    navigate(t.path);
  }
</script>

<nav class="bottom-nav">
  {#each tabs as t}
    <button
      class="tab"
      class:active={cur === t.key}
      data-navable
      on:click={() => clickTab(t)}
    >
      <span class="label">{t.label}</span>
    </button>
  {/each}
</nav>
