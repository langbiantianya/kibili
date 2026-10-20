<script>
  import { onMount } from "svelte";
  import { isLogin } from "../stores/user.js";
  import FeedList from "../components/FeedList.svelte";
  import Loading from "../components/Loading.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import { loadFeed, loadMoreFeed, setIndex, queue } from "../stores/queue.js";
  import { navigate } from "../router/index.js";
  import { onKey, roam } from "../keyboard/index.js";
  import { setSoftkeys, showToast } from "../stores/ui.js";

  let items = [];
  let loading = true;
  let loadingMore = false;
  let error = "";
  let hasMore = true;

  function syncFromQueue() {
    const unsubscribe = queue.subscribe((q) => (items = q.items));
    unsubscribe();
  }

  async function load(force = false) {
    if (!$isLogin) {
      error = "请先登录";
      loading = false;
      return;
    }
    // queue 里已有推荐流: 从播放器/子页面返回时直接复用, 不再重新拉取
    // (否则每次返回都先闪一屏"加载中..."并丢回列表顶部)
    syncFromQueue();
    if (!force && items.length) {
      loading = false;
      error = "";
      return;
    }
    loading = true;
    error = "";
    try {
      await loadFeed();
      // loadFeed 写入 queue; 这里也从队列读取
      syncFromQueue();
      hasMore = true;
    } catch (e) {
      error = e.message || "加载失败";
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    try {
      const gotMore = await loadMoreFeed();
      if (!gotMore) hasMore = false;
      syncFromQueue();
    } catch (e) {
      // 加载更多失败, 静默处理
    } finally {
      loadingMore = false;
    }
  }

  function playVideo(video) {
    const idx = items.findIndex((x) => x.bvid === video.bvid);
    if (idx >= 0) setIndex(idx);
    navigate("/player?bvid=" + video.bvid);
  }

  function refresh() {
    if (!$isLogin) {
      showToast("请先登录");
      navigate("/login");
      return;
    }
    load(true);
  }

  // 软键标签随登录状态变化 (登录/登出后立即更新, 不用重进页面)
  // 左软键: 未登录=登录, 已登录=刷新; 右软键: 已登录=搜索; 中键: 已登录=打开
  $: setSoftkeys($isLogin ? "刷新" : "登录", $isLogin ? "搜索" : "", $isLogin ? "打开" : "");

  onMount(() => {
    load();
    // onKey() 返回注销函数, 直接作为 onMount 的返回值 → 组件销毁时自动注销
    return onKey("home", {
      // 向下漫游到列表末尾时加载下一页 (roam 的 onEdge 在"没能移动"时触发)
      Down: () => roam(+1, () => loadMore()),
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
    });
  });
</script>

<div class="screen">
  <!-- 方向键漫游区域: 焦点留在这个页面里 (FeedList 内部还有一层更近的 data-nav-root) -->
  <div class="main" data-nav-root>
    {#if !$isLogin}
      <EmptyState message="登录后查看推荐" hint="按 左软键 登录" />
    {:else if loading && items.length === 0}
      <Loading message="加载中..." />
    {:else if error}
      <EmptyState message="加载失败" hint={error + " · 按 左软键 重试"} />
    {:else}
      <FeedList {items} loadingMore={loadingMore} on:play={(e) => playVideo(e.detail)} />
    {/if}
  </div>
</div>

<style>
</style>
