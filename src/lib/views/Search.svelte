<script>
  import { onMount } from "svelte";
  import { getHotSearch } from "../api/user.js";
  import { navigate } from "../router/index.js";
  import { onKey, moveFocus, activateFocused } from "../keyboard/index.js";
  import { setSoftkeys, showToast } from "../stores/ui.js";
  import Loading from "../components/Loading.svelte";
  import EmptyState from "../components/EmptyState.svelte";

  // 搜索状态
  let keyword = "";
  let hotList = [];
  let loading = false;
  let error = "";

  // 焦点当前在输入框 ("input") 还是热搜列表 ("list") —— 决定中键的提示文案
  let zone = "input";

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

  onMount(() => {
    loadHot();
    // 页面加载时聚焦输入框
    setTimeout(() => {
      if (inputRef) inputRef.focus();
    }, 100);
    // 记住焦点在输入框还是在热搜列表里 —— 中键 (OK) 的作用提示跟着它变
    window.addEventListener("focus", onFocusCapture, true);
    // onKey() 返回注销函数, 直接作为 onMount 的返回值 → 组件销毁时自动注销
    // softkeys: true → 作用域只接管软键栏的生命周期, 文案由下面的响应式语句给
    const off = onKey("search", {
      // 向下: 输入框有焦点时也会走到这里, 因为输入框不在 [data-navable] 列表里,
      // moveFocus 会把焦点落到第一个热搜项
      Down: () => moveFocus(+1),
      // 向上: 输入框里按 ↑ 保持不动 (输入框在热搜列表上方);
      // 列表顶部再往上就回到输入框。
      //
      // 注意: 这里必须 return true —— 返回 false 等于告诉总线"我没处理这个键",
      // 总线会继续走框架默认行为 (Up = moveFocus(-1)), 刚把焦点交回输入框
      // 就又被拉回列表最后一项, 焦点在输入框和列表之间来回弹 (按多少次都回不去)。
      Up: () => {
        if (document.activeElement === inputRef) return true;
        const moved = moveFocus(-1);
        if (!moved && inputRef) inputRef.focus();
        return true;
      },
      SoftLeft: () => doSearch(),
      // 中键: 输入框里 = 搜索; 列表里 = 激活当前热搜项
      // (scope 里显式声明了 Enter 之后, 框架默认的"Enter 激活焦点元素"就不会再触发,
      //  所以列表里要自己调 activateFocused 补上, 等价于点一下当前项)
      Enter: () => {
        if (document.activeElement === inputRef) {
          doSearch();
          return true;
        }
        return activateFocused();
      },
    }, { softkeys: true });
    return () => {
      window.removeEventListener("focus", onFocusCapture, true);
      off();
    };
  });

  /**
   * 焦点落在输入框还是热搜列表里 (Gecko 48 没有 focusin, 用捕获阶段的 focus)
   */
  function onFocusCapture(e) {
    if (e.target === inputRef) {
      zone = "input";
    } else if (e.target && e.target.classList && e.target.classList.contains("hot-item")) {
      zone = "list";
    }
  }

  // 软键栏: 左软键=搜索; 中间提示中键 (OK) 当前的作用 (输入框里=搜索, 列表里=打开)
  $: setSoftkeys("搜索", "", zone === "list" ? "打开" : "搜索");
</script>

<div class="screen">
  <div class="main">
    <!-- 搜索输入框 (按键统一由 scope 处理, 不再单独监听 keydown) -->
    <div class="search-bar">
      <input
        bind:this={inputRef}
        type="text"
        class="search-input"
        placeholder="搜索视频..."
        bind:value={keyword}
      />
    </div>

    <!-- 热搜列表 -->
    {#if loading}
      <Loading message="加载热搜..." />
    {:else if hotList.length === 0}
      <EmptyState message={error || "暂无热搜"} />
    {:else}
      <div class="hot-section">
        <div class="hot-title">★ 热搜榜单</div>
        <div class="hot-list scroll-y" data-nav-root>
          {#each hotList as item, i (item.hot_id)}
            <!-- 中键由 scope 里的 activateFocused 触发 (等价于 click), 不再单独监听 keydown -->
            <div
              class="hot-item"
              data-navable
              tabindex="0"
              on:click={() => selectHot(item)}
            >
              <span class="hot-rank" class:top3={i < 3}>{i + 1}</span>
              <span class="hot-keyword">{item.show_name || item.keyword}</span>
              {#if item.icon}
                <span class="hot-icon">★</span>
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

  .main {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .hot-section {
    display: flex;
    flex-direction: column;
    /* 与其兄弟 .search-bar 一起放在 .main 内, 用 flex 分配剩余高度,
       否则 height:100% + 兄弟元素会把列表底部挤出可视区 (无法滚动到的内容) */
    flex: 1;
    min-height: 0;
    height: auto;
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
