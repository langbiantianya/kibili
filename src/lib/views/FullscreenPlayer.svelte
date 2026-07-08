<script>
  import { onMount, onDestroy } from 'svelte';
  import { getVideoInfo, getPlayUrl, getDashUrls } from '../api/video.js';
  import { setSoftkeys } from '../stores/ui.js';

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

  let normalPlaybackRate = 1.0; // 保存正常播放速度
  let speedUpTimer = null;      // 长按右键倍速定时器
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

      // 全屏播放器使用 qn=16 (360P 流畅), 保证画质
      try {
        const dash = await getDashUrls(bvid, info.cid, 16);
        if (dash) {
          videoSrc = dash.videoUrl;
          audioSrc = dash.audioUrl;
        }
      } catch (e) {
        videoSrc = await getPlayUrl(bvid, info.cid, 16);
        audioSrc = '';
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

  function handleKeyDown(e) {
    switch (e.key) {
      case 'Enter':
      case 'SoftLeft':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowUp':
        e.preventDefault();
        seek(-10);
        break;
      case 'ArrowDown':
        e.preventDefault();
        seek(10);
        // 长按 ArrowDown 开始倍速
        if (!speedUpTimer) {
          speedUpTimer = setTimeout(() => {
            startSpeedUp();
          }, 400);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        bumpVolume(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        bumpVolume(1);
        break;
    }
  }

  function handleKeyUp(e) {
    switch (e.key) {
      case 'ArrowDown':
        // 松开 ArrowDown，停止倍速
        if (speedUpTimer) {
          clearTimeout(speedUpTimer);
          speedUpTimer = null;
        }
        stopSpeedUp();
        break;
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

  onMount(() => {
    setSoftkeys('', '暂停', '');
    loadVideo();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
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
    ></video>
    {#if audioSrc}
      <audio bind:this={dashAudio} src={audioSrc} preload="metadata" style="display: none;"></audio>
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
