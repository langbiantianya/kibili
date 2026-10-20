<script>
  export let items = [];
  export let empty = '暂无内容';
  export let loadingMore = false;
  /**
   * 数据到位后要不要自动聚焦第一条
   *
   * 关注页要自己管焦点 (记住并恢复上次看的那一条), 那里传 false,
   * 否则两处抢焦点, 会出现"刚设好又被拉回第一条"。
   */
  export let autoFocus = true;
  import FeedCard from './FeedCard.svelte';
  import EmptyState from './EmptyState.svelte';
  import LoadingMore from './LoadingMore.svelte';
  import { createEventDispatcher } from 'svelte';
  import { tick, onDestroy } from 'svelte';
  import { focusFirst } from '../keyboard/roving.js';
  import { getVideoStat } from '../api/video.js';

  const dispatch = createEventDispatcher();

  /** 列表容器 (同时是方向键漫游的区域边界) */
  let listEl = null;

  /** 是否已经自动聚焦过一次 */
  let autoFocused = false;

  // ── 缺统计时按需补 ───────────────────────────────────────────────────
  // 投稿列表 (x/space/arc/search) 的 vlist 里没有点赞数, 历史记录连播放量都没有,
  // 而 B 站也没有批量查的接口 (archive/stats 那种端点已经没了), 只能一个一个查。
  // 所以做成**焦点驱动**: 用户的 D-pad 走到哪张卡, 才给那张卡查一个 ——
  // 一次只发一个请求, 不会一进页面就打 30 个 (流量和风控都受不了)。
  //
  /** 补来的统计: bvid -> { play, like } */
  let statMap = {};
  /** 已经查过的 bvid (别重复打接口) */
  let statReq = {};
  /** 组件销毁后不再写状态 */
  let dead = false;

  onDestroy(() => { dead = true; });

  /**
   * 卡片说"我缺点赞数" → 去查一个
   *
   * @param {CustomEvent} e e.detail.bvid
   */
  async function onNeedStat(e) {
    const bvid = e.detail && e.detail.bvid;
    if (!bvid || statReq[bvid]) return;
    statReq[bvid] = true;
    try {
      const st = await getVideoStat(bvid);
      if (dead) return;
      statMap = { ...statMap, [bvid]: st };
    } catch (err) {
      // 查失败就把标记撤掉, 下次焦点再落到它身上还能重试
      statReq[bvid] = false;
    }
  }

  // ── 自动聚焦修复 ─────────────────────────────────────────────────────
  // 旧实现在 onMount 里调 focusFirst(), 但列表数据是异步拉取的:
  // onMount 时 items 还是空数组, 条件不成立 → 焦点永远不会落到列表上,
  // 用户必须先按一次方向键才知道自己在哪。
  // 现在改成"数据到位后再聚焦", 并且只在当前没有焦点时才抢焦点
  // (从子页面返回时保持原来的位置)。
  $: if (autoFocus && listEl && items.length && !autoFocused) {
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
      <FeedCard
        video={v}
        index={i}
        statOverride={statMap[v.bvid]}
        on:play={(e) => dispatch('play', e.detail)}
        on:needstat={onNeedStat}
      />
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
