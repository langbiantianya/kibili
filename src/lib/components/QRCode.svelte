<script>
  import qrcode from 'qrcode-generator';

  export let text = '';
  export let cellSize = 4;       // 每个二维码"点"占多少 px
  export let margin = 2;         // 静默区
  export let dark = '#201A1B';
  export let light = '#FFFFFF';

  // 错误纠正级别: L(7%) M(15%) Q(25%) H(30%)
  export let ecl = 'M';

  $: svg = text ? render(text) : '';

  function render(t) {
    if (!t) return '';
    try {
      // typeNumber=0 表示自动选择最小能容纳的尺寸
      const qr = qrcode(0, ecl);
      qr.addData(t);
      qr.make();
      // 用 createSvgTag 输出 (KaiOS 2.4 SVG 渲染没问题)
      // 关闭内联 margin, 手动控制
      const tag = qr.createSvgTag({
        cellSize: cellSize,
        margin: margin,
        scalable: true
      });
      return tag;
    } catch (e) {
      return '<div style="color:var(--md-sys-color-error)">QR 错误: ' + e.message + '</div>';
    }
  }
</script>

<div class="qr">
  {@html svg}
</div>

<style>
  .qr {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--md-sys-color-surface);
    padding: 8px;
    width: 160px;
    height: 160px;
    margin: 0 auto;
    border-radius: var(--md-sys-shape-corner-medium);
    box-shadow: var(--md-sys-elevation-level1);
  }
  .qr :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
