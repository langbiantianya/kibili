<script>
  import { onMount, onDestroy } from 'svelte';
  import { getVideoInfo, getPlayUrl, getDashUrls } from '../api/video.js';
  import { getStatus, likeVideo, coinVideo, favVideo, unfavVideo, tripleAction } from '../api/interact.js';
  import { settings } from '../stores/settings.js';
  import { requestSystemVolume } from '../player/volume.js';
  import { onKey } from '../keyboard/index.js';
  import { setSoftkeys, showToast } from '../stores/ui.js';
  import { isLogin } from '../stores/user.js';
  import { buildVideoMenu } from '../player/videoMenu.js';
  import { navigate } from '../router/index.js';
  import { biliImg } from '../utils/platform.js';

  let videoSrc = '';
  let audioSrc = '';
  let title = '';
  let poster = '';
  let loading = true;
  let error = '';

  // 打开视频要不要立刻加载并播放 (设置里没这个字段的老数据按 true 处理)
  $: autoPlay = $settings.autoPlay !== false;
  let streamLoading = false;   // 用户按了播放, 正在拉播放地址
  let streamError = '';

  /** @type {any} */
  let video;
  /** @type {HTMLAudioElement|null} */
  let dashAudio = null;

  let currentBvid = '';        // 当前播放视频的 bvid
  let currentCid = 0;          // 当前视频的 cid (拉播放地址要用)
  let playError = '';          // 播放失败提示 (视频解码/URL 失效时不再只显示黑屏)

  let normalPlaybackRate = 1.0; // 保存正常播放速度
  let isSpeedUp = false;        // 是否正在倍速播放

  // 一次快进/快退多少秒
  const SEEK_STEP = 10;

  // UP 主 mid (「UP 主页」菜单项要它; 没有作者信息时那一项是灰的)
  let ownerMid = 0;

  // 互动状态 (点赞/投币/收藏): 菜单里「点赞」「收藏」是**切换**,
  // 得知道当前是已赞还是未赞 —— 登录后查一次状态。
  let status = { like: 0, coin: 0, fav: 0 };

  // 设置里「全屏播放显示菜单」关了 → 全屏不接管二级菜单, 左软键空着
  $: fullscreenMenu = $settings.fullscreenMenu !== false;

  // 长按检测参数 (和视频详情页一致)
  const LONG_PRESS_MS = 400;   // 长按阈值

  // 进度条相关
  let currentTime = 0;
  let duration = 0;
  let buffered = 0;

  // 从普通播放器传入的初始播放位置（秒）
  let startAt = 0;

  /*
    屏幕方向: 竖屏 (240x320) 时视频要转 90° 横着放, 用户把手机横过来看。
    屏幕本来就是横的 (少见, 但不能写死) → 不转, 直接铺满。
  */
  let isLandscape = false;
  // 封面按"横屏"尺寸要: 宽 = 视口长边, 高按 16:9
  let posterW = 320;
  let posterH = 180;

  function updateOrientation() {
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    isLandscape = vw > vh;
    const w = Math.max(vw, vh) || 320;
    posterW = w;
    posterH = Math.round(w * 9 / 16);
  }

  // 静音状态: 与普通播放器共用 settings.muted
  // (系统音量接口在 KaiOS 2.4 上没有静音方法, 静音只能由应用把媒体元素 muted 置位)
  $: muted = $settings.muted;
  $: if (video) { try { video.muted = muted; } catch (e) {} }
  $: if (dashAudio) { try { dashAudio.muted = muted; } catch (e) {} }

  function getBvidFromUrl() {
    const hash = location.hash || '';
    const match = hash.match(/[?&]bvid=([^&]+)/);
    return match ? match[1] : '';
  }

  function getStartTimeFromUrl() {
    const hash = location.hash || '';
    const match = hash.match(/[?&]t=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * 拉播放地址: DASH 优先, 拿不到退回 MP4 单流
   *
   * @param {string} bvid
   * @param {number} cid
   * @param {number} qn 清晰度
   * @returns {Promise<{src: string, audio: string}>}
   */
  async function fetchStream(bvid, cid, qn) {
    let src = '';
    let audio = '';
    try {
      const dash = await getDashUrls(bvid, cid, qn);
      if (dash && dash.videoUrl) {
        src = dash.videoUrl;
        audio = dash.audioUrl;
      }
    } catch (e) {
      // DASH 拉取失败
    }
    // DASH 拿不到可用地址时退回 MP4 单流, 避免只有黑屏
    if (!src) {
      try {
        src = await getPlayUrl(bvid, cid, qn);
        audio = '';
      } catch (e) {
        src = '';
      }
    }
    return { src, audio };
  }

  async function loadVideo() {
    // 读取初始播放位置
    startAt = getStartTimeFromUrl();

    const bvid = getBvidFromUrl();

    if (!bvid) {
      error = '缺少视频 ID';
      loading = false;
      return;
    }

    currentBvid = bvid;
    loading = true;
    error = '';

    try {
      const info = await getVideoInfo(bvid);
      title = info.title;
      poster = info.pic;
      currentCid = info.cid;
      ownerMid = info.owner ? info.owner.mid : 0;

      // 登录了才查互动状态 (点赞/收藏是**切换**, 得知道当前状态)
      if ($isLogin) {
        getStatus(bvid).then(st => { status = st; }).catch(() => {});
      }

      // 全屏播放器读取设置中的 quality，默认 360P
      const qn = $settings.quality || 16;
      if (autoPlay) {
        // 保持原样: 打开就拉流并播放
        const s = await fetchStream(bvid, info.cid, qn);
        if (!s.src) {
          error = '无法获取播放地址';
          return;
        }
        videoSrc = s.src;
        audioSrc = s.audio;
      }
      // 不立刻播放的话: 只显示封面, 等用户按播放再拉流
    } catch (e) {
      error = e.message || '加载失败';
    } finally {
      loading = false;
    }
  }

  /**
   * 用户按了播放但播放地址还没拉 → 现在去拉, 拉完直接播
   */
  async function loadAndPlay() {
    if (videoSrc || streamLoading) return;
    streamLoading = true;
    streamError = '';
    try {
      const qn = $settings.quality || 16;
      const s = await fetchStream(currentBvid, currentCid, qn);
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

  function onLoaded() {
    if (video) {
      duration = video.duration || 0;
      // 如果有初始播放位置，跳转到对应时间
      if (startAt > 0 && startAt < duration) {
        video.currentTime = startAt;
      }
      video.play().catch(() => {});
    }
    if (dashAudio) {
      if (startAt > 0 && video && video.duration && startAt < video.duration) {
        dashAudio.currentTime = startAt;
      }
      dashAudio.play().catch(() => {});
    }
  }

  function onPlay() {
    if (dashAudio) {
      dashAudio.play().catch(() => {});
    }
  }

  function onPause() {
    if (dashAudio) {
      dashAudio.pause();
    }
  }

  function onVideoError() {
    const code = video && video.error ? video.error.code : 0;
    playError = '播放失败' + (code ? ' (code ' + code + ')' : '') + ' · 按退格键返回';
  }

  function onEnded() {
    if (dashAudio) {
      dashAudio.pause();
    }
  }

  function onTimeUpdate() {
    if (video) {
      currentTime = video.currentTime;
      // 更新缓冲进度
      if (video.buffered && video.buffered.length > 0) {
        buffered = video.buffered.end(video.buffered.length - 1);
      }
    }
    if (video && dashAudio && audioSrc) {
      const diff = Math.abs(dashAudio.currentTime - video.currentTime);
      if (diff > 0.3) {
        dashAudio.currentTime = video.currentTime;
      }
    }
  }

  function togglePlay() {
    // 播放地址还没拉 (设置里关了"打开视频立刻播放") → 这一下是去加载并播放
    if (!videoSrc) {
      loadAndPlay();
      return;
    }
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  // 快进/快退
  function seek(delta) {
    if (!video) return;
    const newTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
    video.currentTime = newTime;
    if (dashAudio) {
      dashAudio.currentTime = newTime;
    }
  }

  // 倍速播放
  function setPlaybackRate(rate) {
    if (video) {
      video.playbackRate = rate;
    }
  }

  // 开始倍速 (长按 ↓ 键)
  function startSpeedUp() {
    if (!video || isSpeedUp) return;
    isSpeedUp = true;
    normalPlaybackRate = video.playbackRate || 1.0;
    setPlaybackRate(2.0);
  }

  // 结束倍速 (松手时恢复)
  function stopSpeedUp() {
    if (!isSpeedUp) return;
    isSpeedUp = false;
    setPlaybackRate(normalPlaybackRate);
  }

  // 调音量 = 只调系统音量 (应用不维护自己的音量, 详见 player/volume.js)
  function bumpVolume(delta) {
    requestSystemVolume(delta);
  }

  // ── 互动动作 (点赞/投币/收藏/一键三连) ──────────────────────────────
  //
  // 菜单内容与视频详情页一模一样, 但全屏页没有详情页那套 status/counts UI,
  // 所以这里自己调接口 + 给个 toast (没登录/失败都要有反馈, 否则按了跟没按一样)。
  function needLogin() {
    if (!$isLogin) {
      showToast('请先登录');
      return false;
    }
    return true;
  }

  async function doLike() {
    if (!needLogin()) return;
    try {
      await likeVideo(currentBvid, !status.like);
      status = { ...status, like: status.like ? 0 : 1 };
      showToast(status.like ? '✓ 已点赞' : '已取消点赞');
    } catch (e) {
      showToast('操作失败');
    }
  }

  async function doCoin() {
    if (!needLogin()) return;
    try {
      await coinVideo(currentBvid, 1);
      status = { ...status, coin: 1 };
      showToast('✓ 已投币');
    } catch (e) {
      showToast('操作失败');
    }
  }

  async function doFav() {
    if (!needLogin()) return;
    try {
      if (status.fav) {
        await unfavVideo(currentBvid);
      } else {
        await favVideo(currentBvid);
      }
      status = { ...status, fav: status.fav ? 0 : 1 };
      showToast(status.fav ? '✓ 已收藏' : '已取消收藏');
    } catch (e) {
      showToast('操作失败');
    }
  }

  async function doTriple() {
    if (!needLogin()) return;
    try {
      await tripleAction(currentBvid);
      status = { ...status, like: 1, coin: 1, fav: 1 };
      showToast('✓ 一键三连');
    } catch (e) {
      showToast('操作失败');
    }
  }

  /**
   * 菜单树: 和视频详情页共用同一份 (player/videoMenu.js),
   * 这里只把自己的动作传进去。
   */
  function buildMenu() {
    return buildVideoMenu({
      slot: 'left',            // 全屏用左软键开菜单 (右软键留空, 保持沉浸)
      label: '菜单',
      bvid: currentBvid,
      ownerMid: ownerMid,
      seekStep: SEEK_STEP,
      seek: d => seek(d),
      volume: d => bumpVolume(d),
      onAuthor: mid => { if (mid) navigate('/user?uid=' + mid); },
      // 副提示里的按键跟着本页面的绑定走 (画面转了 90°, 方向键也转了 90°):
      //   ↑ = 快退, ↓ = 快进, ← = 音量减, → = 音量加
      hints: {
        forward: '短按 ↓ 键',
        back: '短按 ↑ 键',
        volUp: '短按 → 键',
        volDown: '短按 ← 键'
      },
      interact: {
        triple: doTriple,
        like: doLike,
        coin: doCoin,
        fav: doFav
      }
    });
  }

  // 将字符串拆分成单个字符数组
  function chars(s) {
    return s.split('');
  }
  function fmt(t) {
    if (!t || isNaN(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ── 按键处理 ─────────────────────────────────────────────────────────
  // 走按键总线的作用域, 不再自己挂 window 监听 (与 VideoPlayer 保持一致)。
  // 方向键用 { press, long, release } 形式:
  //   press   = 短按松手时触发
  //   long    = 按住 400ms 后触发
  //   release = 无论长短按, 松手时都会触发 (倍速靠它恢复)

  onMount(() => {
    // 左软键 = 显示/隐藏菜单 (由软键栏的兜底作用域接管);
    // 返回走退格键 (全局 app-back); 右软键不声明, 保持沉浸
    loadVideo();
    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    const off = onKey('fullscreen-player', {
      // 中键用 { press } 形式: 松手时触发一次, 按住不放不会连发
      Enter: { press: () => togglePlay() },

      // ── 方向键 ────────────────────────────────────────────────────
      //
      // 画面是转 90° 放的 (用户把手机横过来看), 方向键的绑定也跟着转过
      // 90° (和视频详情页正好差一格):
      //   ↑/↓  快退 / 快进      ←/→  音量加 / 音量减
      //
      // 菜单里的副提示写的也是这一套键 (见下面 buildMenu 的 hints),
      // 文案和实际行为必须对得上。
      Up: () => seek(-SEEK_STEP),
      Down: {
        // 短按 = 前进 10 秒; 长按 = 倍速播放 (长按时不再走短按的 seek)
        press: () => seek(SEEK_STEP),
        long: () => startSpeedUp(),
        release: () => stopSpeedUp(),
        repeat: false,
        threshold: LONG_PRESS_MS
      },
      Left: () => bumpVolume(-1),
      Right: () => bumpVolume(+1),
      // 真机硬件音量键 (Nokia 6300 4G / 8000 4G 等)
      VolumeUp: () => bumpVolume(+1),
      VolumeDown: () => bumpVolume(-1)
    }, {
      priority: 10,
      softkeys: true,
      // 全屏的二级菜单挂在**左软键**上 (设置里可以关掉)
      menu: fullscreenMenu ? () => buildMenu() : null
    });
    return () => {
      window.removeEventListener('resize', updateOrientation);
      off();
    };
  });

  // 软键文案:
  //   左 = 空 —— 菜单接管那一格 (软键栏会显示菜单的 label「菜单」+ 小箭头)
  //   中 = OK 键播放/暂停的提示 (播放/暂停已经从中键走, 明确告诉用户)
  //   右 = 空 (保持沉浸)
  $: setSoftkeys('', '', 'OK键播放暂停');

  // 封面地址跟着屏幕尺寸走 (横屏宽度 = 视口长边)
  $: posterUrl = poster ? biliImg(poster, posterW, posterH, 'jpg') : '';

  onDestroy(() => {
    if (dashAudio) {
      dashAudio.pause();
      dashAudio.src = '';
    }
  });
</script>

<div class="fullscreen-player" class:landscape={isLandscape}>
  {#if loading}
    <div class="loading">加载中...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if videoSrc}
    <video
      bind:this={video}
      src={videoSrc}
      preload="metadata"
      audio-channel="content"
      on:loadedmetadata={onLoaded}
      on:timeupdate={onTimeUpdate}
      on:play={onPlay}
      on:pause={onPause}
      on:ended={onEnded}
      on:error={onVideoError}
    ></video>
    {#if audioSrc}
      <audio bind:this={dashAudio} src={audioSrc} preload="metadata" style="display: none;"></audio>
    {/if}
    {#if playError}
      <div class="error play-error">{playError}</div>
    {/if}
  {:else}
    <!--
      播放地址还没拉到 (设置里关了"打开视频立刻播放"):
      不建 <video> 元素 = 一个字节的视频数据都不下, 只显示封面
    -->
    <img class="cover" src={posterUrl} alt="" />
    <div class="cover-hint">
      {#if streamLoading}
        加载中...
      {:else if streamError}
        {streamError}
      {:else}
        按 OK 播放
      {/if}
    </div>
  {/if}
  <!-- 进度条 -->
  <div class="progress-bar">
    <div class="progress-track">
      <div class="progress-buffered" style="height: {duration > 0 ? (buffered / duration) * 100 : 0}%"></div>
      <div class="progress-played" style="height: {duration > 0 ? (currentTime / duration) * 100 : 0}%"></div>
    </div>
    <div class="progress-info">
      {#each chars(fmt(currentTime)) as c}<span class="time-char">{c}</span>{/each}
      <span class="time-char">/</span>
      {#each chars(fmt(duration)) as c}<span class="time-char">{c}</span>{/each}
    </div>
  </div>
</div>

<style>
  .fullscreen-player {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #000;
    z-index: 100;
    overflow: hidden;
    /* 加载中 / 出错文案直接居中, 不用 padding-top 去顶 */
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /*
    视频横着放:
      竖屏设备 (240x320) 上把内容转 90°, 用户把手机横过来看才是正的。
      元素盒子按"横屏"尺寸摆 —— 宽 = 屏高 (100vh), 高 = 屏宽 (100vw) —— 再整体转 90°,
      转完正好是 屏宽 x 屏高, 铺满整屏。
      盒子中心先 translate(-50%,-50%) 对到屏幕中心, rotate 绕自己的中心转, 转完仍然居中。
      尺寸全部按视口算, 不写死 320/240 —— 换屏幕尺寸 (或横竖屏) 都对。

    max-width:none 要显式写: 全局 img { max-width:100% } 会把宽度夹到父容器宽 (240),
    盒子变成 240x240 的正方形, 转完就不居中了 (右边会空掉一条)。
    object-fit:contain: 保持视频原始比例, 不拉伸成 4:3。
  */
  video,
  .cover {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100vh;
    height: 100vw;
    max-width: none;
    transform: translate(-50%, -50%) rotate(90deg);
    object-fit: contain;
    background: #000;
  }

  /* 屏幕本来就是横的: 不转, 直接铺满 */
  .fullscreen-player.landscape video,
  .fullscreen-player.landscape .cover {
    width: 100%;
    height: 100%;
    transform: translate(-50%, -50%);
  }

  /* 封面上的提示: 按中键才去加载播放 (压在封面上, 所以给个深底才看得清) */
  .cover-hint {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 4px 10px;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    font-size: 14px;
    border-radius: 12px;
    white-space: nowrap;
    z-index: 102;
  }

  .loading,
  .error {
    color: #fff;
    text-align: center;
    font-size: 14px;
  }

  /* 播放失败提示: 盖在黑屏视频之上, 不至于只有一个黑屏 */
  .play-error {
    position: fixed;
    top: 50%;
    left: 0;
    width: 100%;
    transform: translateY(-50%);
    padding: 8px 12px;
    z-index: 102;
    box-sizing: border-box;
  }

  /* ========== 播放进度条 ==========
     进度条竖着贴在屏幕左边 —— 手机横过来看时它就是横屏的底部进度条。
     时间字符每个转 90°, 横过来看才是正的。 */
  .progress-bar {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 101;
    display: flex;
    align-items: flex-start;
  }
  .progress-track {
    position: relative;
    width: 3px;
    height: 100%;
    background: rgba(255,255,255,0.2);
    border-radius: 2px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .progress-buffered {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    background: rgba(255,255,255,0.35);
    border-radius: 2px;
  }
  .progress-played {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    background: #d26585;
    border-radius: 2px;
  }
  .progress-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4px 2px;
    flex-shrink: 0;
  }
  .time-char {
    display: inline-block;
    font-size: 10px;
    color: rgba(255,255,255,0.8);
    line-height: 1.1;
    -moz-transform: rotate(90deg);
    transform: rotate(90deg);
  }
</style>
