<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { openModalScope } from '../keyboard/modalkeys.js';

  export let placeholder = '写评论...';
  export let disabled = false;
  export let value = '';

  const dispatch = createEventDispatcher();
  /** @type {HTMLTextAreaElement} */
  let textarea;
  /** @type {HTMLDivElement} */
  let wrapper;
  let isOpen = false;

  /** 模态按键作用域的关闭函数 */
  let closeScope = null;

  /** 打开前有焦点的元素 (关闭后还回去) */
  let prevFocus = null;

  /** 打开全屏输入 */
  export function open() {
    if (isOpen) return;
    isOpen = true;
    document.body.classList.add('reply-modal-open');
    prevFocus = document.activeElement;

    // 模态独占: 打开期间只有回复框能响应按键。
    // 与旧实现的关键区别 —— 旧实现用 window 捕获阶段 + stopImmediatePropagation(),
    // 那会让 keydown 根本到不了 textarea, 退格键删不掉字;
    // 现在用 exclusive scope, 回复框没声明的按键照常传给输入框。
    closeScope = openModalScope('reply', {
      // 退格: 输入框为空时关闭 (非空时返回 false → 不拦截, 让 textarea 正常删字)
      Back: () => {
        if (!value || value.trim() === '') {
          close();
          return true;
        }
        return false;
      },
      // Smart Touch 返回键: 关闭回复框
      // (挂断键 EndCall 不在这里 —— 框架的 NEVER_INTERCEPT 会在最前面放行它,
      //  网页不能拿它当"取消", 免得用户想挂电话结果把回复框关了)
      GoBack: () => {
        close();
        return true;
      },
      // 左软键: 取消并关闭
      SoftLeft: () => {
        close();
        return true;
      },
      // 右软键 / 中键: 发送 (Shift+Enter 保留换行)
      SoftRight: () => {
        send();
        return true;
      },
      Enter: (e) => {
        if (e && e.shiftKey) return false; // Shift+Enter 换行
        send();
        return true;
      }
    }, { softkeys: ['取消', '发送'] });

    // 延迟聚焦，确保 DOM 已更新
    setTimeout(() => {
      if (textarea) textarea.focus();
    }, 50);
  }

  /** 发送评论 */
  function send() {
    if (value && value.trim()) {
      dispatch('send', value.trim());
    }
  }

  /** 关闭并清理 */
  export function close() {
    if (!isOpen) return;
    isOpen = false;
    if (closeScope) {
      closeScope();
      closeScope = null;
    }
    document.body.classList.remove('reply-modal-open');
    // 把焦点还给打开回复框之前的元素
    restoreFocus();
    dispatch('close');
  }

  export function clear() {
    value = '';
  }

  export function focus() {
    if (textarea) textarea.focus();
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
    if (closeScope) {
      closeScope();
      closeScope = null;
    }
    document.body.classList.remove('reply-modal-open');
    // 发送成功后组件是直接被销毁的 (没走 close()), 这里补一次焦点归还
    restoreFocus();
  });

  /** 把焦点还给打开回复框之前的元素 */
  function restoreFocus() {
    if (prevFocus && prevFocus.focus && document.contains(prevFocus)) {
      prevFocus.focus();
    }
    prevFocus = null;
  }
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
          on:keypress={(/** @type {any} */ e) => e.stopPropagation()}
        />
      </div>

      <!-- 底部提示 -->
      <div class="reply-footer">
        <span class="reply-hint">左软键取消，右软键发送</span>
        <span class="reply-hint">按 Enter 发送，Shift+Enter 换行</span>
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
