<script>
  import { onMount, onDestroy } from "svelte";
  import { getHotSearch } from "../api/user.js";
  import { navigate } from "../router/index.js";
  import { onKey, offKey, moveFocus } from "../keyboard/index.js";
  import { setSoftkeys, showToast } from "../stores/ui.js";
  import Loading from "../components/Loading.svelte";
  import EmptyState from "../components/EmptyState.svelte";

  // 搜索状态
  let keyword = "";
  let hotList = [];
  let loading = false;
  let error = "";

  // 输入框引用
  let inputRef;

  async function loadHot() {
    loading = true;
    error = "";
    try {
      const d = await getHotSearch();
      hotList = (d && d.list) ? d.list : [];
    } catch (e) {
      error = e.message || "加载失败";
    } finally {
      loading = false;
    }
  }

  function doSearch() {
    const term = keyword.trim();
    if (!term) {
      showToast("请输入搜索关键词");
      return;
    }
    // 跳转到搜索结果页
    navigate("/search-results?keyword=" + encodeURIComponent(term));
  }

  function selectHot(item) {
    const term = item.keyword || item.show_name || "";
    if (!term) return;
    // 跳转到搜索结果页
    navigate("/search-results?keyword=" + encodeURIComponent(term));
  }

  function onInputKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      doSearch();
    }
  }

  onMount(() => {
    setSoftkeys("搜索", "", "");
    loadHot();
    onKey("search", {
      ArrowDown: () => {
        // 如果输入框有焦点，先移到列表
        if (document.activeElement === inputRef) {
          const firstItem = document.querySelector(".hot-item");
          if (firstItem) firstItem.focus();
          return true;
        }
        return moveFocus(+1);
      },
      ArrowUp: () => {
        const moved = moveFocus(-1);
        // 如果移到最上面，回到输入框
        if (!moved) {
          if (inputRef) inputRef.focus();
        }
        return moved;
      },
      SoftLeft: () => doSearch(),
    });
    // 页面加载时聚焦输入框
    setTimeout(() => {
      if (inputRef) inputRef.focus();
    }, 100);
  });

  onDestroy(() => {
    offKey("search");
  });
</script>

<div class="screen">
  <div class="main">
    <!-- 搜索输入框 -->
    <div class="search-bar">
      <input
        bind:this={inputRef}
        type="text"
        class="search-input"
        placeholder="搜索视频..."
        bind:value={keyword}
        on:keydown={onInputKey}
      />
    </div>

    <!-- 热搜列表 -->
    {#if loading}
      <Loading message="加载热搜..." />
    {:else if hotList.length === 0}
      <EmptyState message={error || "暂无热搜"} />
    {:else}
      <div class="hot-section">
        <div class="hot-title">🔥 热搜榜单</div>
        <div class="hot-list scroll-y">
          {#each hotList as item, i (item.hot_id)}
            <div
              class="hot-item"
              data-navable
              tabindex="0"
              on:click={() => selectHot(item)}
              on:keydown={(e) => { if (e.key === "Enter") selectHot(item); }}
            >
              <span class="hot-rank" class:top3={i < 3}>{i + 1}</span>
              <span class="hot-keyword">{item.show_name || item.keyword}</span>
              {#if item.icon}
                <span class="hot-icon">🔥</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .search-bar {
    padding: 6px 8px;
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }
  .search-input {
    width: 100%;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--md-sys-color-outline);
    border-radius: var(--md-sys-shape-corner-small);
    background: var(--md-sys-color-surface-container-lowest);
    color: var(--md-sys-color-on-surface);
    font-size: var(--md-sys-typescale-body-medium-size);
    outline: none;
    box-sizing: border-box;
  }
  .search-input:focus {
    border-color: var(--md-sys-color-primary);
    background: var(--md-sys-color-surface-container-low);
  }
  .search-input::placeholder {
    color: var(--md-sys-color-on-surface-variant);
  }

  .hot-section {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .hot-title {
    padding: 6px 8px;
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    color: var(--md-sys-color-primary);
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }
  .hot-list {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .hot-list::-webkit-scrollbar {
    display: none;
  }
  .hot-item {
    display: flex;
    align-items: center;
    min-height: 32px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .hot-item:focus,
  .hot-item:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .hot-rank {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    color: var(--md-sys-color-on-surface-variant);
    margin-right: 6px;
    flex-shrink: 0;
  }
  .hot-rank.top3 {
    color: var(--md-sys-color-error);
    font-weight: var(--md-sys-typescale-title-small-weight);
  }
  .hot-keyword {
    flex: 1;
    min-width: 0;
    font-size: var(--md-sys-typescale-body-large-size);
    color: var(--md-sys-color-on-surface);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hot-icon {
    font-size: var(--md-sys-typescale-label-small-size);
    margin-left: 4px;
    flex-shrink: 0;
  }
</style>
