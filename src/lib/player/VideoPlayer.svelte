<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { onKey, offKey } from '../keyboard/index.js';
  import { acquireWakeLock, releaseWakeLock } from './wake.js';
  import { bumpVol } from './volume.js';
  import { settings } from '../stores/settings.js';

  // 双模式播放器:
  //  - mode='video': 用 <video> 播放视频流 (含画面)
  //  - mode='audio': 用 <audio> 播放独立音频流 (听视频模式, 不解码视频帧)
  // mode 切换由父组件 Player.svelte 控制, 通过 src / audioSrc 传入
  export let src = '';            // 视频流 URL (mp4)
  export let audioSrc = '';       // 音频流 URL (m4s / m4a, 听视频模式)
  export let poster = '';
  export let title = '';
  export let mode = 'video';      // 'video' | 'audio'
  // 听视频模式下保存当前位置, 切回 video 模式时同步
  export let resumeAt = 0;

  let video;
  let audio;
  let root;
  let showControls = false;
  let showVolSlider = false;
  let volTimer = null;
  let isFullscreen = false;
  let currentTime = 0;
  let duration = 0;
  let paused = true;
  let error = '';

  const dispatch = createEventDispatcher();

  $: vol = $settings.volume;
  $: muted = $settings.muted;

  // 当前激活的媒体元素
  $: media = mode === 'audio' ? audio : video;

  function onMediaLoaded() {
    const m = media;
    if (!m) return;
    duration = m.duration || 0;
    m.volume = vol;
    m.muted = muted;
    // 听视频模式下, 从父组件传入的 resumeAt 开始
    if (mode === 'audio' && resumeAt > 0 && m.duration) {
      try { m.currentTime = Math.min(resumeAt, m.duration - 1); } catch (e) {}
    }
    m.play().catch(() => {});
  }

  function onTimeUpdate() {
    const m = media;
    if (m) currentTime = m.currentTime;
  }

  function onPlay() { paused = false; }
  function onPause() { paused = true; }

  function onMediaError(e) {
    error = mode === 'audio' ? '音频错误' : '视频错误';
    dispatch('error', error);
  }

  function onAudioEnded() {
    dispatch('ended');
  }
  function onVideoEnded() {
    dispatch('ended');
  }

  function togglePlay() {
    const m = media;
    if (!m) return;
    if (m.paused) m.play().catch(() => {});
    else m.pause();
  }

  function seek(delta) {
    const m = media;
    if (!m) return;
    m.currentTime = Math.max(0, Math.min(m.duration || 0, m.currentTime + delta));
  }

  function jumpTo(fraction) {
    const m = media;
    if (!m || !m.duration) return;
    m.currentTime = m.duration * fraction;
  }

  function bumpVolume(delta) {
    const m = media;
    if (!m) return;
    const newVol = bumpVol(m.volume, delta);
    m.volume = newVol;
    settings.update(s => ({ ...s, volume: newVol }));
    showVolSlider = true;
    if (volTimer) clearTimeout(volTimer);
    volTimer = setTimeout(() => showVolSlider = false, 1500);
  }

  function toggleMute() {
    const m = media;
    if (!m) return;
    m.muted = !m.muted;
    settings.update(s => ({ ...s, muted: m.muted }));
  }

  function toggleFullscreen() {
    if (!root) return;
    if (document.mozFullScreenElement) {
      document.mozCancelFullScreen();
    } else {
      if (root.mozRequestFullScreen) {
        root.mozRequestFullScreen();
      }
    }
  }

  function onFullscreenChange() {
    isFullscreen = !!document.mozFullScreenElement;
  }

  // 听视频模式切入口: 通知父组件切换 mode
  function toggleListenOnly() {
    if (mode === 'audio') {
      // 退出听视频
      releaseWakeLock();
      dispatch('listenoff', currentTime);
    } else {
      // 进入听视频
      acquireWakeLock();
      dispatch('listenon', currentTime);
    }
  }

  function fmt(t) {
    if (!t || isNaN(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  onMount(() => {
    onKey('video-player', {
      'ArrowLeft':  () => seek(-5),
      'ArrowRight': () => seek(5),
      'ArrowUp':    () => bumpVolume(0.1),
      'ArrowDown':  () => bumpVolume(-0.1),
      'Enter':      () => togglePlay(),
      '5':          () => togglePlay(),
      '1': () => jumpTo(0.1),
      '2': () => jumpTo(0.2),
      '3': () => jumpTo(0.3),
      '4': () => jumpTo(0.4),
      '6': () => jumpTo(0.6),
      '7': () => jumpTo(0.7),
      '8': () => jumpTo(0.8),
      '9': () => jumpTo(0.9),
      '0': () => jumpTo(0),
      '*': () => toggleListenOnly(),
      'SoftRight': () => toggleFullscreen(),
      'AudioVolumeUp':   () => bumpVolume(0.1),
      'AudioVolumeDown': () => bumpVolume(-0.1),
      'AudioVolumeMute': () => toggleMute()
    });
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
  });

  onDestroy(() => {
    offKey('video-player');
    document.removeEventListener('mozfullscreenchange', onFullscreenChange);
    releaseWakeLock();
  });
</script>

<div class="player" class:fullscreen={isFullscreen} bind:this={root}>
  {#if mode === 'video'}
    <video
      bind:this={video}
      {src}
      {poster}
      preload="metadata"
      audio-channel="content"
      on:loadedmetadata={onMediaLoaded}
      on:timeupdate={onTimeUpdate}
      on:play={onPlay}
      on:pause={onPause}
      on:ended={onVideoEnded}
      on:error={onMediaError}
    ></video>
  {:else}
    <!-- 听视频模式: 仅渲染 <audio>, 不画任何画面, 真正省电省带宽 -->
    <audio
      bind:this={audio}
      src={audioSrc}
      preload="metadata"
      audio-channel="content"
      on:loadedmetadata={onMediaLoaded}
      on:timeupdate={onTimeUpdate}
      on:play={onPlay}
      on:pause={onPause}
      on:ended={onAudioEnded}
      on:error={onMediaError}
    ></audio>
  {/if}

  <div class="overlay" class:hidden={!showControls && !showVolSlider}>
    <div class="title">{title}</div>
    <div class="time">{fmt(currentTime)} / {fmt(duration)}</div>
    {#if showVolSlider}
      <div class="vol-slider">
        <span>音量</span>
        <div class="bar">
          <div class="fill" style="width: {vol * 100}%"></div>
        </div>
        <span>{Math.round(vol * 100)}</span>
      </div>
    {/if}
    {#if mode === 'audio'}
      <div class="listen-badge">● 听视频模式 (仅音频)</div>
    {/if}
    {#if error}
      <div class="err">{error}</div>
    {/if}
  </div>
</div>

<style>
  .player {
    width: 100%;
    height: 100%;
    position: relative;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .player.fullscreen {
    width: 100vw;
    height: 100vh;
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }
  audio {
    /* audio 元素本身不可见, 让父容器填满 */
    width: 100%;
    height: 32px;
  }
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
    color: #fff;
    padding: 4px 6px;
    font-size: 11px;
    pointer-events: none;
  }
  .overlay.hidden {
    display: none;
  }
  .title {
    font-size: 12px;
    color: #fff;
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .time {
    font-size: 10px;
    color: #aaa;
  }
  .vol-slider {
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
  }
  .bar {
    flex: 1;
    height: 6px;
    background: #333;
    border: 1px solid #555;
  }
  .fill {
    height: 100%;
    background: #fb7299;
  }
  .listen-badge {
    margin-top: 4px;
    color: #fb7299;
    font-size: 10px;
  }
  .err {
    margin-top: 4px;
    color: #ff6666;
    font-size: 10px;
  }
</style>
