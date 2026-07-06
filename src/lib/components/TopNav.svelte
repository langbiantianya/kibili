<script>
  import { onMount, onDestroy } from 'svelte';
  import { location as routerLocation } from 'svelte-spa-router';
  import { navigate } from '../router/index.js';
  import { ui, setSoftkeys } from '../stores/ui.js';

  // 三 Tab: home / following / profile
  const tabs = [
    { key: 'home',      label: '首页',   path: '/home' },
    { key: 'following', label: '关注',   path: '/following' },
    { key: 'profile',   label: '我的',   path: '/profile' }
  ];

  function currentKey(/** @type {string} */ path) {
    const p = path || '/home';
    const t = tabs.find(x => p.startsWith(x.path));
    if (t) return t.key;
    if (p.startsWith('/folder') || p.startsWith('/favorites')) return 'profile';
    if (p.startsWith('/player')) return 'home';
    if (p.startsWith('/history')) return 'profile';
    if (p.startsWith('/login')) return 'profile';
    return 'home';
  }

  $: cur = currentKey($routerLocation);

  function clickTab(t) {
    navigate(t.path);
  }

  // 暴露给父组件用于程序化切换
  export function switchTab(direction) {
    const idx = tabs.findIndex(t => t.key === cur);
    const newIdx = Math.max(0, Math.min(tabs.length - 1, idx + direction));
    if (newIdx !== idx) {
      navigate(tabs[newIdx].path);
    }
  }

  export function getTabIndex() {
    return tabs.findIndex(t => t.key === cur);
  }

  export function getTabCount() {
    return tabs.length;
  }
</script>

<nav class="top-nav">
  {#each tabs as t}
    <button
      class="tab"
      class:active={cur === t.key}
      on:click={() => clickTab(t)}
    >
      <span class="label">{t.label}</span>
    </button>
  {/each}
</nav>

<style>
  .top-nav {
    height: var(--kai-top-bar-height);
    background: var(--md-sys-color-surface);
    display: flex;
    align-items: center;
    justify-content: space-around;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    z-index: 10;
    position: relative;
    flex-shrink: 0;
  }
  .tab {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--md-sys-typescale-title-small-size);
    font-weight: var(--md-sys-typescale-title-small-weight);
    color: var(--md-sys-color-on-surface-variant);
    background: transparent;
    border: none;
    position: relative;
    transition: color 0.15s ease;
    cursor: pointer;
    padding: 0;
  }
  .tab.active {
    color: var(--md-sys-color-primary);
  }
  .tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 20%;
    right: 20%;
    height: 2px;
    background: var(--md-sys-color-primary);
    border-radius: var(--md-sys-shape-corner-small);
  }
  .tab .label {
    font-size: var(--md-sys-typescale-title-small-size);
    font-weight: var(--md-sys-typescale-title-small-weight);
    line-height: 1;
    position: relative;
    z-index: 1;
  }
</style>
