<script>
  export let message = '加载中...';
</script>

<div class="loading-more">
  <div class="spinner-small"></div>
  <span>{message}</span>
</div>

<style>
  .loading-more {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    background: var(--md-sys-color-surface-container);
  }
  .loading-more > * + * {
    margin-left: 8px;
  }
  .spinner-small {
    width: 16px;
    height: 16px;
    border: 2px solid var(--md-sys-color-outline-variant);
    border-top-color: var(--md-sys-color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
