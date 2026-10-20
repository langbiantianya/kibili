<script>
  import { onMount, tick } from "svelte";
  import { isLogin } from "../stores/user.js";
  import FeedList from "../components/FeedList.svelte";
  import Loading from "../components/Loading.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import { homeFeed, homeFocus, loadHomeFeed, loadMoreHomeFeed, resetHomeFeed } from "../stores/home.js";
  import { queue } from "../stores/queue.js";
  import { navigate } from "../router/index.js";
  import { onKey, roam, getFocusables, focusAt, focusFirst } from "../keyboard/index.js";
  import { setSoftkeys, showToast } from "../stores/ui.js";

  // 数据、加载状态在模块级 store 里 (见 stores/home.js):
  // 组件销毁也不丢 —— 从播放器/二级页返回时直接用缓存, 不重新发请求。
  //
  // 焦点位置在 homeFocus 里, 焦点由**本页独占**:
  // FeedList 的自动聚焦在这里是关掉的 (autoFocus={false}),
  // 否则两处抢焦点, 会出现"焦点刚设好又被拉回第一条"。

  // 列表容器
  let mainEl = null;

  /** 当前列表容器 */
  function listRoot() {
    return mainEl ? mainEl.querySelector(".feed-list") : null;
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

  function playVideo(video) {
    const list = $homeFeed.items;
    const idx = list.findIndex((x) => x.bvid === video.bvid);
    // 播放列表写进 queue (和关注页/收藏夹一样, 共用"当前播放列表")
    queue.set({
      items: [...list],
      index: idx >= 0 ? idx : 0,
      source: "feed",
      label: "推荐"
    });
    navigate("/player?bvid=" + video.bvid);
  }

  /** 手动刷新 (左软键) —— 清缓存重拉, 焦点回最上面 */
  function refresh() {
    if (!$isLogin) {
      showToast("请先登录");
      navigate("/login");
      return;
    }
    resetHomeFeed();
    loadHomeFeed();
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
    if (i >= 0) homeFocus.index = i;
  }

  /**
   * 把焦点放回上次的位置
   *
   * 规则 (顺序很重要):
   * 1. 列表还没渲染出来 (还在 loading) → 什么都不做, 等数据到了再调
   * 2. 页面上已经有焦点 (用户在顶栏/别的控件上) → 不抢
   * 3. 记过位置 → 放回那一条; 没记过 → 第一条
   */
  async function restoreFocus() {
    await tick();
    const root = listRoot();
    if (!root) return;
    if (!getFocusables(root).length) return;
    if (hasFocusSomewhere()) return;
    if (homeFocus.index >= 0 && focusAt(root, homeFocus.index)) return;
    focusFirst(root);
  }

  // 列表内容变了 (数据到了 / 翻页追加了) → 把焦点放回该放的位置。
  // 依赖写在参数里, 只是为了告诉 Svelte "这个长度变了就重跑"。
  $: restoreFocus($homeFeed.items.length);

  // 软键标签随登录状态变化 (登录/登出后立即更新, 不用重进页面)
  // 左软键: 未登录=登录, 已登录=刷新; 右软键: 已登录=搜索; 中键: 已登录=打开
  $: setSoftkeys($isLogin ? "刷新" : "登录", $isLogin ? "搜索" : "", $isLogin ? "打开" : "");

  onMount(() => {
    // **只有没有缓存时才拉**: 返回本页时列表已经在缓存里, 不重复请求
    if (!$homeFeed.items.length) loadHomeFeed();
    // 焦点放回上次看的那一条
    restoreFocus();
    // 记住焦点落在第几条
    window.addEventListener("focus", onFocusCapture, true);
    // onKey() 返回注销函数, 直接作为 onMount 的返回值 → 组件销毁时自动注销
    const off = onKey("home", {
      // 向下漫游到列表末尾时加载下一页 (roam 的 onEdge 在"没能移动"时触发)
      Down: () => roam(+1, () => loadMoreHomeFeed()),
      Up: () => roam(-1),
      SoftLeft: () => {
        if ($isLogin) {
          refresh();
        } else {
          showToast("请先登录");
          navigate("/login");
        }
      },
      SoftRight: () => {
        if ($isLogin) {
          navigate("/search");
        }
      },
    }, { softkeys: true });
    return () => {
      window.removeEventListener("focus", onFocusCapture, true);
      off();
    };
  });
</script>

<div class="screen">
  <!-- 方向键漫游区域: 焦点留在这个页面里 (FeedList 内部还有一层更近的 data-nav-root) -->
  <div class="main" data-nav-root bind:this={mainEl}>
    {#if !$isLogin}
      <EmptyState message="登录后查看推荐" hint="按 左软键 登录" />
    {:else if $homeFeed.loading && $homeFeed.items.length === 0}
      <Loading message="加载中..." />
    {:else if $homeFeed.error}
      <EmptyState message="加载失败" hint={$homeFeed.error + " · 按 左软键 重试"} />
    {:else}
      <!-- autoFocus={false}: 焦点由本页统一管 (见 restoreFocus) -->
      <FeedList items={$homeFeed.items} loadingMore={$homeFeed.loadingMore} autoFocus={false} on:play={(e) => playVideo(e.detail)} />
    {/if}
  </div>
</div>

<style>
</style>
