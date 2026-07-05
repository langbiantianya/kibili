<script>
  import { createEventDispatcher } from 'svelte';
  export let placeholder = '写评论...';
  export let disabled = false;
  export let value = '';

  const dispatch = createEventDispatcher();
  let textarea;

  function onKeydown(e) {
    // 在输入框内，Enter 换行，Shift+Enter 发送
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      dispatch('send', value);
    }
  }

  function onInput(e) {
    value = e.target.value;
    dispatch('input', value);
  }

  export function clear() { value = ''; }
  export function focus() { if (textarea) textarea.focus(); }
</script>

<div class="reply-bar">
  <textarea
    bind:this={textarea}
    {value}
    {placeholder}
    {disabled}
    rows="2"
    on:input={onInput}
    on:keydown={onKeydown}
  />
</div>

<style>
  .reply-bar {
    padding: 8px 12px;
    background: var(--md-sys-color-surface-container);
    border-top: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }
  textarea {
    width: 100%;
    min-height: 40px;
    max-height: 80px;
    padding: 8px 12px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-large);
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 1.4;
    resize: none;
    outline: none;
    box-sizing: border-box;
  }
  textarea:focus {
    border-color: var(--md-sys-color-primary);
  }
  textarea:disabled {
    opacity: 0.5;
  }
</style>
