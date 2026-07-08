<script>
  import { onMount, onDestroy } from 'svelte';
  import { getVideoInfo, getPlayUrl, getDashUrls } from '../api/video.js';
  import { getReplies, getStatus, likeVideo, coinVideo, favVideo, unfavVideo, tripleAction } from '../api/interact.js';
  import { isLogin } from '../stores/user.js';
  import { offKey } from '../keyboard/index.js';
  import { navigate } from '../router/index.js';
  import { setSoftkeys, showToast } from '../stores/ui.js';
  import { addLocal } from '../stores/history.js';
  import VideoPlayer from '../player/VideoPlayer.svelte';
  import Loading from '../components/Loading.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  let videoSrc = '';           // 视频流 URL (mp4 / m4s)
  let audioSrc = '';           // 音频流 URL (m4s, 听视频模式)
  let poster = '';
  let title = '';
  let loading = true;
  let error = '';
  let playerMode = 'video';    // 'video' | 'audio'
  let resumeAt = 0;            // 听视频时保存 currentTime, 切回 video 时恢复

  let meta = null;
  let status = { like: 0, coin: 0, fav: 0, attention: 0 };
  let counts = { like: 0, coin: 0, fav: 0 };
  let loadingFlag = { like: false, coin: false, fav: false };
  let replies = [];
  let replySort = 2;
  let replyLoading = false;

  let currentBvid = '';        // 当前播放视频的 bvid
  let currentAid = 0;          // 当前视频的 aid
  let currentCid = 0;          // 当前视频的 cid
  let currentOwner = null;     // 当前视频的作者信息
  let currentDuration = 0;     // 当前视频时长

  // 从 URL query 参数获取 bvid
  function getBvidFromUrl() {
    const hash = location.hash || '';
    const match = hash.match(/[?&]bvid=([^&]+)/);
    return match ? match[1] : '';
  }

  async function loadVideo() {
    // 从 URL query 参数获取 bvid
    const bvid = getBvidFromUrl();

    if (!bvid) {
      error = '缺少视频 ID';
      loading = false;
      return;
    }

    currentBvid = bvid;
    loading = true;
    error = '';
    // 重置听视频状态
    playerMode = 'video';
    resumeAt = 0;

    try {
      // 1. 视频信息
      const info = await getVideoInfo(bvid);
      meta = info;
      currentAid = info.aid;
      currentCid = info.cid;
      currentOwner = info.owner || null;
      currentDuration = info.duration || 0;
      title = info.title;
      poster = info.pic;
      counts = {
        like: info.stat ? info.stat.like : 0,
        coin: info.stat ? info.stat.coin : 0,
        fav: info.stat ? info.stat.favorite : 0
      };

      // 2. 拉 DASH 拿独立音视频流 (供听视频模式用)
      try {
        const dash = await getDashUrls(bvid, info.cid, 16);
        if (dash) {
          videoSrc = dash.videoUrl;
          audioSrc = dash.audioUrl;
        }
      } catch (e) {
        // DASH 拉取失败, 退回到 MP4 单流 (听视频功能不可用, 但视频能播)
        videoSrc = await getPlayUrl(bvid, info.cid, 16);
        audioSrc = '';
      }
      if (!videoSrc) {
        error = '无法获取播放地址';
        return;
      }

      // 3. 状态 + 评论 (登录后才查)
      if ($isLogin) {
        try { status = await getStatus(bvid); } catch (e) { /* ignore */ }
      }
      await loadReplies();

      // 4. 记录到历史
      addLocal({
        bvid: bvid,
        aid: currentAid,
        cid: currentCid,
        title: title,
        pic: poster,
        owner: currentOwner,
        duration: currentDuration
      });
    } catch (e) {
      error = e.message || '加载失败';
    } finally {
      loading = false;
    }
  }

  // 听视频模式切入口 - 由 VideoPlayer 内部 * 键触发
  function onListenOn(e) {
    if (!audioSrc) {
      showToast('该视频无独立音频流');
      return;
    }
    resumeAt = e.detail || 0;
    playerMode = 'audio';
  }

  function onListenOff(e) {
    resumeAt = e.detail || 0;
    playerMode = 'video';
  }

  async function loadReplies() {
    if (!meta || !meta.aid) return;
    replyLoading = true;
    try {
      const d = await getReplies(meta.aid, { pn: 1, ps: 20, sort: replySort });
      replies = (d && d.replies) ? d.replies : [];
    } catch (e) {
      // 忽略,保留之前的数据
    } finally {
      replyLoading = false;
    }
  }

  function onEnded() {
    showToast('已播完');
  }

  function needLogin() {
    if (!$isLogin) {
      showToast('请先登录');
      // navigate('#/login');
    }
    return $isLogin;
  }

  async function doLike() {
    if (!needLogin()) return;
    if (loadingFlag.like) return;
    loadingFlag.like = true;
    const old = status.like;
    // 乐观更新
    status.like = old ? 0 : 1;
    counts.like += old ? -1 : 1;
    try {
      await likeVideo(currentBvid, !old);
    } catch (e) {
      status.like = old;
      counts.like += old ? 1 : -1;
      showToast('操作失败');
    } finally {
      loadingFlag.like = false;
    }
  }

  async function doCoin() {
    if (!needLogin()) return;
    if (loadingFlag.coin) return;
    loadingFlag.coin = true;
    const old = status.coin;
    status.coin = 1;
    counts.coin += old ? 0 : 1;
    try {
      await coinVideo(currentBvid, 1);
    } catch (e) {
      status.coin = old;
      counts.coin += old ? 0 : -1;
      showToast('操作失败');
    } finally {
      loadingFlag.coin = false;
    }
  }

  async function doFav() {
    if (!needLogin()) return;
    if (loadingFlag.fav) return;
    loadingFlag.fav = true;
    const old = status.fav;
    status.fav = old ? 0 : 1;
    counts.fav += old ? -1 : 1;
    try {
      if (old) {
        await unfavVideo(currentBvid);
      } else {
        await favVideo(currentBvid);
      }
    } catch (e) {
      status.fav = old;
      counts.fav += old ? 1 : -1;
      showToast('操作失败');
    } finally {
      loadingFlag.fav = false;
    }
  }

  async function doTriple() {
    if (!needLogin()) return;
    // 一键三连: 赞 + 币 + 藏
    try {
      await tripleAction(currentBvid);
      status = { ...status, like: 1, coin: 1, fav: 1 };
      showToast('✓ 一键三连');
    } catch (e) {
      // 部分接口可能失败, 退化为单接口调用
      try { await doLike(); } catch (_) {}
      try { await doCoin(); } catch (_) {}
      try { await doFav(); } catch (_) {}
    }
  }

  let isPlaying = false; // 当前播放状态

  let activeTabKey = 'detail'; // 当前激活的 tab

  function onTabChange(e) {
    activeTabKey = e.detail;
    updateSoftkeys();
  }

  function onPlayState(e) {
    isPlaying = e.detail.playing;
    updateSoftkeys();
  }

  function onFullscreen() {
    if (currentBvid) {
      navigate('/fullscreen?bvid=' + currentBvid);
    }
  }

  function updateSoftkeys() {
    const centerLabel = isPlaying ? '暂停' : '播放';
    setSoftkeys('全屏', '回复', centerLabel);
  }

  onMount(() => {
    updateSoftkeys();
    loadVideo();
  });

  onDestroy(() => {
    offKey('player');
  });
</script>

<div class="screen">
  <div class="main player-main">
    {#if loading}
      <Loading message="加载中..." />
    {:else if error}
      <div class="status err">
        <p>{error}</p>
        <p class="hint">按 Back 返回</p>
      </div>
    {:else if videoSrc}
      <VideoPlayer
        src={videoSrc}
        audioSrc={audioSrc}
        {poster}
        {title}
        mode={playerMode}
        resumeAt={resumeAt}
        {meta}
        {status}
        {counts}
        {replies}
        {replyLoading}
        on:ended={onEnded}
        on:listenon={onListenOn}
        on:listenoff={onListenOff}
        on:tabchange={onTabChange}
        on:playstate={onPlayState}
        on:fullscreen={onFullscreen}
      />
    {:else}
      <EmptyState message="暂无数据" />
    {/if}
  </div>
</div>

<style>
  .player-main {
    background: var(--md-sys-color-surface-bright);
    display: flex;
    flex-direction: column;
  }
  .status {
    padding: 20px 8px;
    text-align: center;
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--md-sys-typescale-body-medium-size);
  }
  .status.err {
    color: var(--md-sys-color-error);
  }
  .hint {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-top: 4px;
  }
</style>
