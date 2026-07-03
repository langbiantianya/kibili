<script>
  export let items = [];
  export let empty = '暂无内容';
  import FeedCard from './FeedCard.svelte';
  import EmptyState from './EmptyState.svelte';
  import Loading from './Loading.svelte';
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
  {/if}
</div>

<style>
  .feed-list {
    width: 100%;
    height: 100%;
  }
</style>
