<script>
  // @ts-ignore
  export let video = {};
  export let index = 0;
  /**
   * 列表层补来的统计 (播放量 + 点赞数)
   *
   * 投稿列表 (x/space/arc/search) 的 vlist 不给点赞数, 历史记录连播放量都没有,
   * 而 B 站也没有批量查的接口。列表层在焦点落到某张卡时才去查, 查完通过这个
   * prop 传回来 (见 components/FeedList.svelte)。
   */
  export let statOverride = undefined;
  import { formatDuration, formatCount } from '../utils/format.js';
  import { biliImg } from '../utils/platform.js';
  import { matchKey } from '../keyboard/keys.js';
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  $: dur = typeof video.duration === 'number'
    ? formatDuration(video.duration)
    : (video.duration || '');
  $: cover = biliImg(video.pic, 80, 60, 'jpg');

  // 视频统计取值 (三个列表统一成 stat: { play, like }, 见 api/videocard.js)
  //   推荐流:  stat.play = stat.view (数字), stat.like ✓
  //   动态流:  stat.play = "275.7万" (字符串), stat.like = 动态的 module_stat.like.count
  //   投稿列表: stat.play = v.play (数字), stat.like = null (没有, 要另外查)
  $: archiveStat = video.stat || {};
  // 播放量: 接口自带 > 兼容老数据的 stat.view > 列表层补来的
  // null = 还没查到 (显示占位), 0 是真的 0 播放
  $: playText = (() => {
    let v = null;
    if (archiveStat.play != null) v = archiveStat.play;
    else if (archiveStat.view != null) v = archiveStat.view;
    else if (statOverride && statOverride.play != null) v = statOverride.play;
    if (v == null) return '—';
    if (typeof v === 'number') return formatCount(v);
    if (typeof v === 'string' && v) {
      // 已格式化的字符串(含中文如"1.1万")直接显示
      if (/[^\d.]/.test(v)) return v;
      // 纯数字字符串转 number 后 formatCount
      return formatCount(Number(v));
    }
    return '0';
  })();
  // 点赞: 接口自带 > 列表层补来的 > 兼容老数据的 moduleStat.like
  // null = 还没查到 (显示占位), 0 是真的没人赞
  $: likeText = (() => {
    let v = null;
    if (archiveStat.like != null) v = archiveStat.like;
    else if (statOverride && statOverride.like != null) v = statOverride.like;
    else if (video.moduleStat && video.moduleStat.like != null) v = video.moduleStat.like;
    return v == null ? '—' : formatCount(v);
  })();

  // 卡片拿到焦点 → 如果还缺点赞数, 让列表层去查一个
  // (焦点驱动: 用户 D-pad 走到哪张卡才查哪张, 不会一上来就打一整页的请求)
  function onFocus() {
    if (archiveStat.like != null) return;
    if (statOverride && statOverride.like != null) return;
    if (!video.bvid) return;
    dispatch('needstat', { bvid: video.bvid });
  }
</script>

<div
  class="feed-card"
  data-navable
  tabindex="0"
  on:focus={onFocus}
  on:click={() => dispatch('play', video)}
  on:keydown={(e) => {
    // 中键 (Enter) 激活交给按键总线统一处理 (activateFocused → el.click()),
    // 这里不再自己处理, 否则会重复触发 on:click。
    // 只保留方向键的默认行为拦截 (卡片所在容器 overflow-x:hidden, 但保险起见)
    if (matchKey(e, 'Left') || matchKey(e, 'Right')) {
      e.preventDefault();
    }
  }}
>
  <div class="cover">
    <!-- 部分接口 (如历史记录) 不返回封面, 没有 pic 时不要渲染空 img (会变成坏图) -->
    {#if cover}<img src={cover} alt="" loading="lazy" />{/if}
    {#if dur}<span class="dur">{dur}</span>{/if}
  </div>
  <div class="info">
    <div class="title">{video.title || ''}</div>
    <div class="meta">
      {#if video.owner}<span class="up">{video.owner.name}</span>{/if}
    </div>
    <!-- 统计: 只显示播放量和点赞量 (三个列表统一) -->
    <div class="stat-row">
      <span class="stat-item"><span>▶</span><span>{playText}</span></span>
      <span class="stat-item"><span>❤</span><span>{likeText}</span></span>
    </div>
  </div>
</div>

<style>
  .feed-card {
    display: flex;
    min-height: 48px;
    padding: 6px 8px;
    /* gap: 6px; Firefox 48 不支持 flex gap */
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    align-items: center;
    transition: background 0.15s ease;
    cursor: pointer;
  }
  .feed-card .cover {
    margin-right: 6px;
  }
  .feed-card:focus,
  .feed-card:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .cover {
    width: 64px;
    height: 40px;
    flex-shrink: 0;
    position: relative;
    background: var(--md-sys-color-surface-container);
    overflow: hidden;
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .dur {
    position: absolute;
    right: 2px;
    bottom: 2px;
    background: rgba(32, 26, 27, 0.8);
    color: var(--md-sys-color-on-primary);
    font-size: var(--md-sys-typescale-label-small-size);
    padding: 1px 3px;
    font-weight: var(--md-sys-typescale-label-small-weight);
    border-radius: var(--md-sys-shape-corner-extra-small);
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    /* gap: 2px; Firefox 48 不支持 flex gap */
  }
  .info .title {
    margin-bottom: 2px;
  }
  .title {
    font-size: var(--md-sys-typescale-body-large-size);
    color: var(--md-sys-color-on-surface);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    /* Gecko 48 不支持 -webkit-line-clamp, max-height 兜底 (2 行) */
    max-height: 2.6em;
    font-weight: var(--md-sys-typescale-body-large-weight);
  }
  .meta {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    display: flex;
    /* gap: 4px; Firefox 48 不支持 flex gap */
    align-items: center;
    min-width: 0;
  }
  .meta .up {
    margin-right: 4px;
    /* 长 UP 名不得撑破 240px 行宽 */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .up {
    color: var(--md-sys-color-primary);
    font-weight: var(--md-sys-typescale-label-medium-weight);
  }
  .stat-row {
    display: flex;
    /* gap: 10px; Firefox 48 不支持 flex gap */
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .stat-row .stat-item {
    margin-right: 10px;
  }
  .stat-row .stat-item:last-child {
    margin-right: 0;
  }
  .stat-item {
    display: flex;
    align-items: center;
    /* gap: 2px; Firefox 48 不支持 flex gap */
  }
  .stat-item > * + * {
    margin-left: 2px;
  }
</style>
