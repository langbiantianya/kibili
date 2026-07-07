<script>
  import { onMount, onDestroy } from 'svelte';
  import { history as histStore, refreshHistory } from '../stores/history.js';
  import { setIndex } from '../stores/queue.js';
  import { navigate } from '../router/index.js';
  import { onKey, offKey, moveFocus } from '../keyboard/index.js';
  import { setSoftkeys, showToast } from '../stores/ui.js';
  import Loading from '../components/Loading.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { isLogin } from '../stores/user.js';
  import { formatCount, relativeTime } from '../utils/format.js';

  let loading = true;

  async function load() {
    loading = true;
    await refreshHistory();
    loading = false;
  }

  function playItem(item) {
    setIndex(0);
    // 把这一项作为单元素 queue, 跳到 player
    import('../stores/queue.js').then(({ queue }) => {
      queue.set({ items: [{ ...item }], index: 0, source: 'history', label: '历史记录' });
      navigate('/player?bvid=' + item.bvid);
    });
  }

  onMount(() => {
    setSoftkeys('刷新', '返回');
    load();
    onKey('history', {
      ArrowDown: () => moveFocus(+1),
      ArrowUp: () => moveFocus(-1),
      '0': () => load()
    });
  });

  onDestroy(() => {
    offKey('history');
  });
</script>

<div class="screen">
  <div class="main">
    {#if loading}
      <Loading message="加载历史记录..." />
    {:else if !$isLogin}
      <EmptyState message="登录后查看历史记录" hint="仅显示本地缓存" />
    {:else if $histStore.items.length === 0}
      <EmptyState message="暂无历史记录" />
    {:else}
      <div class="hist-list scroll-y">
        {#each $histStore.items as v, i (v.bvid || i)}
          <div
            class="hist-item"
            data-navable
            tabindex="0"
            on:click={() => playItem(v)}
            on:keydown={(e) => { if (e.key === 'Enter') playItem(v); }}
          >
            <div class="title">{v.title || ''}</div>
            <div class="meta">
              {#if v.owner}<span class="up">{v.owner.name}</span>{/if}
              {#if v.viewAt}<span class="time">· {relativeTime(v.viewAt / 1000)}</span>{/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .hist-list {
    height: 100%;
  }
  .hist-item {
    min-height: 36px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    display: flex;
    flex-direction: column;
    justify-content: center;
    transition: background 0.15s ease;
    cursor: pointer;
  }
  .hist-item:focus,
  .hist-item:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .title {
    font-size: var(--md-sys-typescale-body-large-size);
    color: var(--md-sys-color-on-surface);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: var(--md-sys-typescale-body-large-weight);
  }
  .meta {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-top: 1px;
    display: flex;
    /* gap: 4px; Firefox 48 不支持 flex gap */
  }
  .meta .up {
    margin-right: 4px;
  }
  .up {
    color: var(--md-sys-color-primary);
  }
  .time {
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
