<script>
  import { onMount, tick } from 'svelte';
  import { isLogin } from '../stores/user.js';
  import { queue } from '../stores/queue.js';
  import { navigate } from '../router/index.js';
  import { onKey, roam, getFocusables, focusAt, focusFirst } from '../keyboard/index.js';
  import { setSoftkeys } from '../stores/ui.js';
  import { following, followingFocus, resetFollowingData, loadFollowing } from '../stores/following.js';
  import TabBar from '../components/TabBar.svelte';
  import FeedList from '../components/FeedList.svelte';
  import DynamicList from '../components/DynamicList.svelte';
  import Loading from '../components/Loading.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  const tabs = [
    { key: 'video',   label: '视频' },
    { key: 'dynamic', label: '动态' }
  ];
  // 数据、分页游标、加载状态全在 store 里 (见 stores/following.js):
  // 组件销毁也不丢 —— 返回本页时直接用缓存, 不重新发请求。
  // 这里不建本地别名, 一律直接读 $following.*, 保证读到的是最新值。
  //
  // 焦点位置在 followingFocus 里 (每个 tab 记一个序号),
  // 焦点由**本页独占**: FeedList 的自动聚焦在这里是关掉的 (autoFocus={false}),
  // 否则两边抢焦点, 会出现"焦点刚设好又被拉回第一条"。

  // 列表容器 (视频流是 .feed-list, 动态流是 .dyn-list)
  let mainEl = null;

  /** 当前 tab 的缓存键 */
  function tabKey() {
    return $following.activeTab === 0 ? 'video' : 'dynamic';
  }

  /** 当前列表容器 */
  function listRoot() {
    return mainEl ? mainEl.querySelector('.feed-list, .dyn-list') : null;
  }

  /**
   * 页面上现在有没有焦点
   *
   * body / html 视为"没有焦点" —— 换页回来时旧页面被卸载,
   * 焦点会掉回 body, 这正是我们要恢复焦点的时机。
   */
  function hasFocusSomewhere() {
    const a = document.activeElement;
    return !!(a && a !== document.body && a !== document.documentElement);
  }


  function playVideo(v) {
    const list = $following.videos;
    const idx = list.findIndex(x => x.bvid === v.bvid);
    // 将 Following 视频列表写入 queue，而非沿用首页推荐的 queue
    queue.set({ items: [...list], index: idx >= 0 ? idx : 0, source: 'following', label: '关注·视频' });
    navigate('/player?bvid=' + v.bvid);
  }

  // 打开动态详情
  // 新协议 id_str (web 端) 或旧协议 dynamic_id (vc 端)
  function openDynamicDetail(d) {
    const id = d.id_str || (d.desc && d.desc.dynamic_id);
    if (id) {
      navigate('/dynamic-detail?id=' + id);
    }
  }

  // 打开动态作者的主页
  function openUserPage(mid) {
    if (!mid) return;
    navigate('/user?uid=' + mid);
  }

  /**
   * 切 tab
   *
   * - tab 记在 store 里 (跨页面保留)
   * - **只有没有缓存时才拉数据**: 返回本页时列表已经在缓存里, 不重复请求
   * - 焦点放回这个 tab 上次看的那一条
   */
  function changeTab(i) {
    if ($following.activeTab !== i) {
      following.update(s => ({ ...s, activeTab: i }));
    }
    if (i === 0 && $following.videos.length === 0) loadFollowing(0);
    if (i === 1 && $following.dynamics.length === 0) loadFollowing(1);
    // 切回某个 tab 时把焦点放回刚才看的那一条
    restoreFocus();
  }

  /** 手动刷新当前 tab (左软键 / 数字键 0) */
  function refreshCurrent() {
    // 清缓存重拉; 焦点位置一起作废 (刷新后回到最上面)
    resetFollowingData($following.activeTab);
    loadFollowing($following.activeTab);
  }

  /**
   * 焦点落在列表第几条 → 记下来
   *
   * Gecko 48 没有 focusin 事件, 用捕获阶段的 focus 事件代替
   * (按键框架的 installKeyboard 也是这么做的)。
   */
  function onFocusCapture(e) {
    const root = listRoot();
    if (!root || !root.contains(e.target)) return;
    const list = getFocusables(root);
    const i = list.indexOf(e.target);
    if (i >= 0) followingFocus[tabKey()] = i;
  }

  /**
   * 把焦点放回上次的位置
   *
   * 规则 (顺序很重要):
   * 1. 列表还没渲染出来 (还在 loading) → 什么都不做, 等数据到了再调
   * 2. 页面上已经有焦点 (用户在标签栏/别的控件上) → 不抢
   * 3. 记过位置 → 放回那一条; 没记过 → 第一条
   */
  async function restoreFocus() {
    await tick();
    const root = listRoot();
    if (!root) return;
    if (!getFocusables(root).length) return;
    if (hasFocusSomewhere()) return;
    const idx = followingFocus[tabKey()];
    if (idx >= 0 && focusAt(root, idx)) return;
    focusFirst(root);
  }

  // 列表内容变了 (数据到了 / 翻页追加了) → 把焦点放回该放的位置。
  // 依赖写在参数里, 只是为了告诉 Svelte "这两个长度变了就重跑"。
  $: restoreFocus($following.videos.length, $following.dynamics.length);

  // 软键标签随登录状态变化 (登录/登出后立即更新, 不用重进页面)
  // 左软键: 未登录=登录, 已登录=刷新; 右软键: 切Tab
  // 中间: 中键 (OK) 的作用提示 —— 打开当前选中的视频/动态
  $: setSoftkeys($isLogin ? '刷新' : '登录', '切Tab', $isLogin ? '打开' : '');

  onMount(() => {
    // 恢复上次的 tab (默认「视频」); 有缓存就不重新拉
    changeTab($following.activeTab);
    // 记住焦点落在第几条
    window.addEventListener('focus', onFocusCapture, true);
    // onKey() 返回注销函数 → 组件销毁时自动注销
    const off = onKey('following', {
      // 向下漫游到列表末尾时加载下一页 (roam 的 onEdge 在"没能移动"时触发)
      Down: () => roam(+1, () => loadFollowing($following.activeTab, true)),
      Up: () => roam(-1),
      SoftLeft: () => {
        if ($isLogin) {
          // 已登录: 刷新当前 Tab (只有手动刷新才重新拉数据)
          refreshCurrent();
        } else {
          // 未登录: 跳转登录页
          navigate('/login');
        }
      },
      SoftRight: () => changeTab($following.activeTab === 0 ? 1 : 0),
      // 数字键 0: 重新加载当前 Tab
      // (loadFollowing 是往数组尾部追加的, 必须先清空分页状态再加载,
      //  否则整个列表会被追加一份重复的)
      '0': () => refreshCurrent(),
    }, { softkeys: true });
    return () => {
      window.removeEventListener('focus', onFocusCapture, true);
      off();
    };
  });
</script>

<div class="screen">
  <TabBar {tabs} active={$following.activeTab} on:change={(e) => changeTab(e.detail)} />

  <div class="main" bind:this={mainEl}>
    {#if !$isLogin}
      <EmptyState message="登录后查看关注" hint="按 左软键 登录" />
    {:else if $following.activeTab === 0}
      {#if $following.videoLoading && $following.videos.length === 0}
        <Loading message="加载中..." />
      {:else if $following.videoError}
        <EmptyState message={$following.videoError} />
      {:else}
        <!-- autoFocus={false}: 焦点由本页统一管 (见 restoreFocus) -->
        <FeedList items={$following.videos} loadingMore={$following.videoLoadingMore} autoFocus={false} on:play={(e) => playVideo(e.detail)} />
      {/if}
    {:else}
      <!-- 动态列表 (和用户主页共用): 头部点作者名进作者主页, 正文点进动态详情 -->
      <DynamicList
        items={$following.dynamics}
        loading={$following.dynLoading}
        loadingMore={$following.dynLoadingMore}
        error={$following.dynError}
        empty="暂无动态"
        on:open={(e) => openDynamicDetail(e.detail)}
        on:author={(e) => openUserPage(e.detail)}
      />
    {/if}
  </div>
</div>
