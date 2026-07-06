<script>
  export let item = {};
  export let index = 0;
  // 通用列表项, 焦点行
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>

<div
  class="list-item-row"
  data-navable
  tabindex="0"
  on:click={() => dispatch('activate', item)}
  on:keydown={(e) => { if (e.key === 'Enter') dispatch('activate', item); }}
>
  <div class="index">{index + 1}</div>
  <div class="content">
    <div class="title">{item.title || item.name || ''}</div>
    {#if item.subtitle}
      <div class="subtitle">{item.subtitle}</div>
    {/if}
  </div>
  {#if item.badge}
    <div class="badge">{item.badge}</div>
  {/if}
</div>

<style>
  .list-item-row {
    display: flex;
    align-items: center;
    min-height: 48px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    transition: background 0.15s ease;
    cursor: pointer;
  }
  .list-item-row:focus,
  .list-item-row:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .index {
    width: 28px;
    color: var(--md-sys-color-primary);
    font-size: var(--md-sys-typescale-label-medium-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    text-align: center;
    flex-shrink: 0;
  }
  .content {
    flex: 1;
    min-width: 0;
    padding-left: 8px;
  }
  .title {
    font-size: var(--md-sys-typescale-body-large-size);
    color: var(--md-sys-color-on-surface);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: var(--md-sys-typescale-body-large-weight);
  }
  .subtitle {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-top: 2px;
  }
  .badge {
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: var(--md-sys-typescale-label-small-weight);
    color: var(--md-sys-color-primary);
    background: var(--md-sys-color-primary-container);
    padding: 2px 8px;
    border-radius: var(--md-sys-shape-corner-full);
    flex-shrink: 0;
    margin-left: 8px;
  }
</style>
