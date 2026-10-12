<script>
  export let items = [];
  export let empty = '暂无内容';
  export let loadingMore = false;
  import FeedCard from './FeedCard.svelte';
  import EmptyState from './EmptyState.svelte';
  import LoadingMore from './LoadingMore.svelte';
  import { createEventDispatcher } from 'svelte';
  import { onMount } from 'svelte';
  import { focusFirst } from '../keyboard/roving.js';

  const dispatch = createEventDispatcher();

  onMount(() => {
    if (items.length) setTimeout(() => focusFirst(document.querySelector('.feed-list')), 30);
  });
</script>

<div class="feed-list scroll-y">
  {#if items.length === 0}
    <EmptyState message={empty} />
  {:else}
    {#each items as v, i (v.bvid || i)}
      <FeedCard video={v} index={i} on:play={(e) => dispatch('play', e.detail)} />
    {/each}
    <!-- 加载更多放在列表末尾 (放在列表前会把正在看的内容整体下推) -->
    {#if loadingMore}<LoadingMore />{/if}
  {/if}
</div>

<style>
  .feed-list {
    width: 100%;
    height: 100%;
  }
</style>
