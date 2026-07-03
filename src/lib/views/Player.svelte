<script>
  import { onMount, onDestroy } from 'svelte';
  import { queue, next } from '../stores/queue.js';
  import { getVideoInfo, getPlayUrl, getDashUrls } from '../api/video.js';
  import { getReplies, getStatus, likeVideo, coinVideo, favVideo, unfavVideo, tripleAction } from '../api/interact.js';
  import { isLogin } from '../stores/user.js';
  import { onKey, offKey, moveFocus } from '../keyboard/index.js';
  import { navigate, back } from '../router/index.js';
  import { setSoftkeys, showToast } from '../stores/ui.js';
  import { addLocal } from '../stores/history.js';
  import VideoPlayer from '../player/VideoPlayer.svelte';
  import VideoMeta from '../components/VideoMeta.svelte';
  import InteractBar from '../components/InteractBar.svelte';
  import CommentList from '../components/CommentList.svelte';
  import TabBar from '../components/TabBar.svelte';
  import Loading from '../components/Loading.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  let tab = 'play';            // 'play' | 'detail'
  let detailSection = 0;       // 0=meta, 1=interact, 2=comments

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

  const detailTabs = [
    { key: 'meta',     label: '简介' },
    { key: 'interact', label: '互动' },
    { key: 'comments', label: '评论' }
  ];

  $: current = $queue.items[$queue.index];

  async function loadVideo() {
    if (!current) {
      error = '队列为空';
      loading = false;
      return;
    }
    loading = true;
    error = '';
    // 重置听视频状态
    playerMode = 'video';
    resumeAt = 0;
    try {
      // 1. 视频信息
      const info = await getVideoInfo(current.bvid);
      meta = info;
      current.cid = info.cid;
      current.aid = info.aid;
      if (!current.title) current.title = info.title;
      if (!current.pic) current.pic = info.pic;
      title = current.title;
      poster = current.pic;
      counts = {
        like: info.stat ? info.stat.like : 0,
        coin: info.stat ? info.stat.coin : 0,
        fav: info.stat ? info.stat.favorite : 0
      };

      // 2. 拉 DASH 拿独立音视频流 (供听视频模式用)
      try {
        const dash = await getDashUrls(current.bvid, info.cid, 16);
        if (dash) {
          videoSrc = dash.videoUrl;
          audioSrc = dash.audioUrl;
        }
      } catch (e) {
        // DASH 拉取失败, 退回到 MP4 单流 (听视频功能不可用, 但视频能播)
        videoSrc = await getPlayUrl(current.bvid, info.cid, 16);
        audioSrc = '';
      }
      if (!videoSrc) {
        error = '无法获取播放地址';
        return;
      }

      // 3. 状态 + 评论 (登录后才查)
      if ($isLogin) {
        try { status = await getStatus(current.bvid); } catch (e) { /* ignore */ }
      }
      await loadReplies();

      // 4. 记录到历史
      addLocal({
        bvid: current.bvid,
        aid: current.aid,
        cid: current.cid,
        title: title,
        pic: poster,
        owner: current.owner || (info.owner || null),
        duration: info.duration
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
    if ($queue.index < $queue.items.length - 1) {
      next();
      loadVideo();
    } else {
      showToast('已播完');
    }
  }

  function needLogin() {
    if (!$isLogin) {
      showToast('请先登录');
      navigate('#/login');
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
      await likeVideo(current.bvid, !old);
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
      await coinVideo(current.bvid, 1);
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
        await unfavVideo(current.bvid);
      } else {
        await favVideo(current.bvid);
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
      await tripleAction(current.bvid, { multiply: 1 });
      status = { ...status, like: 1, coin: 1, fav: 1 };
      showToast('✓ 一键三连');
    } catch (e) {
      // 部分接口可能失败, 退化为单接口调用
      try { await doLike(); } catch (_) {}
      try { await doCoin(); } catch (_) {}
      try { await doFav(); } catch (_) {}
    }
  }

  function changeDetailSection(i) {
    detailSection = i;
  }

  function onKeyEvent(e) {
    // 数字键: 详情页
    if (tab === 'detail') {
      if (e.key === '1' || e.keyCode === 49) { e.preventDefault(); doLike(); return; }
      if (e.key === '2' || e.keyCode === 50) { e.preventDefault(); doCoin(); return; }
      if (e.key === '3' || e.keyCode === 51) { e.preventDefault(); doFav(); return; }
      if (e.key === '0' || e.keyCode === 48) { e.preventDefault(); doTriple(); return; }
    }
    // 5: 切 tab
    if (e.key === '5' || e.keyCode === 53) {
      e.preventDefault();
      tab = tab === 'play' ? 'detail' : 'play';
      setSoftkeys(tab === 'play' ? '详情' : '播放', '返回');
      return;
    }
  }

  onMount(() => {
    setSoftkeys('详情', '返回');
    loadVideo();
    window.addEventListener('keydown', onKeyEvent);
  });

  onDestroy(() => {
    offKey('player');
    window.removeEventListener('keydown', onKeyEvent);
  });
</script>

<div class="screen">
  <div class="main player-main">
    {#if tab === 'play'}
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
          on:ended={onEnded}
          on:listenon={onListenOn}
          on:listenoff={onListenOff}
        />
      {/if}
    {:else}
      <TabBar tabs={detailTabs} active={detailSection} on:change={(e) => changeDetailSection(e.detail)} />
      <div class="detail-area">
        {#if detailSection === 0}
          <VideoMeta {meta} />
        {:else if detailSection === 1}
          <InteractBar
            {status}
            {counts}
            loading={loadingFlag}
            on:like={doLike}
            on:coin={doCoin}
            on:fav={doFav}
            on:needlogin={needLogin}
          />
          <div class="tip">
            <p>1=点赞  2=投币  3=收藏  0=一键三连</p>
            <p>←→ 切换区段  5 返回播放</p>
          </div>
        {:else}
          {#if replyLoading}
            <Loading message="加载评论..." />
          {:else}
            <CommentList {replies} />
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .player-main {
    background: var(--md-sys-color-surface-bright);
    display: flex;
    flex-direction: column;
  }
  .detail-area {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .detail-area > :global(*) {
    flex-shrink: 0;
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
  .tip {
    padding: 4px 8px;
    background: var(--md-sys-color-surface-container-low);
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    border-top: 1px solid var(--md-sys-color-outline-variant);
  }
  .tip p {
    margin: 1px 0;
  }
</style>
