<script>
  import { onMount, onDestroy } from "svelte";
  import { user, isLogin, userLogout, hydrateFromNav } from "../stores/user.js";
  import { navigate } from "../router/index.js";
  import {
    onKey,
    offKey,
    moveFocus,
    activateFocused,
  } from "../keyboard/index.js";
  import { setSoftkeys, showToast } from "../stores/ui.js";

  onMount(() => {
    setSoftkeys("操作", "登录");
    // 已登录则刷新用户信息
    if ($isLogin) {
      hydrateFromNav();
    }
    onKey("profile", {
      ArrowDown: () => moveFocus(+1),
      ArrowUp: () => moveFocus(-1),
      Enter: () => activateFocused(),
    });
  });

  onDestroy(() => {
    offKey("profile");
  });

  $: visibleMenuItems = [
    { key: "history", label: "历史记录", action: () => navigate("#/history") },
    {
      key: "favorites",
      label: "我的收藏",
      action: () => navigate("#/favorites"),
    },
    ...($isLogin ? [{ key: "logout", label: "登出", action: () => onLogoutClick() }] : []),
  ];

  function onLogoutClick() {
    if (confirm("确定要退出登录吗?")) {
      userLogout();
      showToast("已退出");
    }
  }
</script>

<div class="screen">
  <div class="main scroll-y">
    <div
      class="user-card"
      data-navable
      tabindex="0"
      role="button"
      on:click={() => navigate("#/login")}
      on:keydown={(e) => {
        if (e.key === "Enter") navigate("#/login");
      }}
    >
      <div class="avatar">
        {#if $isLogin && $user.face}
          <img src={$user.face} alt="" />
        {:else}
          <div class="avatar-placeholder">👤</div>
        {/if}
      </div>
      <div class="user-info">
        {#if $isLogin}
          <div class="name">{$user.name || "已登录"}</div>
          <div class="mid">UID: {$user.mid}</div>
        {:else}
          <div class="name">未登录</div>
          <div class="mid">点击登录</div>
        {/if}
      </div>
    </div>

    <div class="menu">
      {#each visibleMenuItems as m}
        <div
          class="menu-item"
          data-navable
          tabindex="0"
          on:click={() => m.action()}
          on:keydown={(e) => {
            if (e.key === "Enter") m.action();
          }}
        >
          <span class="label">{m.label}</span>
          <span class="arrow">›</span>
        </div>
      {/each}
    </div>

    <div class="version">v1.0.0 · KaiOS 2.4</div>
  </div>
</div>

<style>
  .user-card {
    background: var(--md-sys-color-surface);
    padding: 8px 12px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background 0.15s ease;
    cursor: pointer;
  }
  .user-card:focus,
  .user-card:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .avatar {
    width: 32px;
    height: 32px;
    border-radius: var(--md-sys-shape-corner-full);
    overflow: hidden;
    flex-shrink: 0;
    background: var(--md-sys-color-primary-container);
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: var(--md-sys-color-on-primary-container);
  }
  .name {
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    color: var(--md-sys-color-on-surface);
  }
  .mid {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-top: 1px;
  }
  .menu {
    background: var(--md-sys-color-surface);
    margin-top: 4px;
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
  .arrow {
    color: var(--md-sys-color-on-surface-variant);
    font-size: 14px;
  }
  .version {
    text-align: center;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-outline);
    margin-top: 12px;
    padding: 8px;
  }
</style>
