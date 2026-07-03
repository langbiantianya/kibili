<script>
  export let replies = [];
  import { stripHtml, relativeTime, formatCount } from '../utils/format.js';
  import EmptyState from './EmptyState.svelte';
</script>

<div class="replies">
  <div class="header">评论 ({replies.length})</div>
  {#if replies.length === 0}
    <EmptyState message="还没有评论" />
  {:else}
    {#each replies as r (r.rpid)}
      <div class="reply">
        <div class="author">
          <span class="name">{r.member && r.member.uname}</span>
          <span class="time">{relativeTime((r.ctime || 0) * 1000 / 1000)}</span>
        </div>
        <div class="content">{stripHtml(r.content && r.content.message) || '(无内容)'}</div>
        <div class="stat">
          <span>👍 {formatCount(r.like || 0)}</span>
          {#if r.reply_count > 0}<span>↩ {r.reply_count}</span>{/if}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .replies {
    height: 100%;
    overflow-y: auto;
    background: var(--md-sys-color-surface-bright);
  }
  .header {
    padding: 8px 16px;
    font-size: var(--md-sys-typescale-label-large-size);
    font-weight: var(--md-sys-typescale-label-large-weight);
    color: var(--md-sys-color-primary);
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    position: sticky;
    top: 0;
  }
  .reply {
    padding: 10px 16px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    font-size: var(--md-sys-typescale-body-medium-size);
  }
  .author {
    display: flex;
    justify-content: space-between;
    font-size: var(--md-sys-typescale-body-small-size);
    margin-bottom: 4px;
  }
  .name {
    color: var(--md-sys-color-primary);
    font-weight: 500;
  }
  .time {
    color: var(--md-sys-color-on-surface-variant);
  }
  .content {
    color: var(--md-sys-color-on-surface);
    line-height: 1.4;
    margin-bottom: 4px;
  }
  .stat {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    display: flex;
    gap: 8px;
  }
</style>
