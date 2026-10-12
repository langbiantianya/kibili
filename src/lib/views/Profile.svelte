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
    // 已登录则刷新用户信息
    if ($isLogin) {
      hydrateFromNav();
    }
    onKey("profile", {
      ArrowDown: () => moveFocus(+1),
      ArrowUp: () => moveFocus(-1),
      SoftLeft: () => activateFocused(),
      SoftRight: () => onLogoutClick()
    });
  });

  // 软键随登录状态变化 (登录/登出后立即更新, 不用重进页面)
  $: setSoftkeys("打开", $isLogin ? "登出" : "登录");

  onDestroy(() => {
    offKey("profile");
    clearTimeout(logoutTimer);
  });

  $: visibleMenuItems = [
    { key: "history", label: "历史记录", action: () => navigate("/history") },
    {
      key: "favorites",
      label: "我的收藏",
      action: () => navigate("/favorites"),
    },
    { key: "settings", label: "设置", action: () => navigate("/settings") },
    { key: "about", label: "关于", action: () => navigate("/about") },
    ...($isLogin
      ? [{ key: "logout", label: "登出", action: () => onLogoutClick() }]
      : []),
  ];

  // 登出: 需要连续按两次 (第一次提示, 3 秒内再按一次才执行)。
  // 不用 confirm(): KaiOS 的系统确认框是嵌套事件循环, 一次误按/随后任意按键就可能直接确认登出。
  let logoutArmed = false;
  /** @type {any} */
  let logoutTimer = null;

  function onLogoutClick() {
    if (!$isLogin) {
      navigate("/login");
      return;
    }
    if (!logoutArmed) {
      logoutArmed = true;
      showToast("再按一次登出", 3000);
      clearTimeout(logoutTimer);
      logoutTimer = setTimeout(() => { logoutArmed = false; }, 3000);
      return;
    }
    clearTimeout(logoutTimer);
    logoutArmed = false;
    userLogout();
    showToast("已退出");
  }

  function onUserCardClick() {
    if ($isLogin) {
      showToast("用户主页开发中");
      return;
    }
    navigate("/login");
  }
</script>

<div class="screen">
  <div class="main scroll-y">
    <div
      class="user-card"
      data-navable
      tabindex="0"
      role="button"
      on:click={() => onUserCardClick()}
      on:keydown={(e) => {
        if (e.key === "Enter") { e.stopPropagation(); onUserCardClick(); }
      }}
    >
      <div class="avatar">
        {#if $isLogin && $user.face}
          <img src={$user.face} alt="" />
        {:else}
          <div class="avatar-placeholder">●</div>
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
            if (e.key === "Enter") { e.stopPropagation(); m.action(); }
          }}
        >
          <span class="label">{m.label}</span>
          <span class="arrow">›</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .user-card {
    background: var(--md-sys-color-surface);
    padding: 8px 12px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    display: flex;
    align-items: center;
    /* gap: 8px; Firefox 48 不支持 flex gap */
    transition: background 0.15s ease;
    cursor: pointer;
  }
  .user-card .avatar {
    margin-right: 8px;
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
    font-size: var(--md-sys-typescale-body-large-size);
  }
  .version {
    text-align: center;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-outline);
    margin-top: 12px;
    padding: 8px;
  }
</style>
