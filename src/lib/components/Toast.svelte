<script>
  import { ui } from '../stores/ui.js';
</script>

{#if $ui.toast}
  <div class="toast">{$ui.toast}</div>
{/if}
