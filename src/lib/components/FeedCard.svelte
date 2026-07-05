<script>
  // @ts-ignore
  export let video = {};
  export let index = 0;
  import { formatDuration, formatCount } from '../utils/format.js';
  import { biliImg } from '../utils/platform.js';
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  $: dur = typeof video.duration === 'number'
    ? formatDuration(video.duration)
    : (video.duration || '');
  $: cover = biliImg(video.pic, 80, 60, 'jpg');

  // 视频统计取值:
  // 推荐feed: stat.view(number) / stat.like(number) / stat.danmaku(number)，无 moduleStat
  // 动态feed: stat.play(str，可能"1.1万") / moduleStat.like/forward/comment(number)
  $: archiveStat = video.stat || {};
  $: moduleStat = video.moduleStat || {};
  // 播放量: 优先 stat.play(str/number)，其次 stat.view(number)
  $: rawPlay = archiveStat.play || archiveStat.view || 0;
  $: playDisplay = (() => {
    if (typeof rawPlay === 'number') return formatCount(rawPlay);
    if (typeof rawPlay === 'string' && rawPlay) {
      // 已格式化的字符串(含中文如"1.1万")直接显示
      if (/[^\d.]/.test(rawPlay)) return rawPlay;
      // 纯数字字符串转 number 后 formatCount
      return formatCount(Number(rawPlay));
    }
    return '0';
  })();
  // 点赞: 优先 stat.like(推荐feed)，其次 moduleStat.like(动态feed)
  $: likeCount = archiveStat.like || moduleStat.like || 0;
  // 转发/评论: 仅动态feed的moduleStat有
  $: forwardCount = moduleStat.forward || 0;
  $: commentCount = moduleStat.comment || 0;
</script>

<div
  class="card"
  data-navable
  tabindex="0"
  on:click={() => dispatch('play', video)}
  on:keydown={(e) => { if (e.key === 'Enter') dispatch('play', video); }}
>
  <div class="cover">
    <img src={cover} alt="" loading="lazy" />
    {#if dur}<span class="dur">{dur}</span>{/if}
  </div>
  <div class="info">
    <div class="title">{video.title || ''}</div>
    <div class="meta">
      {#if video.owner}<span class="up">{video.owner.name}</span>{/if}
    </div>
    <!-- 点赞/播放/转发/评论统计 -->
    <div class="stat-row">
      <span class="stat-item">▶ {playDisplay}</span>
      <span class="stat-item">❤ {formatCount(likeCount)}</span>
      {#if forwardCount}<span class="stat-item">↗ {formatCount(forwardCount)}</span>{/if}
      {#if commentCount}<span class="stat-item">💬 {formatCount(commentCount)}</span>{/if}
    </div>
  </div>
</div>

<style>
  .card {
    display: flex;
    min-height: 48px;
    padding: 6px 8px;
    gap: 6px;
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    align-items: center;
    transition: background 0.15s ease;
    cursor: pointer;
  }
  .card:focus,
  .card:hover {
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
    font-size: 8px;
    padding: 1px 3px;
    font-weight: 500;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }
  .title {
    font-size: var(--md-sys-typescale-body-large-size);
    color: var(--md-sys-color-on-surface);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-weight: var(--md-sys-typescale-body-large-weight);
  }
  .meta {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .up {
    color: var(--md-sys-color-primary);
    font-weight: 500;
  }
  .stat-row {
    display: flex;
    gap: 10px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .stat-item {
    display: flex;
    align-items: center;
    gap: 2px;
  }
</style>
