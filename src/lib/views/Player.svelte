<script>
  import { onMount, onDestroy } from 'svelte';
  import { getVideoInfo, getPlayUrl, getDashUrls } from '../api/video.js';
  import { getReplies, getStatus, likeVideo, coinVideo, favVideo, unfavVideo, tripleAction, reportProgress } from '../api/interact.js';
  import { isLogin } from '../stores/user.js';
  import { settings } from '../stores/settings.js';
  import { navigate } from '../router/index.js';
  import { setSoftkeys, showToast } from '../stores/ui.js';
  import { addLocal } from '../stores/history.js';
  import { playItemOnTop } from '../player/engine.js';
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

  // 视频详情页的默认清晰度: 240P (qn=6)
  //   240×320 的屏上 240P 够看, 又最省流量。
  //   全屏页可以调 (菜单里改), 详情页固定这一档。
  const DETAIL_QUALITY = 6;

  // 打开视频要不要立刻加载并播放
  //   true  = 保持原样, 打开就拉流并播放
  //   false = 不拉流也不播, 只显示封面, 按中键(播放)才去拉流
  // settings 里没这个字段的老数据按 true 处理 (见 stores/settings.js)
  $: autoPlay = $settings.autoPlay !== false;

  let streamLoading = false;   // 用户按了播放, 正在拉播放地址
  let streamError = '';        // 拉播放地址失败

  let meta = null;
  let status = { like: 0, coin: 0, fav: 0, attention: 0 };
  let counts = { like: 0, coin: 0, fav: 0 };
  let loadingFlag = { like: false, coin: false, fav: false };
  let replies = [];
  let replyPage = 1;
  let replyHasMore = true;
  let replyLoadingMore = false;
  let replyError = '';
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

  // 从 URL query 参数获取起始播放时间
  function getStartTimeFromUrl() {
    const hash = location.hash || '';
    const match = hash.match(/[?&]t=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * 拉播放地址
   *
   * 视频详情页固定 **240P** (qn=6): 240×320 的屏上 240P 足够看清,
   * 又最省流量。B 站没有的档会给回可用档 (比如这视频只有 360P/720P,
   * 就给 360P) —— 那是 B 站的事, 我们这边只管"要 240P"。
   *
   * 走 **MP4 单流** 而不是 DASH: DASH 压根没有 240P 档 (最低 360P),
   * 拿 DASH 等于悄悄用回 360P, 和"详情页默认 240P"对不上。
   *
   * @param {string} bvid
   * @param {number} cid
   * @returns {Promise<{src: string, audio: string}>}
   */
  async function fetchStream(bvid, cid) {
    let src = '';
    let audio = '';
    // 1. 视频流: MP4 单流, 240P
    try {
      src = await getPlayUrl(bvid, cid, DETAIL_QUALITY);
    } catch (e) {
      src = '';
    }
    // 2. 听视频模式要独立音频 → 单独拉一次 DASH (只取音频)
    //    MP4 单流拿不到时, 视频流也退回 DASH (那档可能比 240P 高, 但能播)
    try {
      const dash = await getDashUrls(bvid, cid, DETAIL_QUALITY);
      if (dash) {
        audio = dash.audioUrl;
        if (!src && dash.videoUrl) src = dash.videoUrl;
      }
    } catch (e) {
      // DASH 拉取失败 (不影响 MP4 单流)
    }
    return { src, audio };
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
    // 从 URL 读取起始播放位置
    resumeAt = getStartTimeFromUrl();

    try {
      // 1. 视频信息 (封面/标题/详情都要它)
      const info = await getVideoInfo(bvid);
      meta = info;
      currentAid = info.aid;
      currentCid = info.cid;
      currentOwner = info.owner || null;
      // 作者信息到了, 右软键才有"主页"可显示
      updateSoftkeys();
      currentDuration = info.duration || 0;
      title = info.title;
      poster = info.pic;
      counts = {
        like: info.stat ? info.stat.like : 0,
        coin: info.stat ? info.stat.coin : 0,
        fav: info.stat ? info.stat.favorite : 0
      };

      if (autoPlay) {
        // 老行为: 拉流 + 状态 + 评论, 都好了才显示页面
        const s = await fetchStream(bvid, info.cid);
        if (!s.src) {
          error = '无法获取播放地址';
          return;
        }
        videoSrc = s.src;
        audioSrc = s.audio;

        // 3. 状态 + 评论 (登录后才查)
        if ($isLogin) {
          try { status = await getStatus(bvid); } catch (e) { /* ignore */ }
        }
        await loadReplies();
      } else {
        // 不立刻播放: 封面先出来, 评论在后台慢慢加载, 播放地址等用户按播放再拉
        loading = false;
        if ($isLogin) {
          getStatus(bvid).then(st => { status = st; }).catch(() => {});
        }
        loadReplies();
      }

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

  /**
   * 设置里关了"打开立刻播放" → 用户按了播放, 这时才去拉播放地址
   *
   * 拉到的地址交给 <video> 元素, 它 loadedmetadata 之后会自动播起来
   */
  async function onPlayRequest() {
    if (videoSrc || streamLoading) return;
    streamLoading = true;
    streamError = '';
    try {
      const s = await fetchStream(currentBvid, currentCid);
      if (!s.src) {
        streamError = '无法获取播放地址';
        return;
      }
      videoSrc = s.src;
      audioSrc = s.audio;
    } catch (e) {
      streamError = e.message || '加载失败';
    } finally {
      streamLoading = false;
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
    replyError = '';
    replyPage = 1;
    try {
      const d = await getReplies(meta.aid, { pn: 1, ps: 20, sort: replySort });
      replies = (d && d.replies) ? d.replies : [];
      replyHasMore = replies.length >= 20;
    } catch (e) {
      // 保留之前的数据, 但把错误显示出来 (而不是伪装成"没有更多评论")
      replyError = e.message || '评论加载失败';
    } finally {
      replyLoading = false;
    }
  }

  // 加载更多评论 (评论列表末尾的"加载更多评论")
  async function loadMoreReplies() {
    if (!meta || !meta.aid) return;
    if (replyLoadingMore || !replyHasMore) return;
    replyLoadingMore = true;
    try {
      const next = replyPage + 1;
      const d = await getReplies(meta.aid, { pn: next, ps: 20, sort: replySort });
      const more = (d && d.replies) ? d.replies : [];
      replies = replies.concat(more);
      replyPage = next;
      replyHasMore = more.length >= 20;
    } catch (e) {
      replyError = e.message || '评论加载失败';
    } finally {
      replyLoadingMore = false;
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
      // 播放器页没有点赞按钮 (InteractBar 那套 UI 没接进页面),
      // 所以动作的结果得给个提示, 否则按了跟没按一样
      showToast(status.like ? '✓ 已点赞' : '已取消点赞');
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
      showToast('✓ 已投币');
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
      showToast(status.fav ? '✓ 已收藏' : '已取消收藏');
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
  let currentTime = 0;   // 当前播放进度（秒）

  // 观看进度上报定时器
  /** @type {number|null} */
  let reportTimer = null;
  let lastReportedTime = 0;

  let activeTabKey = 'detail'; // 当前激活的 tab
  let commentHint = '';        // 评论列表里中键的提示 (展开/收起/更多)
  let commentInList = false;   // 焦点是不是在评论列表里

  function onTabChange(e) {
    activeTabKey = e.detail;
    // 离开评论 tab 时清掉提示, 免得回来还显示上次的文案
    if (activeTabKey !== 'comments') {
      commentHint = '';
      commentInList = false;
    }
    updateSoftkeys();
  }

  // 上报观看进度
  function doReportProgress() {
    if (!currentAid || !currentCid) return;
    const progress = Math.floor(currentTime);
    // 避免重复上报同一进度
    if (progress === lastReportedTime) return;
    lastReportedTime = progress;
    reportProgress(currentAid, currentCid, progress).catch(() => {});
  }

  // 启动进度上报定时器
  function startReportTimer() {
    if (reportTimer) clearInterval(reportTimer);
    reportTimer = setInterval(doReportProgress, 15000);
  }

  // 停止进度上报定时器
  function stopReportTimer() {
    if (reportTimer) {
      clearInterval(reportTimer);
      reportTimer = null;
    }
  }

  function onPlayState(e) {
    isPlaying = e.detail.playing;
    updateSoftkeys();
    // 播放状态变化时处理上报
    if (isPlaying) {
      startReportTimer();
    } else {
      stopReportTimer();
      doReportProgress();
    }
  }

  function onFullscreen(e) {
    if (currentBvid) {
      const t = e.detail && e.detail.currentTime ? Math.floor(e.detail.currentTime) : 0;
      navigate('/fullscreen?bvid=' + currentBvid + '&t=' + t);
    }
  }

  function updateSoftkeys() {
    const inComments = activeTabKey === 'comments';
    // 中键提示:
    //   焦点在评论列表里 → 跟着焦点走 (展开 / 收起 / 更多), 没有动作就不显示
    //   焦点不在评论列表里 → 中键是播放/暂停
    let centerLabel;
    if (inComments && commentInList) {
      centerLabel = commentHint;
    } else {
      centerLabel = isPlaying ? '暂停' : '播放';
    }
    // 返回由退格键 (Back) 负责 —— 右软键不占返回, 它留给页面自己派活
    // 左软键: 评论 tab = 回复 (功能下线, 显示「待实现」), 详情 tab = 全屏
    const leftLabel = inComments ? '待实现' : '全屏';
    // 右软键: 交给软键栏的「更多」菜单 (二级/三级) —— 文案由菜单自己给,
    // 这里留空, 免得两处文案打架 (进 UP 主页的动作已经挪进菜单的第一项)
    const rightLabel = '';
    setSoftkeys(leftLabel, rightLabel, centerLabel);
  }

  // 评论列表里中键的提示 (展开 / 收起 / 更多), 由 CommentSection 报上来
  function onCommentFocusChange(e) {
    commentHint = (e.detail && e.detail.hint) ? e.detail.hint : '';
    commentInList = !!(e.detail && e.detail.inList);
    updateSoftkeys();
  }

  // 右软键: 进 UP 主主页
  function onAuthor(e) {
    const mid = e.detail && e.detail.mid;
    if (mid) {
      navigate('/user?uid=' + mid);
    }
  }

  /** 进听视频页 (纯音频播放) */
  function onListen(e) {
    const bvid = e.detail && e.detail.bvid;
    if (!bvid) return;
    // 详情页点「听视频」→ 这首放到播放列表**最顶上**, 然后开始播,
    // 再跳到听视频页 (页面进来时已经在放了, 不会又从头起一次)
    playItemOnTop({
      bvid: bvid,
      cid: meta && meta.cid,
      title: meta && meta.title,
      pic: meta && meta.pic,
      owner: meta && meta.owner ? { mid: meta.owner.mid, name: meta.owner.name } : null,
      duration: meta && meta.duration
    });
    navigate('/listen?bvid=' + encodeURIComponent(bvid));
  }

  onMount(() => {
    updateSoftkeys();
    loadVideo();
  });

  onDestroy(() => {
    // 组件销毁时停止上报并上报最终进度
    stopReportTimer();
    doReportProgress();
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
    {:else if meta}
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
        {replyHasMore}
        {replyError}
        streamLoading={streamLoading}
        streamError={streamError}
        on:ended={onEnded}
        on:listenon={onListenOn}
        on:listenoff={onListenOff}
        on:tabchange={onTabChange}
        on:playstate={onPlayState}
        on:focuschange={onCommentFocusChange}
        on:fullscreen={onFullscreen}
        on:author={onAuthor}
        on:listen={onListen}
        on:like={doLike}
        on:coin={doCoin}
        on:fav={doFav}
        on:triple={doTriple}
        on:loadmore={loadMoreReplies}
        on:playrequest={onPlayRequest}
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
