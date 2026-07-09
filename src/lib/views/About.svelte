<script>
  import { onMount, onDestroy } from "svelte";
  import { onKey, offKey, moveFocus } from "../keyboard/index.js";
  import { setSoftkeys } from "../stores/ui.js";

  const version = "0.0.1a";
  const githubUrl = "https://github.com/langbiantianya/kibili";
  const bilibiliSpaceUrl = "https://space.bilibili.com/29529884";
  const issuesUrl = "https://github.com/langbiantianya/kibili/issues";

  function openGitHub() {
    window.open(githubUrl, "_blank");
  }

  function openBiliSpace() {
    window.open(bilibiliSpaceUrl, "_blank");
  }

  function openIssues() {
    window.open(issuesUrl, "_blank");
  }

  onMount(() => {
    setSoftkeys("", "", "");
    onKey("about", {
      ArrowDown: () => moveFocus(+1),
      ArrowUp: () => moveFocus(-1),
    });
  });

  onDestroy(() => {
    offKey("about");
  });
</script>

<div class="screen">
  <div class="main scroll-y">
    <div class="about-content">
      <div class="logo">📺</div>
      <div class="app-name">哔哩哔哩</div>
      <div class="version">版本 {version}</div>
      <div class="divider"></div>
      <div class="info">
        <p>为kaios设备开发的第三方哔哩哔哩客户端</p>
        <p>仅供学习交流使用，不涉及任何商业用途</p>
      </div>
      <div class="divider"></div>
      <div class="github-section" data-navable tabindex="0" on:click={() => openGitHub()} on:keydown={(e) => { if (e.key === 'Enter') openGitHub(); }}>
        <span class="github-label">项目仓库</span>
        <span class="github-url">github.com/langbiantianya/kibili</span>
      </div>
      <div class="divider"></div>
      <div class="github-section" data-navable tabindex="0" on:click={() => openBiliSpace()} on:keydown={(e) => { if (e.key === 'Enter') openBiliSpace(); }}>
        <span class="github-label">开发者</span>
        <span class="github-url">space.bilibili.com/29529884</span>
      </div>
      <div class="divider"></div>
      <div class="github-section" data-navable tabindex="0" on:click={() => openIssues()} on:keydown={(e) => { if (e.key === 'Enter') openIssues(); }}>
        <span class="github-label">问题反馈</span>
        <span class="github-url">github.com/langbiantianya/kibili/issues</span>
      </div>
    </div>
  </div>
</div>

<style>
  .about-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px;
    text-align: center;
  }
  .logo {
    font-size: 48px;
    margin-bottom: 8px;
  }
  .app-name {
    font-size: var(--md-sys-typescale-title-large-size);
    font-weight: var(--md-sys-typescale-title-large-weight);
    color: var(--md-sys-color-on-surface);
  }
  .version {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-top: 4px;
  }
  .divider {
    width: 100%;
    height: 1px;
    background: var(--md-sys-color-outline-variant);
    margin: 16px 0;
  }
  .info {
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.6;
  }
  .info p {
    margin: 4px 0;
  }
  .github-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    transition: background 0.15s ease;
    width: 100%;
    box-sizing: border-box;
    border-radius: var(--md-sys-shape-corner-small);
  }
  .github-section:focus,
  .github-section:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .github-label {
    font-size: var(--md-sys-typescale-body-large-size);
    color: var(--md-sys-color-on-surface);
    font-weight: var(--md-sys-typescale-label-medium-weight);
  }
  .github-url {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-primary);
    margin-top: 2px;
  }
</style>
