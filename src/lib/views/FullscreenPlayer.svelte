<script>
  import { onMount, onDestroy } from 'svelte';
  import { getVideoInfo, getPlayUrl, getDashUrls } from '../api/video.js';
  import { settings } from '../stores/settings.js';
  import { onKey } from '../keyboard/index.js';

  let videoSrc = '';
  let audioSrc = '';
  let title = '';
  let loading = true;
  let error = '';

  /** @type {any} */
  let video;
  /** @type {HTMLAudioElement|null} */
  let dashAudio = null;

  let currentBvid = '';        // 当前播放视频的 bvid
  let playError = '';          // 播放失败提示 (视频解码/URL 失效时不再只显示黑屏)

  let normalPlaybackRate = 1.0; // 保存正常播放速度
  let isSpeedUp = false;        // 是否正在倍速播放

  // 进度条相关
  let currentTime = 0;
  let duration = 0;
  let buffered = 0;

  // 从普通播放器传入的初始播放位置（秒）
  let startAt = 0;

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

      // 全屏播放器读取设置中的 quality，默认 360P
      const qn = $settings.quality || 16;
      try {
        const dash = await getDashUrls(bvid, info.cid, qn);
        if (dash && dash.videoUrl) {
          videoSrc = dash.videoUrl;
          audioSrc = dash.audioUrl;
        }
      } catch (e) {
        // DASH 拉取失败
      }
      // DASH 拿不到可用地址时退回 MP4 单流, 避免只有黑屏
      if (!videoSrc) {
        try {
          videoSrc = await getPlayUrl(bvid, info.cid, qn);
          audioSrc = '';
        } catch (e) {
          videoSrc = '';
        }
      }

      if (!videoSrc) {
        error = '无法获取播放地址';
        return;
      }
    } catch (e) {
      error = e.message || '加载失败';
    } finally {
      loading = false;
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
    playError = '播放失败' + (code ? ' (code ' + code + ')' : '') + ' · 按右软键返回';
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

  // 开始倍速
  function startSpeedUp() {
    if (!video || isSpeedUp) return;
    isSpeedUp = true;
    normalPlaybackRate = video.playbackRate || 1.0;
    setPlaybackRate(2.0);
  }

  // 结束倍速
  function stopSpeedUp() {
    if (!isSpeedUp) return;
    isSpeedUp = false;
    setPlaybackRate(normalPlaybackRate);
  }

  // KaiOS 系统音量调节
  function bumpVolume(delta) {
    if (typeof navigator !== 'undefined' && /** @type {any} */ (navigator).volumeManager) {
      try {
        if (delta > 0) {
          /** @type {any} */ (navigator).volumeManager.requestUp();
        } else if (delta < 0) {
          /** @type {any} */ (navigator).volumeManager.requestDown();
        }
      } catch (e) {}
    }
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
    // 左软键 = 播放/暂停, 右软键 = 返回 (返回交给全局 app-back 兜底)
    loadVideo();
    return onKey('fullscreen-player', {
      // 中键用 { press } 形式: 松手时触发一次, 按住不放不会连发
      Enter: { press: () => togglePlay() },
      SoftLeft: () => togglePlay(),
      Up: () => seek(-10),
      Down: {
        // 短按 = 前进 10 秒; 长按 = 倍速播放 (长按时不再走短按的 seek)
        press: () => seek(10),
        long: () => startSpeedUp(),
        release: () => stopSpeedUp(),
        repeat: false,
        threshold: 400
      },
      Left: () => bumpVolume(-1),
      Right: () => bumpVolume(+1),
      // 真机硬件音量键 (Nokia 6300 4G / 8000 4G 等)
      VolumeUp: () => bumpVolume(+1),
      VolumeDown: () => bumpVolume(-1)
    }, { priority: 10, softkeys: ['播放/暂停', '返回', ''] });
  });

  onDestroy(() => {
    if (dashAudio) {
      dashAudio.pause();
      dashAudio.src = '';
    }
  });
</script>

<div class="fullscreen-player">
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
    width: 100%;
    height: 100%;
    background: #000;
    z-index: 100;
  }

  video {
    width: 320px;
    height: 240px;
    position: fixed;
    transform: rotate(90deg);
    top: 40px;
    left: -40px;
    background: #000;
  }

  .loading,
  .error {
    color: #fff;
    text-align: center;
    padding-top: 100px;
    font-size: 14px;
  }

  /* 播放失败提示: 盖在黑屏视频之上, 不至于只有一个黑屏 */
  .play-error {
    position: fixed;
    top: 120px;
    left: 0;
    width: 100%;
    padding: 8px 12px;
    z-index: 102;
    box-sizing: border-box;
  }

  /* ========== 播放进度条 ========== */
  .progress-bar {
    position: fixed;
    top: 0;
    left: 0;
    width: 320px;
    height: 320px;
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
