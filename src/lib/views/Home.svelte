<script>
  import { onMount, onDestroy } from 'svelte';
  import FeedList from '../components/FeedList.svelte';
  import Loading from '../components/Loading.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { getRecommend } from '../api/feed.js';
  import { loadFeed, loadMoreFeed, setIndex } from '../stores/queue.js';
  import { navigate } from '../router/index.js';
  import { onKey, offKey, moveFocus } from '../keyboard/index.js';
  import { setSoftkeys } from '../stores/ui.js';

  let items = [];
  let loading = true;
  let loadingMore = false;
  let error = '';
  let hasMore = true;

  async function load() {
    loading = true;
    error = '';
    try {
      await loadFeed();
      // loadFeed 写入 queue; 这里也从队列读取
      const { queue } = await import('../stores/queue.js');
      const unsubscribe = queue.subscribe(q => items = q.items);
      unsubscribe();
      hasMore = true;
    } catch (e) {
      error = e.message || '加载失败';
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    try {
      const gotMore = await loadMoreFeed();
      if (!gotMore) hasMore = false;
      const { queue } = await import('../stores/queue.js');
      const unsubscribe = queue.subscribe(q => items = q.items);
      unsubscribe();
    } catch (e) {
      // 加载更多失败, 静默处理
    } finally {
      loadingMore = false;
    }
  }

  function playVideo(video) {
    const idx = items.findIndex(x => x.bvid === video.bvid);
    if (idx >= 0) setIndex(idx);
    navigate('#/player?bvid=' + video.bvid);
  }

  function refresh() {
    load();
  }

  // 滚动到末尾时加载更多
  function onMoveFocus(delta) {
    const moved = moveFocus(delta);
    if (!moved && delta > 0) {
      // 向下滚动到末尾, 加载下一页
      loadMore();
    }
    return moved;
  }

  onMount(() => {
    setSoftkeys('刷新', '搜索');
    load();
    onKey('home', {
      ArrowDown: () => onMoveFocus(+1),
      ArrowUp: () => onMoveFocus(-1),
      '0': () => refresh(),
      '#': () => refresh()
    });
  });

  onDestroy(() => {
    offKey('home');
  });
</script>

<div class="screen">
  <div class="main">
    {#if loading && items.length === 0}
      <Loading message="加载中..." />
    {:else if error}
      <EmptyState message="加载失败" hint={error + ' · 按 0 键重试'} />
    {:else}
      {#if loadingMore}
        <div class="loading-top">
          <div class="spinner-small"></div>
          <span>加载中...</span>
        </div>
      {/if}
      <FeedList {items} on:play={(e) => playVideo(e.detail)} />
    {/if}
  </div>
</div>

<style>
  .loading-top {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    background: var(--md-sys-color-surface-container);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  .spinner-small {
    width: 16px;
    height: 16px;
    border: 2px solid var(--md-sys-color-outline-variant);
    border-top-color: var(--md-sys-color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
