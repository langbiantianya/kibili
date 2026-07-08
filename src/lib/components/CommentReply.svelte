<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  export let placeholder = '写评论...';
  export let disabled = false;
  export let value = '';

  const dispatch = createEventDispatcher();
  /** @type {HTMLTextAreaElement} */
  let textarea;
  /** @type {HTMLDivElement} */
  let wrapper;
  let isOpen = false;

  /** 打开全屏输入 */
  export function open() {
    isOpen = true;
    document.body.classList.add('reply-modal-open');
    // 延迟聚焦，确保 DOM 已更新
    setTimeout(() => {
      if (textarea) textarea.focus();
    }, 50);
  }

  /** 关闭并清理 */
  export function close() {
    isOpen = false;
    document.body.classList.remove('reply-modal-open');
    dispatch('close');
  }

  export function clear() {
    value = '';
  }

  export function focus() {
    if (textarea) textarea.focus();
  }

  /** 处理所有按键事件，阻止冒泡 */
  function onKeydown(e) {
    // 阻止所有按键事件向外传递
    e.stopPropagation();

    // Backspace：如果输入框为空，关闭组件
    if (e.key === 'Backspace' || e.key === 'Back') {
      if (!value || value.trim() === '') {
        e.preventDefault();
        close();
        return;
      }
    }

    // SoftRight（右软键）/ Enter：发送评论（Shift+Enter 换行保留 textarea 默认行为）
    if (e.key === 'SoftRight' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      if (value && value.trim()) {
        dispatch('send', value.trim());
      }
      return;
    }

    // 拦截方向键，仅在光标位于边界时阻止事件传递（用于 textarea 内导航）
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const el = /** @type {HTMLTextAreaElement} */ (e.target);
      const selStart = el.selectionStart || 0;
      const selEnd = el.selectionEnd || 0;
      const text = el.value;

      let atBoundary = false;

      if (e.key === 'ArrowUp') {
        // 光标在第一行
        const before = text.slice(0, selStart);
        atBoundary = !before.includes('\n');
      } else if (e.key === 'ArrowDown') {
        // 光标在最后一行
        const after = text.slice(selEnd);
        atBoundary = !after.includes('\n');
      } else if (e.key === 'ArrowLeft') {
        // 光标在文本开头
        atBoundary = selStart === 0;
      } else if (e.key === 'ArrowRight') {
        // 光标在文本末尾
        atBoundary = selEnd >= text.length;
      }

      if (atBoundary) {
        e.preventDefault();
      }
    }
  }

  /** 点击遮罩层关闭 */
  /** @param {MouseEvent} e */
  function onBackdropClick(e) {
    if (e.target === wrapper) {
      close();
    }
  }

  onMount(() => {
    // 组件挂载时不自动打开，由外部通过 open() 控制
  });

  onDestroy(() => {
    document.body.classList.remove('reply-modal-open');
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div
    class="reply-modal"
    bind:this={wrapper}
    on:click={onBackdropClick}
  >
    <div class="reply-panel">
      <!-- 顶部工具栏 -->
      <div class="reply-header">
        <button class="reply-btn reply-btn-cancel" on:click={close}>
          取消
        </button>
        <span class="reply-title">发表评论</span>
        <button
          class="reply-btn reply-btn-send"
          on:click={() => {
            if (value && value.trim()) {
              dispatch('send', value.trim());
            }
          }}
          disabled={!value || !value.trim()}
        >
          发送
        </button>
      </div>

      <!-- 输入区域 -->
      <div class="reply-body">
        <textarea
          bind:this={textarea}
          {value}
          {placeholder}
          {disabled}
          on:input={(/** @type {any} */ e) => {
            value = e.target.value;
            dispatch('input', value);
          }}
          on:keydown={onKeydown}
          on:keyup={(/** @type {any} */ e) => e.stopPropagation()}
          on:keypress={(/** @type {any} */ e) => e.stopPropagation()}
        />
      </div>

      <!-- 底部提示 -->
      <div class="reply-footer">
        <span class="reply-hint">按 Enter 发送，Shift+Enter 换行</span>
        <span class="reply-hint">右软键发送，空内容按 Backspace 返回</span>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ============================================
     KaiOS / Firefox 48 兼容全屏评论回复组件
     分辨率: 240 x 320
     ============================================ */

  /* ---- 遮罩层 ---- */
  .reply-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 9999;
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-orient: vertical;
    -webkit-box-direction: normal;
    -ms-flex-direction: column;
    flex-direction: column;
    -webkit-box-pack: end;
    -ms-flex-pack: end;
    justify-content: flex-end;
    background: rgba(0, 0, 0, 0.5);
  }

  /* ---- 主面板 ---- */
  .reply-panel {
    width: 100%;
    max-height: 100%;
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-orient: vertical;
    -webkit-box-direction: normal;
    -ms-flex-direction: column;
    flex-direction: column;
    background: var(--md-sys-color-surface-container);
    border-top: 1px solid var(--md-sys-color-outline-variant);
    /* Firefox 48 不支持 backdrop-filter，使用纯色背景 */
  }

  /* ---- 顶部工具栏 ---- */
  .reply-header {
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-align: center;
    -ms-flex-align: center;
    align-items: center;
    -webkit-box-pack: justify;
    -ms-flex-pack: justify;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    -ms-flex-negative: 0;
    flex-shrink: 0;
  }

  .reply-title {
    font-size: var(--md-sys-typescale-title-small-size, 14px);
    font-weight: 500;
    color: var(--md-sys-color-on-surface);
  }

  .reply-btn {
    padding: 6px 12px;
    border: none;
    border-radius: var(--md-sys-shape-corner-medium, 8px);
    font-size: var(--md-sys-typescale-body-medium-size, 14px);
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    outline: none;
  }

  .reply-btn-cancel {
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
  }

  .reply-btn-cancel:focus,
  .reply-btn-cancel:active {
    background: var(--md-sys-color-surface-variant);
  }

  .reply-btn-send {
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
  }

  .reply-btn-send:focus,
  .reply-btn-send:active {
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
  }

  .reply-btn-send:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  /* ---- 输入区域 ---- */
  .reply-body {
    -webkit-box-flex: 1;
    -ms-flex: 1;
    flex: 1;
    min-height: 0;
    padding: 8px 12px;
    overflow: hidden;
  }

  .reply-body textarea {
    width: 100%;
    height: 100%;
    min-height: 60px;
    padding: 8px 12px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-large, 12px);
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    font-size: var(--md-sys-typescale-body-medium-size, 14px);
    line-height: 1.5;
    resize: none;
    outline: none;
    -webkit-box-sizing: border-box;
    box-sizing: border-box;
    /* Firefox 48 兼容 */
    -moz-appearance: none;
    appearance: none;
  }

  .reply-body textarea:focus {
    border-color: var(--md-sys-color-primary);
  }

  .reply-body textarea:disabled {
    opacity: 0.5;
  }

  /* ---- 底部提示 ---- */
  .reply-footer {
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-orient: vertical;
    -webkit-box-direction: normal;
    -ms-flex-direction: column;
    flex-direction: column;
    -webkit-box-align: center;
    -ms-flex-align: center;
    align-items: center;
    padding: 4px 12px 8px;
    -ms-flex-negative: 0;
    flex-shrink: 0;
  }

  .reply-hint {
    font-size: 11px;
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.4;
  }

  /* ============================================
     KaiOS 240x320 专用适配
     ============================================ */
  @media screen and (max-width: 240px) {
    .reply-header {
      padding: 6px 8px;
    }

    .reply-title {
      font-size: 13px;
    }

    .reply-btn {
      padding: 4px 8px;
      font-size: 12px;
    }

    .reply-body {
      padding: 6px 8px;
    }

    .reply-body textarea {
      padding: 6px 8px;
      font-size: 13px;
      min-height: 40px;
    }

    .reply-footer {
      padding: 2px 8px 6px;
    }

    .reply-hint {
      font-size: 10px;
    }
  }

  /* ============================================
     防止 body 滚动（当模态框打开时）
     ============================================ */
  :global(body.reply-modal-open) {
    overflow: hidden;
  }
</style>
