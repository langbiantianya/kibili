<script>
  export let tabs = [];
  export let active = 0;

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  function select(i) {
    active = i;
    dispatch('change', i);
  }
</script>

<div class="tabbar">
  {#each tabs as t, i}
    <button
      class="tab"
      class:active={i === active}
      on:click={() => select(i)}
    >{t.label}</button>
  {/each}
</div>

<style>
  .tabbar {
    display: flex;
    height: var(--kai-top-bar-height);
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    padding: 2px 6px;
    /* gap: 2px; Firefox 48 不支持 flex gap */
  }
  .tabbar .tab + .tab {
    margin-left: 2px;
  }
  .tab {
    flex: 1;
    font-size: var(--md-sys-typescale-label-medium-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    color: var(--md-sys-color-on-surface-variant);
    background: none;
    border: none;
    border-radius: var(--md-sys-shape-corner-small);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    padding: 0;
  }
  .tab.active {
    color: var(--md-sys-color-primary);
    background: var(--md-sys-color-primary-container);
  }
  .tab:focus {
    outline: 1px solid var(--md-sys-color-primary);
    outline-offset: 1px;
  }
</style>
