<script>
  export let message = '暂无数据';
  export let hint = '';
</script>

<div class="empty">
  <div class="icon">📭</div>
  <p class="title">{message}</p>
  {#if hint}<p class="hint">{hint}</p>{/if}
</div>
