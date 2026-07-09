<script>
  import { onMount, onDestroy } from "svelte";
  import { onKey, offKey, moveFocus } from "../keyboard/index.js";
  import { setSoftkeys } from "../stores/ui.js";

  const version = "0.0.1a";
  const githubUrl = "https://github.com/langbiantianya/kibili";
  const bilibiliSpaceUrl = "https://space.bilibili.com/29529884";
  const issuesUrl = "https://github.com/langbiantianya/kibili/issues";

  const links = [
    { icon: "📦", label: "项目仓库", url: githubUrl },
    { icon: "👤", label: "开发者", url: bilibiliSpaceUrl },
    { icon: "🐛", label: "问题反馈", url: issuesUrl },
  ];

  function openUrl(/** @type {string} */ url) {
    window.open(url, "_blank");
  }

  onMount(() => {
    setSoftkeys("", "", "");
    onKey("about", {
      ArrowDown: () => moveFocus(+1),
      ArrowUp: () => moveFocus(-1),
      Enter: () => {
        const el = document.querySelector('[data-navable]:focus');
        if (el) (/** @type {HTMLElement} */(el)).click();
      },
    });
  });

  onDestroy(() => {
    offKey("about");
  });
</script>

<div class="screen">
  <div class="main scroll-y">
    <!-- 头部信息 -->
    <div class="hero">
      <div class="logo-wrap">
        <div class="logo">📺</div>
      </div>
      <div class="app-name">哔哩哔哩</div>
      <div class="version">版本 {version}</div>
    </div>

    <!-- 简介 -->
    <div class="card-filled info-card">
      <p>为 KaiOS 设备开发的第三方哔哩哔哩客户端</p>
      <p>仅供学习交流，不涉及商业用途</p>
    </div>

    <!-- 链接列表 -->
    <div class="link-list">
      {#each links as l}
        <div
          class="link-item"
          data-navable
          tabindex="0"
          role="button"
          on:click={() => openUrl(l.url)}
          on:keydown={(e) => { if (e.key === 'Enter') openUrl(l.url); }}
        >
          <span class="link-icon">{l.icon}</span>
          <span class="link-label">{l.label}</span>
          <span class="link-arrow">›</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  /* ---- Hero 区域 ---- */
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 12px 12px;
    text-align: center;
  }
  .logo-wrap {
    width: 56px;
    height: 56px;
    border-radius: var(--md-sys-shape-corner-large);
    background: var(--md-sys-color-primary-container);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
  }
  .logo {
    font-size: 28px;
    line-height: 1;
  }
  .app-name {
    font-size: var(--md-sys-typescale-title-large-size);
    font-weight: var(--md-sys-typescale-title-large-weight);
    color: var(--md-sys-color-on-surface);
  }
  .version {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-top: 2px;
  }

  /* ---- 简介卡片 ---- */
  .info-card {
    margin: 4px 12px 8px;
    padding: 10px 12px;
    text-align: center;
  }
  .info-card p {
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.5;
    margin: 2px 0;
  }

  /* ---- 链接列表 ---- */
  .link-list {
    background: var(--md-sys-color-surface);
    margin: 0 12px;
    border-radius: var(--md-sys-shape-corner-medium);
    overflow: hidden;
  }
  .link-item {
    display: flex;
    align-items: center;
    min-height: 40px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    transition: background 0.15s ease;
    cursor: pointer;
  }
  .link-item:last-child {
    border-bottom: none;
  }
  .link-item:focus,
  .link-item:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .link-icon {
    font-size: 16px;
    width: 24px;
    text-align: center;
    flex-shrink: 0;
    margin-right: 8px;
  }
  .link-label {
    flex: 1;
    font-size: var(--md-sys-typescale-body-large-size);
    color: var(--md-sys-color-on-surface);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .link-arrow {
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--md-sys-typescale-body-large-size);
    flex-shrink: 0;
    margin-left: 4px;
  }
</style>
