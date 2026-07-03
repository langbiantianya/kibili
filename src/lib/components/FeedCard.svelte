<script>
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
      {#if video.stat}<span class="stat">▶ {formatCount(video.stat.view || 0)}</span>{/if}
    </div>
  </div>
</div>

<style>
  .card {
    display: flex;
    min-height: 48px;
    padding: 4px 8px;
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
    border-radius: var(--md-sys-shape-corner-small);
    overflow: hidden;
    box-shadow: var(--md-sys-elevation-level1);
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
    border-radius: var(--md-sys-shape-corner-extra-small);
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
  .stat {
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
