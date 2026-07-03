<script>
  import { onMount, onDestroy } from 'svelte';
  import { loadFolder } from '../stores/queue.js';
  import { navigate, getRouteParams } from '../router/index.js';
  import { onKey, offKey, moveFocus } from '../keyboard/index.js';
  import { setSoftkeys, showToast } from '../stores/ui.js';
  import FeedList from '../components/FeedList.svelte';
  import Loading from '../components/Loading.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { queue, setIndex } from '../stores/queue.js';

  let items = [];
  let loading = true;
  let fid = '';
  let title = '收藏夹';
  let count = 0;

  async function load() {
    loading = true;
    const params = getRouteParams();
    fid = params.params.fid || params.params.media_id || '';
    title = params.params.title || '收藏夹';
    if (!fid) {
      loading = false;
      return;
    }
    try {
      count = await loadFolder(fid, title);
      const unsub = queue.subscribe(q => items = q.items);
      unsub();
    } catch (e) {
      showToast('加载失败: ' + e.message);
    } finally {
      loading = false;
    }
  }

  function playVideo(v) {
    const idx = items.findIndex(x => x.bvid === v.bvid);
    if (idx >= 0) setIndex(idx);
    navigate('#/player');
  }

  function playAll() {
    if (items.length === 0) return;
    setIndex(0);
    navigate('#/player');
  }

  onMount(() => {
    setSoftkeys('全部播放', '返回');
    load();
    onKey('folder', {
      ArrowDown: () => moveFocus(+1),
      ArrowUp: () => moveFocus(-1),
      '5': () => playAll(),
      SoftLeft: () => playAll(),
      '0': () => load()
    });
  });

  onDestroy(() => {
    offKey('folder');
  });
</script>

<div class="screen">
  <div class="main">
    {#if loading}
      <Loading message="加载中..." />
    {:else if items.length === 0}
      <EmptyState message="收藏夹为空" />
    {:else}
      <FeedList {items} on:play={(e) => playVideo(e.detail)} />
    {/if}
  </div>
</div>
