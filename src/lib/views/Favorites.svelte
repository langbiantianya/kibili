<script>
  import { onMount } from "svelte";
  import { getFavFolders } from "../api/user.js";
  import { get } from "svelte/store";
  import { user, isLogin } from "../stores/user.js";
  import { navigate } from "../router/index.js";
  import { onKey, moveFocus } from "../keyboard/index.js";
  import { setSoftkeys } from "../stores/ui.js";
  import Loading from "../components/Loading.svelte";
  import EmptyState from "../components/EmptyState.svelte";

  let folders = [];
  let loading = true;
  let error = "";

  async function load() {
    loading = true;
    error = "";
    try {
      const u = get(user);
      let mid = u.mid;
      if (!mid) {
        // 未登录: 提示去登录
        error = "请先登录";
        loading = false;
        return;
      }
      const d = await getFavFolders(mid, { pn: 1, ps: 30 });
      folders = d && d.list ? d.list : [];
    } catch (e) {
      error = e.message || "加载失败";
    } finally {
      loading = false;
    }
  }

  function openFolder(f) {
    navigate("/folder?fid=" + f.id + "&title=" + encodeURIComponent(f.title));
  }


  onMount(() => {
    setSoftkeys($isLogin ? "刷新" : "登录", "", "打开");
    load();
    // onKey() 返回自己的注销函数, 直接交给 onMount 的返回值 → 组件销毁时
    // 只移除"本实例"注册的作用域 (同名实例之间不会互相踩)。
    // softkeys: true → 接管软键栏的生命周期, 文案仍由上面的 setSoftkeys 动态给
    return onKey("favorites", {
      Down: () => moveFocus(+1),
      Up: () => moveFocus(-1),
      SoftLeft: () => {
        if ($isLogin) load();
        else navigate("/login");
      }
    }, { softkeys: true });
  });
</script>

<div class="screen">
  <div class="main">
    {#if loading}
      <Loading message="加载收藏夹..." />
    {:else if error}
      <EmptyState message={error} hint={$isLogin ? "按 左软键 重试" : "按 左软键 登录"} />
    {:else if folders.length === 0}
      <EmptyState message="暂无收藏夹" hint={$isLogin ? "" : "登录后查看"} />
    {:else}
      <!-- data-nav-root: 方向键只在本列表内漫游, 不跑到别的区域 -->
      <div class="folder-list scroll-y" data-nav-root>
        {#each folders as f, i (f.id)}
          <div
            class="folder-item"
            data-navable
            tabindex="0"
            on:click={() => openFolder(f)}
          >
            <div class="title">{f.title}</div>
            <div class="meta">{f.media_count || 0} 个视频</div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .folder-list {
    height: 100%;
  }
  .folder-item {
    min-height: 36px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    display: flex;
    flex-direction: column;
    justify-content: center;
    transition: background 0.15s ease;
    cursor: pointer;
  }
  .folder-item:focus,
  .folder-item:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .title {
    font-size: var(--md-sys-typescale-body-large-size);
    color: var(--md-sys-color-on-surface);
    font-weight: var(--md-sys-typescale-body-large-weight);
  }
  .meta {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-top: 1px;
  }
</style>
