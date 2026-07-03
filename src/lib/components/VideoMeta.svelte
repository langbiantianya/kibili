<script>
  import { stripHtml, formatCount } from '../utils/format.js';
  export let meta = null;
</script>

{#if meta}
  <div class="meta">
    <h2 class="title">{meta.title}</h2>
    <div class="up">
      {#if meta.owner}
        <span class="name">{meta.owner.name}</span>
        <span class="mid">UID {meta.owner.mid}</span>
      {/if}
    </div>
    <div class="stats">
      {#if meta.stat}
        <span>▶ {formatCount(meta.stat.view || 0)}</span>
        <span>💬 {formatCount(meta.stat.reply || 0)}</span>
        <span>👍 {formatCount(meta.stat.like || 0)}</span>
        <span>🪙 {formatCount(meta.stat.coin || 0)}</span>
        <span>⭐ {formatCount(meta.stat.favorite || 0)}</span>
        <span>↗ {formatCount(meta.stat.share || 0)}</span>
      {/if}
    </div>
    <div class="time">
      时长 {Math.floor((meta.duration || 0) / 60)}:{('' + ((meta.duration || 0) % 60)).padStart(2, '0')}
      {#if meta.pubdate}
        · {new Date(meta.pubdate * 1000).toLocaleDateString()}
      {/if}
    </div>
    {#if meta.desc}
      <div class="desc">{stripHtml(meta.desc)}</div>
    {/if}
  </div>
{/if}

<style>
  .meta {
    padding: 12px 16px;
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  .title {
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    color: var(--md-sys-color-on-surface);
    margin-bottom: 8px;
    line-height: 1.4;
  }
  .up {
    font-size: var(--md-sys-typescale-body-medium-size);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name {
    color: var(--md-sys-color-primary);
    font-weight: 500;
  }
  .mid {
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--md-sys-typescale-body-small-size);
  }
  .stats {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-bottom: 8px;
  }
  .time {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-bottom: 8px;
  }
  .desc {
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.5;
    max-height: 80px;
    overflow: hidden;
  }
</style>
