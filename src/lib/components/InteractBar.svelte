<script>
  import { createEventDispatcher } from 'svelte';
  import { formatCount } from '../utils/format.js';
  import { isLogin } from '../stores/user.js';

  export let status = { like: 0, coin: 0, fav: 0 };
  export let counts = { like: 0, coin: 0, fav: 0 };
  export let loading = { like: false, coin: false, fav: false };

  const dispatch = createEventDispatcher();

  function act(kind) {
    if (!$isLogin) {
      dispatch('needlogin');
      return;
    }
    dispatch(kind);
  }
</script>

<div class="interact-bar">
  <button
    class="btn"
    class:active={status.like}
    class:loading={loading.like}
    data-navable
    on:click={() => act('like')}
  >
    <span class="icon">👍</span>
    <span class="label">{status.like ? '已赞' : '点赞'}</span>
    <span class="count">{formatCount(counts.like)}</span>
  </button>
  <button
    class="btn"
    class:active={status.coin}
    class:loading={loading.coin}
    data-navable
    on:click={() => act('coin')}
  >
    <span class="icon">🪙</span>
    <span class="label">{status.coin ? '已投' : '投币'}</span>
    <span class="count">{formatCount(counts.coin)}</span>
  </button>
  <button
    class="btn"
    class:active={status.fav}
    class:loading={loading.fav}
    data-navable
    on:click={() => act('fav')}
  >
    <span class="icon">⭐</span>
    <span class="label">{status.fav ? '已藏' : '收藏'}</span>
    <span class="count">{formatCount(counts.fav)}</span>
  </button>
</div>

<style>
  .interact-bar {
    display: flex;
    height: 48px;
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  .btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: none;
    border: none;
    border-right: 1px solid var(--md-sys-color-outline-variant);
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--md-sys-typescale-label-large-size);
    font-weight: var(--md-sys-typescale-label-large-weight);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    position: relative;
  }
  .btn:last-child { border-right: none; }
  .btn:focus {
    outline: none;
  }
  .btn.active {
    color: var(--md-sys-color-primary);
    background: var(--md-sys-color-primary-container);
  }
  .btn.loading {
    opacity: 0.5;
  }
  .icon { font-size: 14px; }
  .label { font-size: var(--md-sys-typescale-label-large-size); }
  .count {
    font-size: var(--md-sys-typescale-label-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .btn.active .count {
    color: var(--md-sys-color-primary);
  }
</style>
