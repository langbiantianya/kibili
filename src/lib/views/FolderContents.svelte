<script>
  import { onMount, onDestroy } from "svelte";
  import { loadFolder } from "../stores/queue.js";
  import { navigate, getRouteParams } from "../router/index.js";
  import { onKey, offKey, moveFocus } from "../keyboard/index.js";
  import { setSoftkeys, showToast } from "../stores/ui.js";
  import FeedList from "../components/FeedList.svelte";
  import Loading from "../components/Loading.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import { queue, setIndex } from "../stores/queue.js";

  let items = [];
  let loading = true;
  let fid = "";
  let title = "收藏夹";

  async function load() {
    loading = true;
    const params = getRouteParams();
    fid = params.params.fid || params.params.media_id || "";
    title = params.params.title || "收藏夹";
    if (!fid) {
      loading = false;
      return;
    }
    try {
      await loadFolder(fid, title);
      const unsub = queue.subscribe((q) => (items = q.items));
      unsub();
    } catch (e) {
      showToast("加载失败: " + e.message);
    } finally {
      loading = false;
    }
  }

  function playVideo(v) {
    const idx = items.findIndex((x) => x.bvid === v.bvid);
    if (idx >= 0) setIndex(idx);
    navigate("/player?bvid=" + v.bvid);
  }

  onMount(() => {
    setSoftkeys("刷新", "", "播放");
    load();
    onKey("folder", {
      ArrowDown: () => moveFocus(+1),
      ArrowUp: () => moveFocus(-1),
      SoftLeft: () => load(),
      Enter: () => {
        const focused = document.querySelector(".feed-card:focus");
        if (focused) {
          const evt = new MouseEvent("click", { bubbles: true });
          focused.dispatchEvent(evt);
        }
      },
    });
  });

  onDestroy(() => {
    offKey("folder");
  });
</script>

<div class="screen">
  <div class="main">
    {#if loading}
      <Loading message="加载中..." />
    {:else if items.length === 0}
      <EmptyState message="收藏夹为空" />
    {:else}
      <FeedList {items} on:play={(e) => playVideo(e.detail)} />
    {/if}
  </div>
</div>
