<script>
  // 听视频页 (纯音频)
  //
  // URL: #/listen?bvid=<bvid>
  //
  // ── 页面干什么 ──────────────────────────────────────────────────────
  //   封面 + 标题 + 进度条, 下面用方向键控制:
  //     ←  快退 10 秒      →  快进 10 秒
  //     →  长按 = 2 倍速 (松手恢复 1 倍)
  //     ↑  系统音量+       ↓  系统音量−
  //   左软键 = 最小化 (收起这一页, 底部浮一条迷你条, 声音继续)
  //   右软键 = 更多 (二级菜单: UP主页/播放列表/点赞/投币/收藏/三连/评论/退出)
  //
  // ── 声音从哪来 ──────────────────────────────────────────────────────
  // 音频元素**不在这一页** —— 它挂在根组件 (App.svelte) 里, 跨路由不销毁,
  // 所以"最小化"之后声音不会断。引擎见 player/engine.js。

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
  import {
    playlist, nowPlaying, playState, currentIndex, miniVisible
  } from '../stores/player.js';
  import {
    playItem, playIndex, togglePlay, seekBy, setRate, stopPlayback
  } from '../player/engine.js';
  import { buildListenMenu } from '../menu/listenMenu.js';
  import { biliImg } from '../utils/platform.js';

  // 一次快进/快退多少秒
  const SEEK_STEP = 10;

  let bvid = '';
  let info = null;
  let loading = true;
  let error = '';
  let status = { like: 0, coin: 0, fav: 0 };
  /** 从迷你条回来说明"这次不是新开的一首", 别重复起播 */
  let resumed = false;

  // ── 播放进度 (来自引擎) ────────────────────────────────────────────
  $: time = $playState.time;
  $: duration = $playState.duration;
  // 软键文案: 中键写的是"按下之后会做什么" (正在播 → 「暂停」)
  $: setSoftkeys('最小化', '更多', $playState.playing ? '暂停' : '播放');

  // 封面跟着当前在放的那首走 (播放列表里切歌时封面跟着换)
  $: cur = $nowPlaying;
  $: coverUrl = cur && cur.pic ? biliImg(cur.pic, 240, 320, 'jpg') : '';

  function fmt(t) {
    if (!t || isNaN(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
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
  onMount(() => {
    // 从 URL 读 bvid
    const hash = location.hash || '';
    const m = /[?&]bvid=([^&]+)/.exec(hash);
    bvid = m ? decodeURIComponent(m[1]) : '';

    // 这一页是"展开"的播放器 → 迷你条先收起来
    miniVisible.set(false);

    if (!bvid) {
      error = '缺少视频 ID';
      loading = false;
    } else if (cur && cur.bvid === bvid) {
      // 从迷你条点回来的: 已经在放了, 不用重开
      resumed = true;
      loadInfo(true);
    } else {
      loadInfo(false);
    }
  });

  onDestroy(() => {
    // 离开这一页 = 收起 (声音继续, 底部浮迷你条)
    // 只有"退出播放"把 nowPlaying 清掉了, 那就不该再冒迷你条
    if (get(nowPlaying)) miniVisible.set(true);
  });

  /**
   * 拉视频信息 (封面 / 标题 / 作者), 顺带起播
   *
   * @param {boolean} onlyInfo 只取信息, 不起播 (已经在放了)
   */
  async function loadInfo(onlyInfo) {
    loading = true;
    error = '';
    try {
      const d = await getVideoInfo(bvid);
      info = d;
      if (!onlyInfo) {
        await playItem({
          bvid: d.bvid || bvid,
          cid: d.cid,
          title: d.title,
          pic: d.pic,
          owner: d.owner ? { mid: d.owner.mid, name: d.owner.name } : null,
          duration: d.duration
        });
      }
      // 互动状态 (登录了才查)
      if ($isLogin) {
        getStatus(bvid).then(st => { status = st; }).catch(() => {});
      }
    } catch (e) {
      error = e.message || '加载失败';
    } finally {
      loading = false;
    }
  }

  // ── 最小化 ──────────────────────────────────────────────────────────
  function minimize() {
    miniVisible.set(true);
    navigate(-1);
  }

  // ── 互动 ────────────────────────────────────────────────────────────
  async function doLike() {
    if (!needLogin()) return;
    const old = status.like;
    status = { ...status, like: old ? 0 : 1 };
    try {
      await likeVideo(bvid, !old);
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
      await coinVideo(bvid, 1);
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
      if (old) await unfavVideo(bvid);
      else await favVideo(bvid);
      showToast(status.fav ? '✓ 已收藏' : '已取消收藏');
    } catch (e) {
      status = { ...status, fav: old };
      showToast('操作失败');
    }
  }

  async function doTriple() {
    if (!needLogin()) return;
    try {
      await tripleAction(bvid);
      status = { ...status, like: 1, coin: 1, fav: 1 };
      showToast('✓ 一键三连');
    } catch (e) {
      showToast('操作失败');
    }
  }

  function openComments() {
    const aid = (info && info.aid) || '';
    navigate('/listen-comments?bvid=' + encodeURIComponent(bvid) + '&aid=' + aid);
  }

  function doExit() {
    stopPlayback();
    navigate(-1);
  }

  // ── 菜单 (右软键) ───────────────────────────────────────────────────
  function buildMenu() {
    const p = get(playlist);
    return buildListenMenu({
      ownerMid: info && info.owner ? info.owner.mid : 0,
      playlist: p.items,
      currentIndex: $currentIndex,
      liked: !!status.like,
      onAuthor: mid => { if (mid) navigate('/user?uid=' + mid); },
      onPick: i => { playIndex(i); },
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
      <!-- 封面 -->
      <div class="cover-wrap">
        {#if coverUrl}
          <img class="cover" src={coverUrl} alt="" />
        {:else}
          <div class="cover placeholder">♪</div>
        {/if}
      </div>

      <!-- 标题 / 作者 -->
      <div class="meta">
        <div class="title">{cur && cur.title ? cur.title : (info && info.title) || ''}</div>
        {#if info && info.owner}
          <div class="owner">{info.owner.name}</div>
        {/if}
      </div>

      <!-- 进度条 -->
      <div class="progress">
        <div class="track">
          <div class="played" style="width: {duration > 0 ? Math.min(100, (time / duration) * 100) : 0}%"></div>
        </div>
        <div class="times">
          <span>{fmt(time)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      <div class="keys">
        <div class="krow"><span class="kk">← →</span><span class="kv">快退 / 快进 10 秒</span></div>
        <div class="krow"><span class="kk">→ 长按</span><span class="kv">2 倍速</span></div>
        <div class="krow"><span class="kk">↑ ↓</span><span class="kv">音量加 / 减</span></div>
        <div class="krow"><span class="kk">中键</span><span class="kv">播放 / 暂停</span></div>
        <div class="krow"><span class="kk">左软键</span><span class="kv">最小化</span></div>
        <div class="krow"><span class="kk">右软键</span><span class="kv">更多</span></div>
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
    padding: 6px;
    background: var(--md-sys-color-surface-bright);
  }

  .hint.center {
    padding: 40px 8px;
    text-align: center;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  .cover-wrap {
    display: flex;
    justify-content: center;
  }

  .cover {
    width: 132px;
    height: 78px;
    object-fit: cover;
    border-radius: var(--md-sys-shape-corner-medium);
    background: var(--md-sys-color-surface-container-high);
  }

  .cover.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 34px;
    color: var(--md-sys-color-on-surface-variant);
  }

  .meta {
    padding: 6px 2px 2px;
  }

  .title {
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
    max-height: 40px;
    overflow: hidden;
  }

  .owner {
    padding-top: 2px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  .progress {
    padding: 8px 2px 2px;
  }

  .track {
    height: 6px;
    border-radius: 3px;
    background: var(--md-sys-color-surface-container-highest);
    overflow: hidden;
  }

  .played {
    height: 100%;
    background: var(--md-sys-color-primary);
  }

  .times {
    display: flex;
    justify-content: space-between;
    padding-top: 3px;
    font-size: var(--md-sys-typescale-label-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  .keys {
    padding: 8px 2px 12px;
  }

  .krow {
    display: flex;
    align-items: baseline;
    padding: 2px 0;
    font-size: var(--md-sys-typescale-body-small-size);
  }

  .kk {
    flex: 0 0 58px;
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
  }

  .kv {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
