<script>
  import { onMount } from "svelte";
  import { loadFolder } from "../stores/queue.js";
  import { navigate, getRouteParams } from "../router/index.js";
  import { onKey, moveFocus } from "../keyboard/index.js";
  import { buildAppMenu } from "../menu/appMenu.js";
  import { addFocusedToPlaylist } from "../player/playlistActions.js";
  import FeedList from "../components/FeedList.svelte";
  import Loading from "../components/Loading.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import { queue, setIndex } from "../stores/queue.js";

  let items = [];
  let loading = true;
  let error = "";
  let fid = "";
  let title = "收藏夹";

  async function load() {
    loading = true;
    error = "";
    const params = getRouteParams();
    fid = params.params.fid || params.params.media_id || "";
    title = params.params.title || "收藏夹";
    if (!fid) {
      error = "收藏夹ID缺失";
      loading = false;
      return;
    }
    try {
      await loadFolder(fid, title);
      const unsub = queue.subscribe((q) => (items = q.items));
      unsub();
    } catch (e) {
      error = e.message || "加载失败";
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
    load();
    // onKey() 返回自己的注销函数, 直接交给 onMount 的返回值 → 组件销毁时
    // 只移除"本实例"注册的作用域 (同名实例之间不会互相踩)。
    // softkeys: 作用域同时接管软键栏 (文案随作用域一起释放)。
    return onKey("folder", {
      Down: () => moveFocus(+1),
      Up: () => moveFocus(-1),
      SoftLeft: () => load()
    }, {
      softkeys: ["刷新", "更多", "播放"],
      // 右软键 = 更多: 把当前选中的视频加进听视频播放列表
      menu: () => buildAppMenu([
        { label: "添加到播放列表", action: () => addFocusedToPlaylist(items) }
      ])
    });
  });
</script>

<div class="screen">
  <div class="main">
    {#if loading}
      <Loading message="加载中..." />
    {:else if error}
      <EmptyState message={error} hint="按 左软键 重试" />
    {:else if items.length === 0}
      <EmptyState message="收藏夹为空" />
    {:else}
      <FeedList {items} on:play={(e) => playVideo(e.detail)} />
    {/if}
  </div>
</div>
