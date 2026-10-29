<script>
  // 听视频页 (纯音频)
  //
  // URL: #/listen?bvid=<bvid>
  //
  // ── 页面干什么 ──────────────────────────────────────────────────────
  //   布局参考塞班手机自带的音乐播放器 (Nokia 那套):
  //     大封面 → 歌名(粗) + 作者(小) + 播放模式 → 进度条(带小圆点滑块)
  //     + 已播/总时长 → 播放控制行 (上一首 / 播放暂停 / 下一首) → 键位提示
  //   下面用方向键控制:
  //     ←  快退 10 秒      →  快进 10 秒
  //     →  长按 = 2 倍速 (松手恢复 1 倍)
  //     ↑  系统音量+       ↓  系统音量−
  //   左软键 = 最小化 (收起这一页, 底部浮一条迷你条, 声音继续)
  //   右软键 = 更多 (二级菜单: UP主页/播放列表/播放模式/上一首/下一首/互动/评论/退出)
  //
  // ── 声音从哪来 ──────────────────────────────────────────────────────
  //   音频元素**不在这一页** —— 它挂在根组件 (App.svelte) 里, 跨路由不销毁,
  //   所以"最小化"之后声音不会断。引擎见 player/engine.js。

  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { getVideoInfo } from '../api/video.js';
  import {
    getStatus, likeVideo, coinVideo, favVideo, unfavVideo, tripleAction
  } from '../api/interact.js';
  import { onKey } from '../keyboard/index.js';
  import { navigate } from '../router/index.js';
  import { setSoftkeys, showToast } from '../stores/ui.js';
  import { isLogin } from '../stores/user.js';
  import { requestSystemVolume } from '../player/volume.js';
  import { playModeLabel } from '../player/playmode.js';
  import {
    playlist, nowPlaying, playState, currentIndex, miniVisible,
    playMode, setPlayMode, removeFromPlaylist, moveInPlaylist
  } from '../stores/player.js';
  import {
    playItemOnTop, playIndex, togglePlay, seekBy, setRate, stopPlayback,
    currentTrackState, resumeTrack, nextTrack, prevTrack
  } from '../player/engine.js';
  import { buildListenMenu } from '../menu/listenMenu.js';
  import { biliImg } from '../utils/platform.js';

  // 一次快进/快退多少秒
  const SEEK_STEP = 10;

  let bvid = '';
  let info = null;
  /** info 现在对应的是哪一首 (切歌后要跟着换) */
  let infoBvid = '';
  /** 初次加载归 onMount 管; 加载完了才让"切歌跟着换"接管 */
  let ready = false;
  let loading = true;
  let error = '';
  let status = { like: 0, coin: 0, fav: 0 };

  // ── 播放进度 (来自引擎) ────────────────────────────────────────────
  $: time = $playState.time;
  $: duration = $playState.duration;
  // 软键文案: 中键写的是"按下之后会做什么" (正在播 → 「暂停」)
  $: setSoftkeys('最小化', '更多', $playState.playing ? '暂停' : '播放');

  // ── 页面显示的是"正在放的那首" ────────────────────────────────────
  //
  // ⚠️ 不能一直显示 URL 里那首的信息: 在「更多 → 播放列表」里切了歌之后,
  // 标题/作者还钉在原来那首上 (界面上像没换歌, 耳朵里却是新歌)。
  // 现在一切以引擎里"正在放的那首"为准, 换歌时把信息也换过来。
  $: cur = $nowPlaying;
  $: curBvid = cur && cur.bvid ? cur.bvid : bvid;
  // 切歌了 → 悄悄把这一首的信息 (标题/UP主/时长) 换过来 (不闪"加载中")
  $: if (ready && !error && curBvid && curBvid !== infoBvid) loadTrackInfo(curBvid, true, true);

  $: title = (cur && cur.title) || (info && info.title) || '';
  $: owner = (cur && cur.owner && cur.owner.name) || (info && info.owner ? info.owner.name : '') || '';
  // 封面跟着正在放的那首走 (播放列表里切歌时封面跟着换)
  $: coverUrl = cur && cur.pic
    ? biliImg(cur.pic, 192, 108, 'jpg')
    : (info && info.pic ? biliImg(info.pic, 192, 108, 'jpg') : '');

  // 进度百分比 (进度条和滑块共用)
  $: pct = duration > 0 ? Math.max(0, Math.min(100, (time / duration) * 100)) : 0;

  // 当前播放模式 (页面上摆个小标签, 菜单里也能改)
  $: modeLabel = playModeLabel($playMode);

  function fmt(t) {
    if (!t || isNaN(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /** 歌名太长时截一下 (提示里用) */
  function shortTitle(title) {
    const t = String(title || '');
    return t.length > 10 ? t.slice(0, 10) + '…' : t;
  }

  /** 需要登录的动作统一走这里 */
  function needLogin() {
    if (!$isLogin) {
      showToast('请先登录');
      return false;
    }
    return true;
  }

  // ── 进入页面 ────────────────────────────────────────────────────────
  //
  // ⚠️ 整个 body 包在 try/catch 里: 这一页的 onMount 一旦抛异常, 就会把
  // Svelte 的 flush 打断 —— flush 抛错后内部的 update_scheduled 不会复位,
  // 整个应用从此不再更新 (页面冻在"加载中", 连路由都换不了), 而且不报任何错。
  // 真机上就因为 play() 抛过一次, 所以这里必须兜住。
  onMount(() => {
    try {
      // 从 URL 读 bvid
      const hash = location.hash || '';
      const m = /[?&]bvid=([^&]+)/.exec(hash);
      bvid = m ? decodeURIComponent(m[1]) : '';

      // 这一页是"展开"的播放器 → 迷你条先收起来
      miniVisible.set(false);

      if (!bvid) {
        error = '缺少视频 ID';
        loading = false;
        return;
      }

      // 引擎里这一首现在什么状态 → 决定要不要起播
      //
      // ⚠️ 不能只看 "nowPlaying 是不是这首": 那只是"选中的是哪首",
      // 暂停着的时候它也有值。真机上踩过: 同一首再进听视频页, 以为"已经在放了"
      // 就跳过了起播, 进去是个哑巴播放器。
      const st = currentTrackState(bvid);
      // 已经在放 / 正在拉流 / 暂停着 → 都不用重新起播 (只取信息)
      const onlyInfo = st === 'playing' || st === 'loading' || st === 'paused';
      loadTrackInfo(bvid, onlyInfo).then(() => { ready = true; });
      // 同一首, 暂停着 → 接着放 (从当前位置, 不回到开头)
      if (st === 'paused') resumeTrack(bvid);
    } catch (e) {
      console.error('[listen] onMount 出错', e);
      error = '出错了';
      loading = false;
    }
  });

  onDestroy(() => {
    // 离开这一页 = 收起 (声音继续, 底部浮迷你条)
    // 只有"退出播放"把 nowPlaying 清掉了, 那就不该再冒迷你条
    if (get(nowPlaying)) miniVisible.set(true);
  });

  /**
   * 拉某首的信息 (标题 / 作者 / 时长), 顺带起播
   *
   * @param {string} bvidToLoad 拉哪一首
   * @param {boolean} [onlyInfo] true = 只取信息, 不起播 (已经在放了)
   * @param {boolean} [silent]   true = 不显示"加载中" (切歌时悄悄换)
   */
  async function loadTrackInfo(bvidToLoad, onlyInfo, silent) {
    if (!bvidToLoad) return;
    // 先占位: 别重复拉同一首
    infoBvid = bvidToLoad;
    // 悄悄换 (切歌时) 不动 loading/error —— 拉不到就还用老信息,
    // 别把整页换成"加载失败"
    if (!silent) {
      loading = true;
      error = '';
    }
    try {
      const d = await getVideoInfo(bvidToLoad);
      // 期间又切歌了 → 这份信息不要了
      if (bvidToLoad !== infoBvid) return;
      info = d;
      if (!onlyInfo) {
        // 直接用 URL 进听视频页 → 这首放到播放列表最顶上, 然后开始播
        //
        // ⚠️ **不 await**: 拉音频地址要好几秒, 等它才渲染的话页面会一直
        // 卡在"加载中"。先把封面/标题显示出来, 声音在后台起播。
        // (playItemOnTop 内部自己 catch 错误, 不会变成未处理的 rejection)
        playItemOnTop({
          bvid: d.bvid || bvidToLoad,
          cid: d.cid,
          title: d.title,
          pic: d.pic,
          owner: d.owner ? { mid: d.owner.mid, name: d.owner.name } : null,
          duration: d.duration
        });
      }
      // 互动状态 (登录了才查)
      if ($isLogin) {
        getStatus(bvidToLoad).then(st => {
          if (bvidToLoad === infoBvid) status = st;
        }).catch(() => {});
      }
    } catch (e) {
      if (bvidToLoad !== infoBvid) return;
      if (!silent) error = e.message || '加载失败';
    } finally {
      if (bvidToLoad === infoBvid && !silent) loading = false;
    }
  }

  // ── 最小化 ──────────────────────────────────────────────────────────
  function minimize() {
    miniVisible.set(true);
    navigate(-1);
  }

  // ── 播放控制行 ──────────────────────────────────────────────────────
  // 这三个键也是「更多」菜单里的「上一首 / 下一首 / 播放·暂停」——
  // 触屏机型直接点, 不能触屏的机型走菜单, 两条路都在。
  function onPrev() { prevTrack(); }
  function onNext() { nextTrack(false); }
  function onToggle() { togglePlay(); }

  // ── 互动 ────────────────────────────────────────────────────────────
  //
  // ⚠️ 互动的是**正在放的那首** (切过歌之后, URL 里那首已经不是当前这首了)
  async function doLike() {
    if (!needLogin()) return;
    const old = status.like;
    status = { ...status, like: old ? 0 : 1 };
    try {
      await likeVideo(curBvid, !old);
      showToast(status.like ? '✓ 已点赞' : '已取消点赞');
    } catch (e) {
      status = { ...status, like: old };
      showToast('操作失败');
    }
  }

  async function doCoin() {
    if (!needLogin()) return;
    const old = status.coin;
    status = { ...status, coin: 1 };
    try {
      await coinVideo(curBvid, 1);
      showToast('✓ 已投币');
    } catch (e) {
      status = { ...status, coin: old };
      showToast('操作失败');
    }
  }

  async function doFav() {
    if (!needLogin()) return;
    const old = status.fav;
    status = { ...status, fav: old ? 0 : 1 };
    try {
      if (old) await unfavVideo(curBvid);
      else await favVideo(curBvid);
      showToast(status.fav ? '✓ 已收藏' : '已取消收藏');
    } catch (e) {
      status = { ...status, fav: old };
      showToast('操作失败');
    }
  }

  async function doTriple() {
    if (!needLogin()) return;
    try {
      await tripleAction(curBvid);
      status = { ...status, like: 1, coin: 1, fav: 1 };
      showToast('✓ 一键三连');
    } catch (e) {
      showToast('操作失败');
    }
  }

  function openComments() {
    const aid = (info && info.aid) || '';
    navigate('/listen-comments?bvid=' + encodeURIComponent(curBvid) + '&aid=' + aid);
  }

  function doExit() {
    stopPlayback();
    navigate(-1);
  }

  // ── 播放列表的四级菜单动作 ──────────────────────────────────────────
  //
  // 从播放列表里删掉一首 / 把它往上往下挪一格。
  // 挪动和删除都要把 currentIndex 跟着挪 —— 不然"正在放的是第几首"就错了
  // (在 store 里处理, 见 stores/player.js)。
  function onRemove(i) {
    const title = (get(playlist).items[i] || {}).title || '这一首';
    if (removeFromPlaylist(i)) showToast('已从播放列表删除: ' + shortTitle(title));
  }

  function onMove(i, delta) {
    if (moveInPlaylist(i, delta)) {
      showToast(delta < 0 ? '已上移' : '已下移');
    }
  }

  // ── 菜单 (右软键) ───────────────────────────────────────────────────
  function buildMenu() {
    const p = get(playlist);
    return buildListenMenu({
      ownerMid: info && info.owner ? info.owner.mid : 0,
      bvid: curBvid,
      playlist: p.items,
      currentIndex: $currentIndex,
      playMode: $playMode,
      liked: !!status.like,
      onAuthor: mid => { if (mid) navigate('/user?uid=' + mid); },
      onPick: i => { playIndex(i); },
      onRemove: onRemove,
      onMove: onMove,
      onPlayMode: id => {
        if (setPlayMode(id)) showToast('播放模式: ' + playModeLabel(id));
      },
      onSeek: sec => seekBy(sec),
      onVolume: d => requestSystemVolume(d),
      onPrev: onPrev,
      onNext: onNext,
      onLike: doLike,
      onCoin: doCoin,
      onFav: doFav,
      onTriple: doTriple,
      onComments: openComments,
      onExit: doExit
    });
  }

  // ── 按键 ────────────────────────────────────────────────────────────
  onMount(() => {
    // 右软键不自己绑: 软键栏的兜底作用域接管它 (菜单挂在 opts.menu 上)
    return onKey('listen', {
      Left: { press: () => seekBy(-SEEK_STEP) },
      Right: {
        press: () => seekBy(SEEK_STEP),
        long: () => setRate(2),      // 长按 → 键 = 2 倍速
        release: () => setRate(1)    // 松手恢复
      },
      Up: () => { requestSystemVolume(+1); },
      Down: () => { requestSystemVolume(-1); },
      // 中键 = 播放 / 暂停 (自动播放被系统拦下时, 也靠这一键起播)
      Enter: { press: () => togglePlay() },
      SoftLeft: minimize
    }, { softkeys: true, menu: () => buildMenu() });
  });
</script>

<div class="screen">
  <div class="listen">
    {#if loading}
      <div class="hint center">加载中...</div>
    {:else if error}
      <div class="hint center">{error}</div>
    {:else}
      <!-- 封面: 塞班播放器那种"/album 封面"占大头 -->
      <div class="cover-wrap">
        {#if coverUrl}
          <img class="cover" src={coverUrl} alt="" />
        {:else}
          <!-- 没有封面时画一个播放三角 (CSS 画的, 不吃字体字形) -->
          <div class="cover placeholder"><i class="tri-r"></i></div>
        {/if}
      </div>

      <!-- 歌名 / 作者 / 播放模式 -->
      <div class="meta">
        <div class="title">{title}</div>
        <div class="sub">
          <span class="owner">{owner}</span>
          <span class="mode">{modeLabel}</span>
        </div>
      </div>

      <!-- 进度条: 细条 + 小圆点滑块 (和塞班播放器一个观感) -->
      <div class="progress">
        <div class="track">
          <div class="played" style="width: {pct}%"></div>
          <div class="knob" style="left: {pct}%"></div>
        </div>
        <div class="times">
          <span>{fmt(time)}</span>
          <span>{fmt(duration)}</span>
        </div>
        <!--
          整段缓存进度: 边下边播 m4s 时老 Gecko 把它当直播流 (快不进去),
          快进时要把整段缓存下来换成整段播。把进度摆出来, 用户才知道
          "按了快进在等什么", 而不是以为坏了。
        -->
        {#if $playState.cacheRatio > 0 && $playState.cacheRatio < 1}
          <div class="cache">准备可快进的音频 {Math.round($playState.cacheRatio * 100)}%</div>
        {/if}
      </div>

      <!-- 播放控制行: 上一首 / 播放·暂停 / 下一首 -->
      <div class="controls">
        <div class="ctl" role="button" tabindex="-1" on:click={onPrev} aria-label="上一首">
          <span class="ic prev"><i class="bar"></i><i class="tri-l"></i></span>
        </div>
        <div class="ctl main" role="button" tabindex="-1" on:click={onToggle} aria-label="播放或暂停">
          {#if $playState.playing}
            <span class="ic pause"><i class="bar"></i><i class="bar"></i></span>
          {:else}
            <span class="ic play"><i class="tri-r"></i></span>
          {/if}
        </div>
        <div class="ctl" role="button" tabindex="-1" on:click={onNext} aria-label="下一首">
          <span class="ic next"><i class="tri-r"></i><i class="bar"></i></span>
        </div>
      </div>

      <!-- 键位提示: 只留软键栏里没有的那几条 -->
      <div class="keys">
        <div class="krow"><span class="kk">← →</span><span class="kv">快退 / 快进 10 秒</span></div>
        <div class="krow"><span class="kk">↑ ↓</span><span class="kv">音量加 / 减</span></div>
        <div class="krow"><span class="kk">长按 →</span><span class="kv">2 倍速</span></div>
      </div>
    {/if}
  </div>
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .listen {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px 12px;
    background: var(--md-sys-color-surface-bright);
    display: flex;
    flex-direction: column;
  }

  .hint.center {
    padding: 40px 8px;
    text-align: center;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* ---- 封面 ---- */
  .cover-wrap {
    display: flex;
    justify-content: center;
    flex-shrink: 0;
  }

  .cover {
    width: 192px;
    height: 108px;
    object-fit: cover;
    border-radius: var(--md-sys-shape-corner-medium);
    background: var(--md-sys-color-surface-container-high);
  }

  .cover.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--md-sys-color-surface-container-high);
  }

  /* 占位三角 (不是 .ic 里的那个, 单独给占位框用) */
  .cover.placeholder .tri-r {
    width: 0;
    height: 0;
    border-top: 8px solid transparent;
    border-bottom: 8px solid transparent;
    border-left: 12px solid var(--md-sys-color-on-surface-variant);
  }

  /* ---- 歌名 / 作者 ---- */
  .meta {
    padding: 8px 0 0;
    flex-shrink: 0;
  }

  .title {
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
    line-height: 1.35;
    /* 最多两行, 多了截掉 (塞班播放器也是这么干的) */
    max-height: 30px;
    overflow: hidden;
    word-wrap: break-word;
  }

  .sub {
    display: flex;
    align-items: center;
    padding-top: 3px;
  }

  .owner {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 播放模式: 一个粉色小标签, 摆在作者右边 */
  .mode {
    flex: 0 0 auto;
    margin-left: 6px;
    padding: 1px 6px;
    border-radius: var(--md-sys-shape-corner-full);
    background: var(--md-sys-color-primary-container);
    color: var(--md-sys-color-on-primary-container);
    font-size: var(--md-sys-typescale-label-small-size);
    line-height: 1.4;
  }

  /* ---- 进度条 ---- */
  .progress {
    padding: 10px 0 0;
    flex-shrink: 0;
  }

  .track {
    position: relative;
    height: 5px;
    border-radius: 3px;
    background: var(--md-sys-color-surface-container-highest);
  }

  .played {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    border-radius: 3px;
    background: var(--md-sys-color-primary);
  }

  /* 滑块: 小圆点 (塞班播放器的进度条上就有一个) */
  .knob {
    position: absolute;
    top: 50%;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--md-sys-color-primary);
    transform: translate(-50%, -50%);
  }

  .times {
    display: flex;
    justify-content: space-between;
    padding-top: 4px;
    font-size: var(--md-sys-typescale-label-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  .cache {
    padding-top: 2px;
    font-size: var(--md-sys-typescale-label-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* ---- 播放控制行 ---- */
  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 12px;
    flex-shrink: 0;
  }

  /* 用 div + role=button, 不用 <button>:
     老 Gecko (Gecko 48) 上 <button> 当 flex 容器时子元素不按 flex item 排,
     图标会被挤到第二行 (SoftkeyBar 的菜单项也是这么处理的)。 */
  .ctl {
    width: 38px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--md-sys-color-on-surface);
    cursor: pointer;
    outline: none;
  }

  .ctl.main {
    width: 50px;
    color: var(--md-sys-color-primary);
  }

  .ctl:active {
    opacity: 0.6;
  }

  /* 图标全是 CSS 画的三角/方块 —— 设备字体里不一定有 ⏮ ⏸ 这些字形 */
  .ic {
    display: flex;
    align-items: center;
  }

  .ic .bar {
    width: 2px;
    height: 12px;
    background: currentColor;
  }

  .ic .bar + .bar {
    margin-left: 3px;
  }

  .ic .tri-l,
  .ic .tri-r {
    width: 0;
    height: 0;
  }

  .ic .tri-l {
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-right: 8px solid currentColor;
  }

  .ic .tri-r {
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-left: 8px solid currentColor;
  }

  .ic.prev .bar {
    margin-right: 2px;
  }

  .ic.next .bar {
    margin-left: 2px;
  }

  /* ---- 键位提示 ---- */
  .keys {
    padding: 8px 0 4px;
    flex-shrink: 0;
  }

  .krow {
    display: flex;
    align-items: baseline;
    padding: 1px 0;
    font-size: var(--md-sys-typescale-label-small-size);
  }

  .kk {
    flex: 0 0 46px;
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
  }

  .kv {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
