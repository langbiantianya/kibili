<script>
  import Router, { location as routerLocation, replace } from "svelte-spa-router";
  import { onMount } from "svelte";
  import { isLogin, hydrateFromNav } from "./lib/stores/user.js";
  import { refreshWbiKeys } from "./lib/api/wbi.js";
  import { request } from "./lib/api/bili.js";
  import SoftkeyBar from "./lib/components/SoftkeyBar.svelte";
  import Toast from "./lib/components/Toast.svelte";
  import MiniPlayer from "./lib/components/MiniPlayer.svelte";
  import { setAudioElement } from "./lib/player/engine.js";

  // Route definitions
  import MainLayout from "./lib/views/MainLayout.svelte";
  import History from "./lib/views/History.svelte";
  import Favorites from "./lib/views/Favorites.svelte";
  import FolderContents from "./lib/views/FolderContents.svelte";
  import Player from "./lib/views/Player.svelte";
  import FullscreenPlayer from "./lib/views/FullscreenPlayer.svelte";
  import Login from "./lib/views/Login.svelte";
  import DynamicDetail from "./lib/views/DynamicDetail.svelte";
  import ImageViewer from "./lib/views/ImageViewer.svelte";
  import Search from "./lib/views/Search.svelte";
  import SearchResults from "./lib/views/SearchResults.svelte";
  import User from "./lib/views/User.svelte";
  import Settings from "./lib/views/Settings.svelte";
  import About from "./lib/views/About.svelte";
  import KeyTest from "./lib/views/KeyTest.svelte";
  import MenuTest from "./lib/views/MenuTest.svelte";
  import Listen from "./lib/views/Listen.svelte";
  import ListenComments from "./lib/views/ListenComments.svelte";

  // 主 Tab 的路径 (都由 MainLayout 内部渲染, 路由表里走 "*" 兜底)
  const MAIN_PATHS = ["/home", "/following", "/profile"];

  /**
   * 全局媒体元素 (听视频用)
   *
   * ⚠️ 必须是 **<video>**, 不能用 <audio> —— 真机 (KaiOS 2.4 / Gecko 48) 实测:
   *   同一个 DASH 的 m4s 纯音频地址
   *     装进 <audio> → 被当成**直播流**: duration 跟着播放头走 (播到 40 秒报 40 秒),
   *                   seekable 只有"已经播到的那一段" → 快进根本去不了
   *     装进 <video> → 正常: duration=236、seekable=[[0,236]]、快进到 100 直接成功
   *   根因是 <audio> 的媒体缓存不做 Range 请求, 碎片 MP4 (m4s) 只能被一段段解析,
   *   于是解封装器看到多少就当多少 → 像直播。
   *
   * 这个流里**只有音频轨**, 所以 <video> 元素不会去解码任何画面, 照样省电。
   */
  /** @type {HTMLVideoElement|null} */
  let mediaEl = null;

  // 路由表
  //
  // 主 Tab (首页 / 关注 / 我的) 都交给 MainLayout, **只写一条 "*"**:
  // 之前是 "/home"、"/following"、"/profile" 三条各自指向 MainLayout,
  // 而 svelte-spa-router 是按"路由条目"决定要不要换组件的 ——
  // 换 Tab 时它会把整个 MainLayout 销毁重建, 新旧两个实例会短暂共存:
  // 旧实例先响应了 location 变化挂了一份新页面, 紧接着路由又把组件换掉,
  // 于是同一个页面被挂载两次 (关注页因此发过两次请求、数据被追加两遍)。
  // 用同一条 "*" 之后, 换 Tab 不再换组件, 只换 MainLayout 内部的那个页面。
  const routes = {
    "/history": History,
    "/favorites": Favorites,
    "/folder": FolderContents,
    "/player": Player,
    "/fullscreen": FullscreenPlayer,
    "/login": Login,
    "/dynamic-detail": DynamicDetail,
    // 图片全屏查看: #/image-viewer?imgs=<编码后的 JSON 数组>&i=<序号>
    "/image-viewer": ImageViewer,
    "/search": Search,
    "/search-results": SearchResults,
    // 用户主页: #/user?uid=xxx (自己的主页和别人的主页走同一条路由)
    "/user": User,
    "/settings": Settings,
    "/about": About,
    "/keytest": KeyTest,
    // 软键菜单 (二级/三级) 手动测试页
    "/menu-test": MenuTest,
    // 听视频 (纯音频): #/listen?bvid=xxx
    "/listen": Listen,
    // 听视频的评论页 (单独一页)
    "/listen-comments": ListenComments,
    // 主 Tab + 兜底都走 MainLayout (内部按 /home /following /profile 分发)
    "*": MainLayout,
  };

  // 返回键统一由 lib/keyboard/index.js 的全局 app-back 作用域处理
  // (退格键 Back / Smart Touch 返回键 GoBack / BrowserBack 归一化后走同一处,
  //  顶层路由不拦截; 右软键不是返回键)
  // 通话键 Call / 挂断键 EndCall 根本不在返回家族里 —— 框架在最前面就放行,
  //  网页不能吞, 否则用户没法拨号/挂断。
  // 这里不再单独监听 keydown, 避免同一个按键被处理两遍。

  onMount(() => {
    // 音频元素交给播放引擎 —— 它**不能**属于听视频页:
    // 那个页面一最小化, 元素就被销毁, 声音会断。
    // 挂在根组件里, 跨路由不销毁, 迷你条浮着的时候声音照旧。
    setAudioElement(mediaEl);

    // 启动时预加载 WBI keys (即使未登录也需要, B站多数接口强制 WBI 签名)
    refreshWbiKeys();

    // 启动时访问 bilibili.com 首页以设置 cookies (buvid 等)
    request("https://www.bilibili.com/", { rawData: true }).catch(() => {});

    // 启动时尝试 hydrate 用户信息
    if ($isLogin) {
      hydrateFromNav();
    }

    // 未匹配到路由的路径 (含冷启动的 "#/" 与无 hash 的裸 URL) 重定向到首页。
    // 兜底路由 "*" 指向 MainLayout, 但 MainLayout 只渲染它自己的三个主 Tab 页面;
    // 若让它把未知路径渲染成 Home, 从主 Tab 过渡到二级页 (/history 等) 的那一帧会多挂载一个
    // Home (MainLayout.getPage 返回 null 避免了这一点, 这里只是双保险)。
    //
    // 主 Tab 三个路径走的是 "*" 兜底路由, 不在 routes 里, 要单独算成"已知路径",
    // 否则会被当成未知路径重定向回首页。
    const knownPaths = MAIN_PATHS.concat(Object.keys(routes).filter(p => p !== "*"));
    const unsubLocation = routerLocation.subscribe(loc => {
      const path = loc || "/";
      if (knownPaths.indexOf(path) < 0) replace("/home");
    });

    return () => {
      unsubLocation();
    };
  });
</script>

<div class="app-root">
  <Router {routes} />
  <!-- 迷你播放条: 听视频页最小化后浮在软键栏上方 -->
  <MiniPlayer />
  <!-- 全局媒体元素: 跨路由不销毁, 最小化之后声音不断
       注意: 老 Gecko 上 display:none 的媒体元素不会真的出声 (play() resolve 但停在暂停),
       所以这里把它移到屏幕外而不是藏掉。
       用 <video> 而不是 <audio> 的原因见上面 mediaEl 的注释。 -->
  <video bind:this={mediaEl} id="media-engine" class="offscreen-media" preload="metadata" audio-channel="content"></video>
  <SoftkeyBar />
  <Toast />
</div>

<style>
  .app-root {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background: var(--md-sys-color-surface-bright);
    color: var(--md-sys-color-on-surface);
  }
  .app-root > :global(.main-layout),
  .app-root > :global(.screen) {
    flex: 1;
    min-height: 0;
  }
</style>
