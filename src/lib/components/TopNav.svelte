<script>
  import { route, navigate } from '../router/index.js';

  // 三 Tab: home / following / profile
  const tabs = [
    { key: 'home',      label: '首页',   hash: '#/home' },
    { key: 'following', label: '关注',   hash: '#/following' },
    { key: 'profile',   label: '我的',   hash: '#/profile' }
  ];

  function currentKey(/** @type {string} */ hash) {
    const h = hash || '#/home';
    const t = tabs.find(x => h.startsWith(x.hash));
    if (t) return t.key;
    if (h.startsWith('#/folder') || h.startsWith('#/favorites')) return 'profile';
    if (h.startsWith('#/player')) return 'home';
    if (h.startsWith('#/history')) return 'profile';
    if (h.startsWith('#/login')) return 'profile';
    return 'home';
  }

  $: cur = currentKey($route);

  function clickTab(t) {
    navigate(t.hash);
  }

  // 暴露给父组件用于程序化切换
  export function switchTab(direction) {
    const idx = tabs.findIndex(t => t.key === cur);
    const newIdx = Math.max(0, Math.min(tabs.length - 1, idx + direction));
    if (newIdx !== idx) {
      navigate(tabs[newIdx].hash);
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
    height: 28px;
    background: var(--md-sys-color-surface);
    display: flex;
    align-items: center;
    justify-content: space-around;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    z-index: 10;
    position: relative;
    flex-shrink: 0;
    margin-bottom: 1px;
  }
  .tab {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 500;
    color: var(--md-sys-color-on-surface-variant);
    background: transparent;
    border: none;
    position: relative;
    transition: color 0.2s ease;
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
    border-radius: 1px;
  }
  .tab .label {
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
    position: relative;
    z-index: 1;
  }
</style>
