<script>
  // 用户主页
  //
  // 路由: #/user?uid=123456 —— 带上 uid 就加载那个人的主页;
  // 自己的主页 (uid = 登录用户的 mid) 和别人的主页走的是同一套代码。
  //
  // 三个 tab:
  //   资料  个人资料 (名片 + 空间详细信息)
  //   投稿  该用户的投稿视频 (wbi 签名接口)
  //   动态  该用户的动态
  //
  // 数据/分页/加载状态全在 store 里 (见 stores/userpage.js), 按 uid 分开缓存,
  // 组件销毁也不丢 —— 从动态作者名点进别人的主页、再返回, 数据和焦点都还在。
  import { onMount, tick } from 'svelte';
  import { querystring } from 'svelte-spa-router';
  import { getQueryParams, navigate } from '../router/index.js';
  import { onKey, roam, getFocusables, focusAt, focusFirst } from '../keyboard/index.js';
  import { setSoftkeys } from '../stores/ui.js';
  import { queue } from '../stores/queue.js';
  import {
    userPage, userPageFocus, switchUser, loadUserTab, loadUserVideos,
    loadUserDynamics, setUserTab, refreshUserTab
  } from '../stores/userpage.js';
  import TabBar from '../components/TabBar.svelte';
  import FeedList from '../components/FeedList.svelte';
  import DynamicList from '../components/DynamicList.svelte';
  import Loading from '../components/Loading.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { formatCount } from '../utils/format.js';

  const tabs = [
    { key: 'profile', label: '资料' },
    { key: 'video',   label: '投稿' },
    { key: 'dynamic', label: '动态' }
  ];

  let mainEl = null;
  /** 已经切换到的 uid (用来判断路由里的 uid 变了没有) */
  let currentUid = 0;

  // 路由里的 uid
  // 用 svelte-spa-router 的 querystring store, 这样**同一个路由换 uid** 也能感知到
  // (从 A 的主页点进 B 的主页时, 组件不会被重建, onMount 不会再跑)
  $: routeUid = Number(getQueryParams($querystring).uid) || 0;

  // 换人: 把当前这份存进缓存, 新的人有缓存就用缓存, 没有就拉一遍
  $: if (routeUid && routeUid !== currentUid) {
    currentUid = routeUid;
    switchUser(routeUid);
    loadUserTab(routeUid, $userPage.activeTab);
  }

  /** 当前 tab 的缓存键 */
  function tabKey() {
    return $userPage.activeTab === 0 ? 'profile' : ($userPage.activeTab === 1 ? 'video' : 'dynamic');
  }

  /** 当前列表容器 */
  function listRoot() {
    if (!mainEl) return null;
    if ($userPage.activeTab === 0) return mainEl.querySelector('.profile-list');
    return mainEl.querySelector('.feed-list, .dyn-list');
  }

  /**
   * 页面上现在有没有焦点
   * body / html 视为"没有焦点" —— 换页回来时旧页面被卸载, 焦点会掉回 body
   */
  function hasFocusSomewhere() {
    const a = document.activeElement;
    return !!(a && a !== document.body && a !== document.documentElement);
  }

  // 焦点落在列表第几条 → 记下来
  // Gecko 48 没有 focusin 事件, 用捕获阶段的 focus 事件代替
  function onFocusCapture(e) {
    const root = listRoot();
    if (!root || !root.contains(e.target)) return;
    const list = getFocusables(root);
    const i = list.indexOf(e.target);
    if (i >= 0) userPageFocus[tabKey()] = i;
  }

  /**
   * 把焦点放回上次的位置
   * 规则: 列表没渲染 → 等; 页面已有焦点 → 不抢; 记过位置 → 放回; 否则第一条
   */
  async function restoreFocus() {
    await tick();
    const root = listRoot();
    if (!root) return;
    if (!getFocusables(root).length) return;
    if (hasFocusSomewhere()) return;
    const idx = userPageFocus[tabKey()];
    if (idx >= 0 && focusAt(root, idx)) return;
    focusFirst(root);
  }

  // 列表内容变了 (数据到了 / 翻页追加了) → 把焦点放回该放的位置
  $: restoreFocus($userPage.profile, $userPage.videos.length, $userPage.dynamics.length);

  // ============ 资料 ============

  // 资料已经是拍平过的 (见 api/user.js 的 mapUserProfile):
  // 投稿数/获赞数这类统计在名片响应的**顶层**, 字段路径都在 API 层处理好了
  $: info = $userPage.profile;

  /** 资料 tab 的行 (空的行不显示) */
  $: infoRows = info ? [
    { label: '签名', value: info.sign || '这个人很懒，什么都没写' },
    { label: '认证', value: info.official },
    { label: '性别', value: info.sex },
    { label: '生日', value: info.birthday },
    { label: 'UID', value: String(info.uid) },
    { label: '关注', value: formatCount(info.attention) },
    { label: '粉丝', value: formatCount(info.fans) },
    // 名片里没有投稿数时, 退回用投稿 tab 的分页总数
    { label: '投稿', value: formatCount(info.archive || $userPage.videoCount) },
    { label: '获赞', value: formatCount(info.likeNum) }
  ].filter(r => r.value) : [];

  // ============ 交互 ============

  /** 切 tab */
  async function changeTab(i) {
    await setUserTab(i);
    restoreFocus();
  }

  /** 往下翻到底了 → 加载下一页 */
  function loadMore() {
    if ($userPage.activeTab === 1) {
      loadUserVideos($userPage.uid, true);
    } else if ($userPage.activeTab === 2) {
      loadUserDynamics($userPage.uid, true);
    }
  }

  /** 播放投稿视频 */
  function playVideo(v) {
    const list = $userPage.videos;
    const idx = list.findIndex(x => x.bvid === v.bvid);
    queue.set({
      items: [...list],
      index: idx >= 0 ? idx : 0,
      source: 'user',
      label: '投稿'
    });
    navigate('/player?bvid=' + v.bvid);
  }

  /** 打开动态详情 */
  function openDynamicDetail(d) {
    const id = d.id_str || (d.desc && d.desc.dynamic_id);
    if (id) navigate('/dynamic-detail?id=' + id);
  }

  /** 打开动态作者的主页 (在用户主页里就是"去另一个人的主页") */
  function openUserPage(mid) {
    if (!mid) return;
    navigate('/user?uid=' + mid);
  }

  // 软键: 左=刷新当前 tab, 中=打开 (资料 tab 没有可打开的东西, 就不显示)
  // 切 tab 走**左右方向键** —— 右软键不占这个位置
  $: setSoftkeys('刷新', '', $userPage.activeTab === 0 ? '' : '打开');

  onMount(() => {
    // 记住焦点落在第几条
    window.addEventListener('focus', onFocusCapture, true);
    const off = onKey('user-page', {
      // 向下漫游到列表末尾时加载下一页
      Down: () => roam(+1, () => loadMore()),
      Up: () => roam(-1),
      // 左右方向键: 切 tab (到头就停, 不绕圈)
      Left: () => { if ($userPage.activeTab > 0) changeTab($userPage.activeTab - 1); },
      Right: () => { if ($userPage.activeTab < tabs.length - 1) changeTab($userPage.activeTab + 1); },
      // 左软键: 刷新当前 tab (清缓存重拉, 焦点回到最上面)
      SoftLeft: () => refreshUserTab()
    }, { softkeys: true });
    return () => {
      window.removeEventListener('focus', onFocusCapture, true);
      off();
    };
  });
</script>

<div class="screen">
  <!-- 用户资料头 -->
  <div class="user-head">
    <img class="head-face" src={info ? info.face : ''} alt="" />
    <div class="head-text">
      <div class="head-name">
        {info && info.name ? info.name : '加载中...'}
        {#if info && info.level}<span class="lv">LV{info.level}</span>{/if}
      </div>
      <div class="head-stat">
        {#if info}
          UID {info.uid} · 粉丝 {formatCount(info.fans)} · 投稿 {formatCount(info.archive || $userPage.videoCount)}
        {/if}
      </div>
    </div>
  </div>

  <TabBar {tabs} active={$userPage.activeTab} on:change={(e) => changeTab(e.detail)} />

  <div class="main" bind:this={mainEl}>
    {#if $userPage.activeTab === 0}
      {#if $userPage.profileLoading && !$userPage.profile}
        <Loading message="加载中..." />
      {:else if $userPage.profileError && !$userPage.profile}
        <EmptyState message={$userPage.profileError} />
      {:else if !info}
        <EmptyState message="没有资料" />
      {:else}
        <div class="profile-list scroll-y" data-nav-root>
          {#each infoRows as row}
            <div class="row" data-navable tabindex="0">
              <span class="label">{row.label}</span>
              <span class="value">{row.value}</span>
            </div>
          {/each}
        </div>
      {/if}
    {:else if $userPage.activeTab === 1}
      {#if $userPage.videoLoading && $userPage.videos.length === 0}
        <Loading message="加载中..." />
      {:else if $userPage.videoError && $userPage.videos.length === 0}
        <EmptyState message={$userPage.videoError} />
      {:else}
        <!-- autoFocus={false}: 焦点由本页统一管 (见 restoreFocus) -->
        <FeedList
          items={$userPage.videos}
          loadingMore={$userPage.videoLoadingMore}
          autoFocus={false}
          on:play={(e) => playVideo(e.detail)}
        />
      {/if}
    {:else}
      <DynamicList
        items={$userPage.dynamics}
        loading={$userPage.dynLoading}
        loadingMore={$userPage.dynLoadingMore}
        error={$userPage.dynError}
        empty="暂无动态"
        on:open={(e) => openDynamicDetail(e.detail)}
        on:author={(e) => openUserPage(e.detail)}
      />
    {/if}
  </div>
</div>

<style>
  /* 用户资料头 */
  .user-head {
    display: flex;
    align-items: center;
    padding: 6px 8px;
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  .head-face {
    width: 34px;
    height: 34px;
    border-radius: var(--md-sys-shape-corner-full);
    object-fit: cover;
    margin-right: 8px;
    flex-shrink: 0;
    background: var(--md-sys-color-surface-container-high);
  }
  .head-text {
    flex: 1;
    min-width: 0;
  }
  .head-name {
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    color: var(--md-sys-color-on-surface);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .head-name .lv {
    margin-left: 4px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-primary);
  }
  .head-stat {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 资料列表 */
  .profile-list {
    height: 100%;
  }
  .row {
    display: flex;
    align-items: flex-start;
    padding: 7px 10px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    transition: background 0.15s ease;
  }
  .row:focus,
  .row:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .label {
    width: 44px;
    flex-shrink: 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .value {
    flex: 1;
    min-width: 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface);
    word-break: break-all;
  }
</style>
