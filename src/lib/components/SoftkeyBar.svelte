<script>
  import { ui } from '../stores/ui.js';
</script>

<div class="softkey-bar">
  <span class="left">{$ui.softkeys.left}</span>
  <span class="center">{$ui.softkeys.center}</span>
  <span class="right">{$ui.softkeys.right}</span>
</div>

<style>
  .softkey-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 28px;
    padding: 0 12px;
    background: var(--md-sys-color-surface);
    border-top: 1px solid var(--md-sys-color-outline-variant);
    font-size: var(--md-sys-typescale-label-medium-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    color: var(--md-sys-color-on-surface-variant);
    flex-shrink: 0;
  }
  .left {
    text-align: left;
    min-width: 40px;
  }
  .center {
    text-align: center;
    min-width: 40px;
    color: var(--md-sys-color-on-surface);
  }
  .right {
    text-align: right;
    min-width: 40px;
  }
</style>
