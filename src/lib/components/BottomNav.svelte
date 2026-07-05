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

<style>
  .bottom-nav {
    height: 64px;
    background: var(--md-sys-color-surface);
    display: flex;
    align-items: center;
    justify-content: space-around;
    box-shadow: var(--md-sys-elevation-level2);
    z-index: 10;
    position: relative;
  }
  .tab {
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: var(--md-sys-typescale-label-medium-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    color: var(--md-sys-color-on-surface-variant);
    background: transparent;
    border: none;
    position: relative;
    transition: color 0.2s ease;
    cursor: pointer;
  }
  .tab::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 64px;
    height: 32px;
    border-radius: var(--md-sys-shape-corner-large);
    background: var(--md-sys-color-primary);
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  .tab.active {
    color: var(--md-sys-color-primary);
  }
  .tab.active::before {
    opacity: 0.12;
  }
  .tab .label {
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: var(--md-sys-typescale-label-small-weight);
    line-height: 1;
    position: relative;
    z-index: 1;
  }
</style>
