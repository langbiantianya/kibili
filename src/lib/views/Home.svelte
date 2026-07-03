<script>
  import { onMount, onDestroy } from 'svelte';
  import FeedList from '../components/FeedList.svelte';
  import Loading from '../components/Loading.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { getRecommend } from '../api/feed.js';
  import { loadFeed, setIndex } from '../stores/queue.js';
  import { navigate } from '../router/index.js';
  import { onKey, offKey, moveFocus } from '../keyboard/index.js';
  import { setSoftkeys } from '../stores/ui.js';

  let items = [];
  let loading = true;
  let error = '';

  async function load() {
    loading = true;
    error = '';
    try {
      await loadFeed();
      // loadFeed 写入 queue; 这里也从队列读取
      const { queue } = await import('../stores/queue.js');
      const unsubscribe = queue.subscribe(q => items = q.items);
      unsubscribe();
    } catch (e) {
      error = e.message || '加载失败';
    } finally {
      loading = false;
    }
  }

  function playVideo(video) {
    const idx = items.findIndex(x => x.bvid === video.bvid);
    if (idx >= 0) setIndex(idx);
    navigate('#/player');
  }

  function refresh() {
    load();
  }

  onMount(() => {
    setSoftkeys('刷新', '搜索');
    load();
    onKey('home', {
      ArrowDown: () => moveFocus(+1),
      ArrowUp: () => moveFocus(-1),
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
    {#if loading}
      <Loading message="正在加载推荐..." />
    {:else if error}
      <EmptyState message="加载失败" hint={error + ' · 按 0 键重试'} />
    {:else}
      <FeedList {items} on:play={(e) => playVideo(e.detail)} />
    {/if}
  </div>
</div>
