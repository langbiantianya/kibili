<script>
  import { onMount, onDestroy } from "svelte";
  import { isLogin } from "../stores/user.js";
  import FeedList from "../components/FeedList.svelte";
  import Loading from "../components/Loading.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import { loadFeed, loadMoreFeed, setIndex } from "../stores/queue.js";
  import { navigate } from "../router/index.js";
  import { onKey, offKey, moveFocus } from "../keyboard/index.js";
  import { setSoftkeys, showToast } from "../stores/ui.js";

  let items = [];
  let loading = true;
  let loadingMore = false;
  let error = "";
  let hasMore = true;

  async function load() {
    if (!$isLogin) {
      error = "请先登录";
      loading = false;
      return;
    }
    loading = true;
    error = "";
    try {
      await loadFeed();
      // loadFeed 写入 queue; 这里也从队列读取
      const { queue } = await import("../stores/queue.js");
      const unsubscribe = queue.subscribe((q) => (items = q.items));
      unsubscribe();
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
      const { queue } = await import("../stores/queue.js");
      const unsubscribe = queue.subscribe((q) => (items = q.items));
      unsubscribe();
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
    load();
  }

  // 滚动到末尾时加载更多
  function onMoveFocus(delta) {
    const moved = moveFocus(delta);
    if (!moved && delta > 0) {
      // 向下滚动到末尾, 加载下一页
      loadMore();
    }
    return moved;
  }

  onMount(() => {
    // 左软键: 未登录=登录, 已登录=刷新; 右软键: 已登录=搜索
    const leftLabel = $isLogin ? "刷新" : "登录";
    const rightLabel = $isLogin ? "搜索" : "";
    const centerLabel = $isLogin ? "打开" : "";
    setSoftkeys(leftLabel, rightLabel, centerLabel);
    load();
    onKey("home", {
      ArrowDown: () => onMoveFocus(+1),
      ArrowUp: () => onMoveFocus(-1),
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
          console.log("搜索");
        }
      },
    });
  });

  onDestroy(() => {
    offKey("home");
  });
</script>

<div class="screen">
  <div class="main">
    {#if !$isLogin}
      <EmptyState message="登录后查看推荐" hint="按 左软键 登录" />
    {:else if loading && items.length === 0}
      <Loading message="加载中..." />
    {:else if error}
      <EmptyState message="加载失败" hint={error + " · 按 左软键 重试"} />
    {:else}
      {#if loadingMore}
        <div class="loading-top">
          <div class="spinner-small"></div>
          <span>加载中...</span>
        </div>
      {/if}
      <FeedList {items} on:play={(e) => playVideo(e.detail)} />
    {/if}
  </div>
</div>
