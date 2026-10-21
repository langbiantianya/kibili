<script>
  // 图片全屏查看器
  //
  // 动态详情页里点图片 → 这里全屏看。
  //
  // 交互:
  //   左软键 = 上一张        右软键 = 下一张        中键 = 放大
  //   ↑ ↓ ← → = 调整图片位置 (平移)
  //   放大之后软键变成: 左 = 放大    右 = 缩小    中 = 复原
  //   返回键 = 回动态详情
  //
  // 图片数组通过 URL 参数传过来:
  //   #/image-viewer?imgs=<encodeURIComponent(JSON.stringify(urls))>&i=<序号>
  // 参数里的 JSON 必须 encodeURIComponent —— 否则 URL 里的 & 和 = 会把参数切碎。
  import { onMount } from 'svelte';
  import { onKey } from '../keyboard/index.js';
  import { setSoftkeys } from '../stores/ui.js';
  import { getRouteParams } from '../router/index.js';
  import { biliImg } from '../utils/platform.js';

  /** @type {string[]} 图片地址 */
  let images = [];
  let index = 0;
  let loading = true;
  let loadError = false;

  // 原图尺寸 (决定缩放后的显示尺寸)
  let naturalW = 0;
  let naturalH = 0;

  // 缩放与平移
  const MIN_SCALE = 1;
  const MAX_SCALE = 4;
  const SCALE_STEP = 1.5;     // 每次放大/缩小的倍数
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  /** @type {HTMLElement|null} 可视区域 */
  let view = null;

  // 平移步长 (放大后一次多挪点)
  const PAN_STEP = 30;

  /**
   * 从 URL 里读图片数组和起始序号
   */
  function loadFromUrl() {
    const { params } = getRouteParams();
    let list = [];
    const raw = params.imgs;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (let i = 0; i < parsed.length; i++) {
            if (typeof parsed[i] === 'string' && parsed[i]) list.push(parsed[i]);
          }
        }
      } catch (e) {
        list = [];
      }
    }
    images = list;
    const i = parseInt(params.i, 10);
    index = isNaN(i) ? 0 : Math.max(0, Math.min(list.length - 1, i));
  }

  // 当前这张图 (biliImg 负责把协议相对地址补成 https, 0/0 = 不加缩略后缀, 用原图)
  $: currentSrc = images.length ? biliImg(images[index], 0, 0) : '';

  // 可视区域尺寸
  function viewSize() {
    const w = view ? view.clientWidth : 240;
    const h = view ? view.clientHeight : 292;
    return { w: w > 0 ? w : 240, h: h > 0 ? h : 292 };
  }

  /**
   * 缩放后图片的显示尺寸
   */
  function displaySize() {
    const v = viewSize();
    if (!naturalW || !naturalH) return { w: v.w, h: v.h };
    const h = v.w * (naturalH / naturalW) * scale;
    return { w: v.w * scale, h: h };
  }

  /**
   * 平移的合法范围 (图片比屏幕大才能挪, 小了就居中)
   */
  function panLimit() {
    const v = viewSize();
    const d = displaySize();
    return {
      x: Math.max(0, (d.w - v.w) / 2),
      y: Math.max(0, (d.h - v.h) / 2)
    };
  }

  /**
   * 把平移位置限制在合法范围内
   */
  function clampPan() {
    const l = panLimit();
    if (offsetX > l.x) offsetX = l.x;
    if (offsetX < -l.x) offsetX = -l.x;
    if (offsetY > l.y) offsetY = l.y;
    if (offsetY < -l.y) offsetY = -l.y;
  }

  /**
   * 调整图片位置
   *
   * @param {number} dx 横向
   * @param {number} dy 纵向
   */
  function pan(dx, dy) {
    const step = PAN_STEP * (scale > 1 ? scale : 1);
    offsetX += dx * step;
    offsetY += dy * step;
    clampPan();
  }

  /**
   * 放大 / 缩小
   *
   * @param {number} dir +1 放大 / -1 缩小
   */
  function zoom(dir) {
    if (dir > 0) {
      if (scale >= MAX_SCALE) return;
      scale = Math.min(MAX_SCALE, scale * SCALE_STEP);
    } else {
      if (scale <= MIN_SCALE) return;
      scale = Math.max(MIN_SCALE, scale / SCALE_STEP);
    }
    clampPan();
  }

  /**
   * 切到第 i 张
   *
   * @param {number} i
   */
  function goto(i) {
    if (i < 0 || i >= images.length) return;   // 到头不绕圈
    if (i === index) return;
    index = i;
    loading = true;
    loadError = false;
    naturalW = 0;
    naturalH = 0;
    scale = 1;
    offsetX = 0;
    offsetY = 0;
  }

  function onImgLoad(e) {
    loading = false;
    const img = e && e.target;
    if (img) {
      naturalW = img.naturalWidth || 0;
      naturalH = img.naturalHeight || 0;
    }
    clampPan();
  }

  function onImgError() {
    loading = false;
    loadError = true;
  }

  onMount(() => {
    loadFromUrl();
    // 软键文案跟着状态走:
    //   没放大 → 左=上一张 右=下一张 中=放大
    //   放大了 → 左=放大   右=缩小   中=复原
    return onKey('image-viewer', {
      Left: () => pan(-1, 0),
      Right: () => pan(+1, 0),
      Up: () => pan(0, -1),
      Down: () => pan(0, +1),
      Enter: () => {
        if (scale > MIN_SCALE) {
          // 已放大 → 中键复原
          scale = MIN_SCALE;
          offsetX = 0;
          offsetY = 0;
        } else {
          zoom(+1);
        }
      },
      SoftLeft: () => {
        if (scale > MIN_SCALE) zoom(+1);
        else goto(index - 1);
      },
      SoftRight: () => {
        if (scale > MIN_SCALE) zoom(-1);
        else goto(index + 1);
      }
    }, { priority: 10, softkeys: true });
  });

  // 软键文案
  $: {
    const zoomed = scale > MIN_SCALE;
    const left = zoomed ? '放大' : (images.length > 1 ? '上一张' : '');
    const right = zoomed ? '缩小' : (images.length > 1 ? '下一张' : '');
    const center = zoomed ? '复原' : '放大';
    setSoftkeys(left, right, center);
  }
</script>

<div class="viewer">
  {#if !images.length}
    <div class="msg">没有图片</div>
  {:else}
    <div class="counter">{index + 1}/{images.length}</div>
    <div class="view" bind:this={view}>
      <div class="canvas"
           style="transform: translate(-50%, -50%) translate({offsetX}px, {offsetY}px);">
        <img class="full-img" src={currentSrc} alt=""
             style="transform: scale({scale});"
             on:load={onImgLoad} on:error={onImgError} />
      </div>
      {#if loading}
        <div class="loading">加载中...</div>
      {:else if loadError}
        <div class="loading err">图片加载失败</div>
      {/if}
    </div>
    <div class="hint">
      {#if scale > MIN_SCALE}
        方向键移动 · 中键复原
      {:else}
        方向键移动 · OK 放大
      {/if}
    </div>
  {/if}
</div>

<style>
  /*
    不用 position:fixed —— 固定定位会盖住底下的软键栏,
    而这个页面的软键提示(上一张/下一张/放大)是要给用户看的。
    路由内容区已经是 flex:1 (320 - 28 软键栏), 这里铺满就行。
  */
  .viewer {
    position: relative;
    width: 100%;
    height: 100%;
    background: #000;
    overflow: hidden;
  }

  .view {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  /*
    图片居中, 用 translate 平移 + scale 缩放。
    两层分开做 (外层平移, 内层缩放), 不用 transform 的多函数组合 ——
    Gecko 48 对组合 transform 的支持不如分开稳妥。
  */
  .canvas {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100%;
  }
  .full-img {
    width: 100%;
    height: auto;
    display: block;
    transform-origin: center center;
  }

  /* 计数 (浮在图片上) */
  .counter {
    position: absolute;
    top: 2px;
    right: 6px;
    padding: 1px 6px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 12px;
    border-radius: 10px;
    z-index: 2;
  }

  /* 底部提示 */
  .hint {
    position: absolute;
    bottom: 2px;
    left: 0;
    width: 100%;
    text-align: center;
    color: rgba(255, 255, 255, 0.75);
    font-size: 11px;
    text-shadow: 0 0 3px #000;
    z-index: 2;
    pointer-events: none;
  }

  .loading {
    position: absolute;
    top: 50%;
    left: 0;
    width: 100%;
    margin-top: -20px;
    text-align: center;
    color: #fff;
    font-size: 14px;
    z-index: 2;
  }
  .loading.err {
    color: #ff8a8a;
  }

  .msg {
    padding-top: 120px;
    text-align: center;
    color: #fff;
    font-size: 14px;
  }
</style>
