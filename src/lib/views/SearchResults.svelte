<script>
  import { onMount } from "svelte";
  import { searchVideo } from "../api/user.js";
  import { navigate, getRouteParams } from "../router/index.js";
  import { onKey, roam } from "../keyboard/index.js";
  import { showToast } from "../stores/ui.js";
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
            // 统一的卡片形状: 播放量 + 点赞数
            // 搜索接口给的是 play (播放) 和 like (点赞)
            // (注意: 之前这里写的是 v.lavorites —— 少个 f, 一直是 undefined, 点赞恒为 0)
            // 没有 like 就留 null, 由列表层按需补 (见 components/FeedList.svelte)
            play: v.play || 0,
            like: v.like != null ? v.like : null,
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

  onMount(() => {
    keyword = getKeywordFromUrl();
    if (keyword) {
      doSearch(1);
    } else {
      error = "缺少搜索关键词";
      hasSearched = true;
    }

    // onKey() 返回注销函数, 直接作为 onMount 的返回值 → 组件销毁时自动注销
    // softkeys: 作用域同时接管软键栏 (文案随作用域一起释放)。
    return onKey("search-results", {
      // 向下漫游到列表末尾时加载下一页 (roam 的 onEdge 在"没能移动"时触发)
      Down: () => roam(+1, () => loadMore()),
      Up: () => roam(-1),
      SoftLeft: () => doSearch(1)
    }, { softkeys: ["刷新", "", "打开"] });
  });
</script>

<div class="screen">
  <!-- 方向键漫游区域: 焦点留在这个页面里 (FeedList 内部还有一层更近的 data-nav-root) -->
  <div class="main" data-nav-root>
    <!-- 搜索标题栏 -->
    <div class="search-header">
      <div class="search-keyword">{keyword || "搜索结果"}</div>
      {#if searchResults.length > 0}
        <div class="result-count">共 {searchResults.length} 条</div>
      {/if}
    </div>

    {#if loading && searchResults.length === 0}
      <Loading message="搜索中..." />
    {:else if error && searchResults.length === 0}
      <EmptyState message={error} hint="按 左软键 重试" />
    {:else if hasSearched && searchResults.length === 0}
      <EmptyState message="暂无搜索结果" hint="换个关键词试试吧" />
    {:else}
      <FeedList items={searchResults} on:play={(e) => playVideo(e.detail)} />
      {#if loadingMore}
        <LoadingMore message="加载更多..." />
      {/if}
    {/if}
  </div>
</div>

<style>
  .main {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  /* FeedList 的 .feed-list 是 height:100%, 与其兄弟 .search-header 一起会把
     列表底部挤出可视区; 这里用 flex 分配剩余高度 */
  .main :global(.feed-list) {
    flex: 1;
    min-height: 0;
    height: auto;
  }
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
