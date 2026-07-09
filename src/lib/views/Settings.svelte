<script>
  import { onMount, onDestroy } from "svelte";
  import { onKey, offKey, moveFocus } from "../keyboard/index.js";
  import { setSoftkeys, showToast } from "../stores/ui.js";
  import { settings } from "../stores/settings.js";

  // 分辨率选项
  const qualityOptions = [
    { label: "240P", value: 6 },
    { label: "360P", value: 16 },
    { label: "480P", value: 32 },
    { label: "720P", value: 64 }
  ];

  let selectedQuality = $settings.quality || 16;
  let showDropdown = false;

  function toggleDropdown() {
    showDropdown = !showDropdown;
  }

  function selectQuality(option) {
    selectedQuality = option.value;
    settings.update(s => ({ ...s, quality: option.value }));
    showToast(`已设置为 ${option.label}`);
    showDropdown = false;
  }

  onMount(() => {
    setSoftkeys("", "", "");
    onKey("settings", {
      ArrowDown: () => moveFocus(+1),
      ArrowUp: () => moveFocus(-1)
    });
  });

  onDestroy(() => {
    offKey("settings");
  });
</script>

<div class="screen">
  <div class="main scroll-y">
    <div class="settings-title">设置</div>
    <div class="menu">
      <!-- 全屏默认分辨率 -->
      <div class="menu-item" data-navable tabindex="0" on:click={toggleDropdown} on:keydown={(e) => { if (e.key === 'Enter') toggleDropdown(); }}>
        <span class="label">全屏默认分辨率</span>
        <span class="value">{qualityOptions.find(q => q.value === selectedQuality)?.label || '360P'}</span>
      </div>
      {#if showDropdown}
        <div class="dropdown">
          {#each qualityOptions as option}
            <div
              class="dropdown-item"
              class:selected={option.value === selectedQuality}
              data-navable
              tabindex="0"
              on:click={() => selectQuality(option)}
              on:keydown={(e) => { if (e.key === 'Enter') selectQuality(option); }}
            >
              <span class="dropdown-label">{option.label}</span>
              {#if option.value === selectedQuality}
                <span class="check">✓</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .settings-title {
    padding: 12px;
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    color: var(--md-sys-color-on-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  .menu {
    background: var(--md-sys-color-surface);
  }
  .menu-item {
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 12px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    transition: background 0.15s ease;
    cursor: pointer;
  }
  .menu-item:focus,
  .menu-item:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .label {
    font-size: var(--md-sys-typescale-body-large-size);
    color: var(--md-sys-color-on-surface);
  }
  .value {
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-primary);
    font-weight: var(--md-sys-typescale-label-medium-weight);
  }
  .dropdown {
    background: var(--md-sys-color-surface-container-low);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px 6px 24px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .dropdown-item:last-child {
    border-bottom: none;
  }
  .dropdown-item:focus,
  .dropdown-item:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .dropdown-item.selected {
    color: var(--md-sys-color-primary);
  }
  .dropdown-label {
    font-size: var(--md-sys-typescale-body-large-size);
  }
  .check {
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
  }
</style>
