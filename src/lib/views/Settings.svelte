<script>
  import { onMount } from "svelte";
  import { onKey, moveFocus } from "../keyboard/index.js";
  import { showToast } from "../stores/ui.js";
  import { settings } from "../stores/settings.js";
  import { navigate } from "../router/index.js";

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

  // 打开视频是否立刻播放
  // 关掉的话: 打开视频不拉流也不播, 只显示封面, 按中键(播放)才真的加载
  function toggleAutoPlay() {
    const cur = $settings.autoPlay !== false;
    settings.update(s => ({ ...s, autoPlay: !cur }));
    showToast(!cur ? '已开启: 打开视频立刻播放' : '已关闭: 只显示封面, 按中键播放');
  }

  // 全屏播放要不要显示二级菜单 (左软键显示/隐藏)
  // 关掉的话: 全屏只剩中键的「OK键播放暂停」提示, 左软键空着, 保持沉浸
  function toggleFullscreenMenu() {
    const cur = $settings.fullscreenMenu !== false;
    settings.update(s => ({ ...s, fullscreenMenu: !cur }));
    showToast(!cur ? '已开启: 全屏显示菜单' : '已关闭: 全屏不显示菜单');
  }

  onMount(() => {
    // onKey() 返回自己的注销函数, 直接交给 onMount 的返回值 → 组件销毁时
    // 只移除"本实例"注册的作用域 (同名实例之间不会互相踩)。
    // softkeys: 作用域同时接管软键栏 (文案随作用域一起释放)。
    return onKey("settings", {
      Down: () => moveFocus(+1),
      Up: () => moveFocus(-1)
    }, { softkeys: ["", "", ""] });
  });
</script>

<div class="screen">
  <!-- data-nav-root: 方向键只在本页设置区内漫游 (菜单项 + 展开的分辨率选项) -->
  <div class="main scroll-y" data-nav-root>
    <div class="settings-title">设置</div>
    <div class="menu">
      <!-- 全屏默认分辨率 -->
      <!-- 中键 (Enter) 交给按键总线: 框架默认 click 当前焦点元素 → toggleDropdown -->
      <div class="menu-item" data-navable tabindex="0" on:click={toggleDropdown}>
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
            >
              <span class="dropdown-label">{option.label}</span>
              {#if option.value === selectedQuality}
                <span class="check">✓</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
      <!-- 按键检测: 在真机上核对实体按键与框架按键映射是否对得上 -->
      <div class="menu-item" data-navable tabindex="0" on:click={() => navigate("/keytest")}>
        <span class="label">按键检测</span>
        <span class="value">›</span>
      </div>
      <!-- 菜单测试: 在真机上试软键栏的二级/三级菜单 -->
      <div class="menu-item" data-navable tabindex="0" on:click={() => navigate("/menu-test")}>
        <span class="label">菜单测试</span>
        <span class="value">›</span>
      </div>
      <!-- 打开视频立刻播放: 关掉之后打开视频只显示封面, 按中键才加载并播放 -->
      <div class="menu-item" data-navable tabindex="0" on:click={toggleAutoPlay}>
        <span class="label">打开视频立刻播放</span>
        <span class="value">{$settings.autoPlay === false ? '关' : '开'}</span>
      </div>
      <!-- 全屏播放显示菜单: 左软键用来显示/隐藏二级菜单 (关掉则保持沉浸) -->
      <div class="menu-item" data-navable tabindex="0" on:click={toggleFullscreenMenu}>
        <span class="label">全屏播放显示菜单</span>
        <span class="value">{$settings.fullscreenMenu === false ? '关' : '开'}</span>
      </div>
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
