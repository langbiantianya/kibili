<script>
  export let message = '暂无数据';
  export let hint = '';
</script>

<div class="empty">
  <div class="icon">📭</div>
  <p class="title">{message}</p>
  {#if hint}<p class="hint">{hint}</p>{/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 24px;
    text-align: center;
    color: var(--md-sys-color-on-surface-variant);
    min-height: 200px;
  }
  .icon {
    font-size: 48px;
    margin-bottom: 12px;
    opacity: 0.6;
  }
  .title {
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    color: var(--md-sys-color-on-surface);
    margin-bottom: 8px;
  }
  .hint {
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
