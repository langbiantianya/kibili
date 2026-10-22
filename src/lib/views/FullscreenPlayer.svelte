<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { getVideoInfo, getPlayUrl, getDashUrls } from '../api/video.js';
  import { getStatus, likeVideo, coinVideo, favVideo, unfavVideo, tripleAction } from '../api/interact.js';
  import { settings } from '../stores/settings.js';
  import { requestSystemVolume } from '../player/volume.js';
  import { onKey } from '../keyboard/index.js';
  import { setSoftkeys, setSoftkeysHidden, showToast } from '../stores/ui.js';
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

  // ── 清晰度 ────────────────────────────────────────────────────────
  // 可选档位 (和设置页「全屏默认分辨率」的选项一致)
  const QUALITY_OPTIONS = [
    { label: '240P', value: 6 },
    { label: '360P', value: 16 },
    { label: '480P', value: 32 },
    { label: '720P', value: 64 }
  ];
  // 当前档位: 初值取设置里的「全屏默认分辨率」, 之后用户在菜单里改就跟着改
  let currentQuality = 16;
  // 换清晰度后要回到的播放位置 (换流会把播放头重置成 0)
  let pendingSeek = 0;

  /**
   * 档位值 → 文案
   * @param {number} qn
   * @returns {string}
   */
  function qualityLabel(qn) {
    for (let i = 0; i < QUALITY_OPTIONS.length; i++) {
      if (QUALITY_OPTIONS[i].value === qn) return QUALITY_OPTIONS[i].label;
    }
    return '';
  }

  let normalPlaybackRate = 1.0; // 保存正常播放速度
  let isSpeedUp = false;        // 是否正在倍速播放

  // 播放状态: 中键 (OK) 的提示跟着它走 ——
  //   正在播放 → 提示「暂停」(按下去会暂停)
  //   已经暂停 → 提示「播放」(按下去会播放)
  // 文案必须和行为对得上 (本项目的硬规矩), 所以不能写死成「OK键播放暂停」。
  let playing = false;

  // 一次快进/快退多少秒
  const SEEK_STEP = 10;

  // UP 主 mid (「UP 主页」菜单项要它; 没有作者信息时那一项是灰的)
  let ownerMid = 0;

  // 互动状态 (点赞/投币/收藏): 菜单里「点赞」「收藏」是**切换**,
  // 得知道当前是已赞还是未赞 —— 登录后查一次状态。
  let status = { like: 0, coin: 0, fav: 0 };

  // 设置里「全屏播放显示软键栏」关了 → 全屏把整条软键栏藏起来 (沉浸模式),
  // 但二级菜单照常能按右软键打开 (藏的是提示行, 不是菜单)
  //
  // 左软键直接改这个设置 (设置项也就跟着变了, 别的页面也生效)
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
   * 拉播放地址: MP4 单流优先, 拿不到退回 DASH
   *
   * 走 MP4 单流 (platform=html5): 清晰度**跟着 qn 走**, 而且老 Gecko
   * 播普通 mp4 最稳。DASH 那边的清晰度 id 和 qn 不是一回事 (没有 240P 档),
   * 只当兜底。
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
      src = await getPlayUrl(bvid, cid, qn);
    } catch (e) {
      // MP4 拉取失败
    }
    try {
      const dash = await getDashUrls(bvid, cid, qn);
      if (dash) {
        audio = dash.audioUrl;
        if (!src && dash.videoUrl) src = dash.videoUrl;
      }
    } catch (e) {
      // DASH 拉取失败
    }
    return { src, audio };
  }

  /**
   * 换清晰度: 重新拉流, 播放位置接着走
   *
   * 顺手写回设置里的「全屏默认分辨率」—— 用户在菜单里选的那档,
   * 就是以后进全屏的默认档 (持久化, 下次进全屏直接用)。
   *
   * @param {number} qn
   */
  async function changeQuality(qn) {
    if (qn === currentQuality) {
      showToast('已经是 ' + qualityLabel(qn));
      return;
    }
    const at = video ? (video.currentTime || 0) : 0;   // 记住播放位置
    currentQuality = qn;
    // 联动设置: 「全屏默认分辨率」跟着变 (持久化)
    settings.update(s => ({ ...s, quality: qn }));
    showToast('已切换到 ' + qualityLabel(qn));

    // 播放地址还没拉 (设置里关了自动播放) → 换个档记着就行, 回头再拉
    if (!currentBvid || !currentCid) return;
    if (!videoSrc && !streamLoading) return;

    streamLoading = true;
    streamError = '';
    try {
      const s = await fetchStream(currentBvid, currentCid, qn);
      if (!s.src) {
        streamError = '无法获取播放地址';
        return;
      }
      // 换流: 播放头会重置成 0, 记下位置等新的流 loadedmetadata 再跳回去
      // 直接换 src (不清空): <video> 元素不重建, 不会闪一下封面
      pendingSeek = at;
      videoSrc = s.src;
      audioSrc = s.audio;
      await tick();
    } catch (e) {
      streamError = e.message || '加载失败';
    } finally {
      streamLoading = false;
    }
  }

  async function loadVideo() {
    // 读取初始播放位置
    startAt = getStartTimeFromUrl();

    // 清晰度: 取设置里的「全屏默认分辨率」
    // (菜单里改过档会写回设置, 这里每次进全屏都重新读一遍)
    currentQuality = $settings.quality || 16;

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

      // 全屏播放器的清晰度: 取设置里的「全屏默认分辨率」(默认 360P)
      const qn = currentQuality;
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
      const qn = currentQuality;
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
    // 播放位置: 换过清晰度就回到换之前的位置 (换流会把播放头重置成 0),
    // 第一次进来则回到 URL 里带的 t= 位置
    const at = pendingSeek > 0 ? pendingSeek : startAt;
    pendingSeek = 0;
    if (video) {
      duration = video.duration || 0;
      if (at > 0 && at < duration) {
        video.currentTime = at;
      }
      video.play().catch(() => {});
    }
    if (dashAudio) {
      if (at > 0 && video && video.duration && at < video.duration) {
        dashAudio.currentTime = at;
      }
      dashAudio.play().catch(() => {});
    }
  }

  function onPlay() {
    playing = true;
    if (dashAudio) {
      dashAudio.play().catch(() => {});
    }
  }

  function onPause() {
    playing = false;
    if (dashAudio) {
      dashAudio.pause();
    }
  }

  function onVideoError() {
    const code = video && video.error ? video.error.code : 0;
    playError = '播放失败' + (code ? ' (code ' + code + ')' : '') + ' · 按退格键返回';
  }

  function onEnded() {
    playing = false;
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

  // 左软键: 显示 / 隐藏整条软键栏 (沉浸模式)
  //
  // 直接改设置项「全屏播放显示软键栏」—— 改的是全局状态, 别的页面也跟着;
  // 藏的只是那一行提示, 二级菜单照常能按右软键打开。
  //
  // 文案写的是**按下之后会做什么**: 栏现在显示着 → 写「隐藏」;
  // 栏现在藏着 → 写「显示」(虽然这时候这行字自己也看不见, 但按一下就回来了)。
  function toggleSoftkeyBar() {
    const cur = $settings.fullscreenMenu !== false;
    settings.update(s => ({ ...s, fullscreenMenu: !cur }));
    showToast(!cur ? '已隐藏软键栏' : '已显示软键栏');
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
      slot: 'right',           // 全屏用**右软键**开菜单 (和视频详情页一致;
                              // 左软键留空, 全屏画面上不占地方)
      label: '更多',           // 右软键上的文案: 和视频详情页一模一样
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
      },
      // 「视频分辨率」三级菜单: 这三个只有全屏页给, 详情页固定 240P
      quality: currentQuality,
      qualities: QUALITY_OPTIONS,
      onQuality: qn => changeQuality(qn)
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
    // 右软键 = 显示/隐藏菜单 (由软键栏的兜底作用域接管);
    // 左软键 = 显示/隐藏整条软键栏 (沉浸模式);
    // 返回走退格键 (全局 app-back)
    loadVideo();
    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    const off = onKey('fullscreen-player', {
      // 中键用 { press } 形式: 松手时触发一次, 按住不放不会连发
      Enter: { press: () => togglePlay() },

      // 左软键 = 显示 / 隐藏软键栏。
      // 菜单开着的时候不用管 —— 菜单的独占作用域接管左软键 (那是「关闭」)。
      SoftLeft: () => toggleSoftkeyBar(),

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
      // 设置里「全屏播放显示软键栏」关掉 → 整条软键栏藏起来 (沉浸模式)。
      // 注意: 藏的只是那一行提示, **菜单照常能用** —— 右软键照样能展开二级菜单,
      // 菜单打开时软键栏会临时露出来当"关闭 / 选择"的提示, 关掉菜单后又藏回去。
      hideSoftkeys: !fullscreenMenu,
      // 二级菜单挂在**右软键**上 (和视频详情页一样), 一直都在
      menu: () => buildMenu()
    });
    return () => {
      window.removeEventListener('resize', updateOrientation);
      off();
    };
  });

  // 软键文案:
  //   左 = 显示 / 隐藏软键栏 —— 写的是**按下之后会做什么**:
  //        栏现在显示着 → 「隐藏」; 栏现在藏着 → 「显示」
  //   中 = 中键 (OK) 的提示: 正在播放显示「暂停」, 已暂停显示「播放」
  //        —— 跟着真实播放状态走, 文案和行为必须对得上 (硬规矩)
  //   右 = 空 —— 菜单接管那一格 (软键栏会显示菜单的 label「更多」+ 小箭头)
  $: setSoftkeys(fullscreenMenu ? '隐藏' : '显示', '', playing ? '暂停' : '播放');

  // 软键栏的显隐跟着设置走 (左软键改设置 → 这里跟着变)。
  // 藏的只是那一行提示, 二级菜单照常能按右软键打开。
  $: setSoftkeysHidden(!fullscreenMenu);

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
