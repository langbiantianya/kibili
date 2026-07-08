<script>
  import { onMount, onDestroy } from "svelte";
  import { history as histStore, refreshHistory } from "../stores/history.js";
  import { navigate } from "../router/index.js";
  import { onKey, offKey, moveFocus } from "../keyboard/index.js";
  import { setSoftkeys } from "../stores/ui.js";
  import Loading from "../components/Loading.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import FeedList from "../components/FeedList.svelte";
  import { isLogin } from "../stores/user.js";

  let loading = true;

  async function load() {
    loading = true;
    await refreshHistory();
    loading = false;
  }

  function playVideo(v) {
    const t = v.progress ? Math.floor(v.progress / 1000) : 0;
    navigate("/player?bvid=" + v.bvid + (t ? "&t=" + t : ""));
  }

  onMount(() => {
    setSoftkeys("刷新", "", "播放");
    load();
    onKey("history", {
      ArrowDown: () => moveFocus(+1),
      ArrowUp: () => moveFocus(-1),
      SoftLeft: () => load(),
      Enter: () => {
        const focused = document.querySelector(".feed-card:focus");
        if (focused) {
          const evt = new MouseEvent("click", { bubbles: true });
          focused.dispatchEvent(evt);
        }
      }
    });
  });

  onDestroy(() => {
    offKey("history");
  });
</script>

<div class="screen">
  <div class="main">
    {#if loading}
      <Loading message="加载历史记录..." />
    {:else if !$isLogin}
      <EmptyState message="登录后查看历史记录" hint="仅显示本地缓存" />
    {:else if $histStore.items.length === 0}
      <EmptyState message="暂无历史记录" />
    {:else}
      <FeedList items={$histStore.items} on:play={(e) => playVideo(e.detail)} />
    {/if}
  </div>
</div>
