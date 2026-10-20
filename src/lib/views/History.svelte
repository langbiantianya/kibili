<script>
  import { onMount } from "svelte";
  import { history as histStore, refreshHistory } from "../stores/history.js";
  import { navigate } from "../router/index.js";
  import { onKey, moveFocus } from "../keyboard/index.js";
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
    load();
    // onKey() 返回自己的注销函数, 直接交给 onMount 的返回值 → 组件销毁时
    // 只移除"本实例"注册的作用域 (同名实例之间不会互相踩)。
    // 中键 (Enter) 不再自己处理: 框架默认会 click 当前焦点的 .feed-card,
    // 由卡片自身的 on:click → play 事件 → playVideo() 完成播放。
    // softkeys: 作用域同时接管软键栏 (文案随作用域一起释放)。
    return onKey("history", {
      Down: () => moveFocus(+1),
      Up: () => moveFocus(-1),
      SoftLeft: () => load()
    }, { softkeys: ["刷新", "", "播放"] });
  });
</script>

<div class="screen">
  <div class="main">
    {#if loading}
      <Loading message="加载历史记录..." />
    {:else if $histStore.items.length === 0}
      <EmptyState
        message={$isLogin ? "暂无历史记录" : "登录后查看历史记录"}
        hint={$isLogin ? "" : "仅显示本地缓存"}
      />
    {:else}
      <FeedList items={$histStore.items} on:play={(e) => playVideo(e.detail)} />
    {/if}
  </div>
</div>
