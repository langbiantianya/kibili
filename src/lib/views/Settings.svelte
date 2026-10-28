<script>
  import { onMount } from "svelte";
  import { onKey, moveFocus } from "../keyboard/index.js";
  import { showToast } from "../stores/ui.js";
  import { settings, DEFAULT_CACHE_LIMIT_MB } from "../stores/settings.js";
  import { cacheInfo } from "../player/cache.js";
  import { clearAudioCache } from "../player/engine.js";
  import { navigate } from "../router/index.js";

  // 分辨率选项
  const qualityOptions = [
    { label: "240P", value: 6 },
    { label: "360P", value: 16 },
    { label: "480P", value: 32 },
    { label: "720P", value: 64 }
  ];

  // 听视频的整段音频缓存上限 (MB)
  // 缓存里存的是"为了能精确快进而整段下下来的音频", 不是视频。
  const cacheLimitOptions = [
    { label: "10MB", value: 10 },
    { label: "25MB", value: 25 },
    { label: "50MB", value: 50 },
    { label: "100MB", value: 100 },
    { label: "200MB", value: 200 }
  ];

  let selectedQuality = $settings.quality || 16;
  let showDropdown = false;
  let selectedCacheLimit = $settings.cacheLimit || DEFAULT_CACHE_LIMIT_MB;
  let showCacheDropdown = false;

  function toggleDropdown() {
    showDropdown = !showDropdown;
    showCacheDropdown = false;
  }

  function selectQuality(option) {
    selectedQuality = option.value;
    settings.update(s => ({ ...s, quality: option.value }));
    showToast(`已设置为 ${option.label}`);
    showDropdown = false;
  }

  function toggleCacheDropdown() {
    showCacheDropdown = !showCacheDropdown;
    showDropdown = false;
  }

  function selectCacheLimit(option) {
    selectedCacheLimit = option.value;
    settings.update(s => ({ ...s, cacheLimit: option.value }));
    showToast(`听视频缓存上限: ${option.label}`);
    showCacheDropdown = false;
  }

  // 缓存现在占了多少 (设置页右边那一栏显示)
  $: cacheSizeText = $cacheInfo.count
    ? fmtMB($cacheInfo.size) + " / " + fmtMB($cacheInfo.limit)
    : "空";

  function fmtMB(bytes) {
    const mb = (bytes || 0) / 1024 / 1024;
    if (mb >= 10) return Math.round(mb) + "MB";
    return (Math.round(mb * 10) / 10) + "MB";
  }

  // 清缓存: 正在播的那首不清 (它正被媒体元素用着, revoke 掉声音会断)
  function clearCacheNow() {
    const before = $cacheInfo;
    const r = clearAudioCache();
    if (!r.count) {
      // 一首都没缓存过 / 只剩正在播的那首 (清不掉)
      showToast(before.count ? "正在播的那首没法清, 退出播放后再清" : "缓存本来就是空的");
      return;
    }
    showToast(
      "已清理 " + r.count + " 首 (" + fmtMB(r.freed) + ")" +
      ($cacheInfo.count ? ", 正在播的那首还留着" : "")
    );
  }

  // 打开视频是否立刻播放
  // 关掉的话: 打开视频不拉流也不播, 只显示封面, 按中键(播放)才真的加载
  function toggleAutoPlay() {
    const cur = $settings.autoPlay !== false;
    settings.update(s => ({ ...s, autoPlay: !cur }));
    showToast(!cur ? '已开启: 打开视频立刻播放' : '已关闭: 只显示封面, 按中键播放');
  }

  // 全屏播放要不要显示**软键栏** (沉浸模式)
  // 关掉的话: 全屏把整条软键栏藏起来, 但二级菜单照常能按右软键打开
  //         (藏的是那一行提示, 不是菜单)
  function toggleFullscreenMenu() {
    const cur = $settings.fullscreenMenu !== false;
    settings.update(s => ({ ...s, fullscreenMenu: !cur }));
    showToast(!cur ? '已开启: 全屏显示软键栏' : '已关闭: 全屏隐藏软键栏');
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
      <!-- 听视频缓存限制: 整段音频缓存 (为了能精确快进而下的那一份) 的总上限 -->
      <div class="menu-item" data-navable tabindex="0" on:click={toggleCacheDropdown}>
        <span class="label">听视频缓存限制</span>
        <span class="value">{cacheLimitOptions.find(c => c.value === selectedCacheLimit)?.label || '50MB'}</span>
      </div>
      {#if showCacheDropdown}
        <div class="dropdown">
          {#each cacheLimitOptions as option}
            <div
              class="dropdown-item"
              class:selected={option.value === selectedCacheLimit}
              data-navable
              tabindex="0"
              on:click={() => selectCacheLimit(option)}
            >
              <span class="dropdown-label">{option.label}</span>
              {#if option.value === selectedCacheLimit}
                <span class="check">✓</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
      <!-- 清理听视频缓存: 整段缓存的音频 (为了精确快进而下的那一份) -->
      <div class="menu-item" data-navable tabindex="0" on:click={clearCacheNow}>
        <span class="label">清理听视频缓存</span>
        <span class="value">{cacheSizeText}</span>
      </div>
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
      <!-- 全屏播放显示软键栏: 关掉则整条软键栏藏起来 (菜单仍可按右软键打开) -->
      <div class="menu-item" data-navable tabindex="0" on:click={toggleFullscreenMenu}>
        <span class="label">全屏播放显示软键栏</span>
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
