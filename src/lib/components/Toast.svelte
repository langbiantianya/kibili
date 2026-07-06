<script>
  import { ui } from '../stores/ui.js';
</script>

{#if $ui.toast}
  <div class="toast">{$ui.toast}</div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--md-sys-color-inverse-surface);
    color: var(--md-sys-color-inverse-on-surface);
    padding: 14px 16px;
    border-radius: var(--md-sys-shape-corner-small);
    font-size: var(--md-sys-typescale-body-medium-size);
    box-shadow: var(--md-sys-elevation-level3);
    z-index: 1000;
    min-width: 200px;
    max-width: 90vw;
    text-align: center;
  }
</style>
