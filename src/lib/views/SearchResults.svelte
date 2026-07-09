<script>
  import { onMount, onDestroy } from "svelte";
  import { searchVideo } from "../api/user.js";
  import { navigate, getRouteParams } from "../router/index.js";
  import { onKey, offKey, moveFocus } from "../keyboard/index.js";
  import { setSoftkeys, showToast } from "../stores/ui.js";
  import Loading from "../components/Loading.svelte";
  import LoadingMore from "../components/LoadingMore.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import FeedList from "../components/FeedList.svelte";
  import { setIndex } from "../stores/queue.js";

  // 搜索状态
  let keyword = "";
  let searchResults = [];
  let loading = false;
  let loadingMore = false;
  let hasSearched = false;
  let error = "";
  let currentPage = 1;
  let hasMore = true;

  // 从 URL 获取搜索关键词
  function getKeywordFromUrl() {
    const { params } = getRouteParams();
    return params.keyword || "";
  }

  async function doSearch(page = 1) {
    const term = keyword.trim();
    if (!term) {
      showToast("请输入搜索关键词");
      return;
    }

    if (page === 1) {
      loading = true;
      searchResults = [];
    } else {
      loadingMore = true;
    }

    hasSearched = true;
    error = "";
    currentPage = page;

    try {
      const d = await searchVideo(term, { page });
      // 搜索结果在 d.result 数组中
      const videos = d && d.result ? d.result : [];
      // 过滤出视频类型(type=video)的结果
      const mapped = videos
        .filter((v) => v.type === "video")
        .map((v) => ({
          bvid: v.bvid,
          aid: v.id,
          title: v.title ? v.title.replace(/<[^>]+>/g, "") : "",
          pic: v.pic,
          owner: v.author ? { mid: v.mid, name: v.author } : null,
          duration: v.duration,
          stat: {
            view: v.play || 0,
            like: v.lavorites || 0,
            danmaku: v.video_review || 0,
          },
        }));

      if (page === 1) {
        searchResults = mapped;
      } else {
        searchResults = [...searchResults, ...mapped];
      }

      // 如果返回结果不足20条，说明没有更多数据了
      hasMore = videos.length >= 20;
    } catch (e) {
      error = e.message || "搜索失败";
      if (page === 1) {
        searchResults = [];
      }
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  function loadMore() {
    if (loadingMore || !hasMore) return;
    doSearch(currentPage + 1);
  }

  function playVideo(v) {
    setIndex(0);
    navigate("/player?bvid=" + v.bvid);
  }

  // 滚动到末尾时加载更多
  function onMoveFocus(delta) {
    const moved = moveFocus(delta);
    if (!moved && delta > 0) {
      // 向下滚动到末尾，加载下一页
      loadMore();
    }
    return moved;
  }

  onMount(() => {
    keyword = getKeywordFromUrl();
    if (keyword) {
      doSearch(1);
    } else {
      error = "缺少搜索关键词";
      hasSearched = true;
    }

    setSoftkeys("", "打开", "");
    onKey("search-results", {
      ArrowDown: () => onMoveFocus(+1),
      ArrowUp: () => onMoveFocus(-1),
    });
  });

  onDestroy(() => {
    offKey("search-results");
  });
</script>

<div class="screen">
  <div class="main">
    <!-- 搜索标题栏 -->
    <div class="search-header">
      <div class="search-keyword">🔍 {keyword || "搜索结果"}</div>
      {#if searchResults.length > 0}
        <div class="result-count">共 {searchResults.length} 条</div>
      {/if}
    </div>

    {#if loading && searchResults.length === 0}
      <Loading message="搜索中..." />
    {:else if error && searchResults.length === 0}
      <EmptyState message={error} hint="按 左软键 返回" />
    {:else if hasSearched && searchResults.length === 0}
      <EmptyState message="暂无搜索结果" hint="换个关键词试试吧" />
    {:else}
      <FeedList
        items={searchResults}
        on:play={(e) => playVideo(e.detail)}
      />
      {#if loadingMore}
        <LoadingMore message="加载更多..." />
      {/if}
    {/if}
  </div>
</div>

<style>
  .search-header {
    padding: 8px;
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }
  .search-keyword {
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: var(--md-sys-typescale-title-small-weight);
    color: var(--md-sys-color-on-surface);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .result-count {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-top: 2px;
  }
</style>
