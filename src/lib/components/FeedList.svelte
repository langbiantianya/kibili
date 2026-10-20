<script>
  export let items = [];
  export let empty = '暂无内容';
  export let loadingMore = false;
  import FeedCard from './FeedCard.svelte';
  import EmptyState from './EmptyState.svelte';
  import LoadingMore from './LoadingMore.svelte';
  import { createEventDispatcher } from 'svelte';
  import { tick } from 'svelte';
  import { focusFirst } from '../keyboard/roving.js';

  const dispatch = createEventDispatcher();

  /** 列表容器 (同时是方向键漫游的区域边界) */
  let listEl = null;

  /** 是否已经自动聚焦过一次 */
  let autoFocused = false;

  // ── 自动聚焦修复 ─────────────────────────────────────────────────────
  // 旧实现在 onMount 里调 focusFirst(), 但列表数据是异步拉取的:
  // onMount 时 items 还是空数组, 条件不成立 → 焦点永远不会落到列表上,
  // 用户必须先按一次方向键才知道自己在哪。
  // 现在改成"数据到位后再聚焦", 并且只在当前没有焦点时才抢焦点
  // (从子页面返回时保持原来的位置)。
  $: if (listEl && items.length && !autoFocused) {
    autoFocused = true;
    tick().then(() => {
      const active = document.activeElement;
      // 已经有焦点在列表里 (或焦点在别的可导航元素上) 就不抢
      if (active && active !== document.body && listEl.contains(active)) return;
      focusFirst(listEl);
    });
  }
</script>

<div class="feed-list scroll-y" bind:this={listEl} data-nav-root>
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
