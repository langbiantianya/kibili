<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { releaseWakeLock } from './wake.js';
  import { requestSystemVolume } from './volume.js';
  import { settings } from '../stores/settings.js';
  import { moveFocus, onKey, activateFocused } from '../keyboard/index.js';
  import { reportProgress } from '../api/interact.js';
  import { showToast } from '../stores/ui.js';
  import { formatCount } from '../utils/format.js';
  import { biliImg } from '../utils/platform.js';
  import CommentSection from '../components/CommentSection.svelte';

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

  // 设置里关了"打开视频立刻播放" → 播放地址还没拉, 只显示封面
  export let streamLoading = false;
  export let streamError = '';

  // 视频详情数据 (新增)
  export let meta = /** @type {any} */ (null);
  export let status = { like: 0, coin: 0, fav: 0 };
  export let counts = { like: 0, coin: 0, fav: 0 };
  // 评论数据 (新增)
  /** @type {any[]} */
  export let replies = [];
  export let replyLoading = false;
  export let replyHasMore = true;
  export let replyError = '';

  // 子评论的展开状态由 CommentSection 自己管 (播放器不再存第二份,
  // 两份状态不同步会导致"按了中键没反应")

  let video;
  let audio;
  let dashAudio = /** @type {HTMLAudioElement|null} */ (null);
  /** @type {any} */
  let root;
  let showControls = false;
  let currentTime = 0;
  let duration = 0;
  let error = '';
  let buffered = 0; // 缓冲进度

  /*
    播放区域宽度 = 视口宽 (.screen 是 100vw), 16:9 的高度和封面尺寸都按它算,
    不写死 240/135 —— 换屏幕尺寸播放区不会被拉变形。
  */
  let posterW = 240;
  let posterH = 135;

  function updateSize() {
    const w = window.innerWidth || 240;
    posterW = w;
    posterH = Math.round(w * 9 / 16);
  }
  // 先算一次, 免得首帧用着默认尺寸的封面闪一下
  updateSize();

  // 封面地址跟着播放区域宽度走 (16:9)
  $: posterUrl = poster ? biliImg(poster, posterW, posterH, 'jpg') : '';

  // 观看进度上报定时器
  /** @type {number|null} */
  let reportTimer = null;
  let lastReportedTime = 0;

  // 长按检测 (由按键总线统一实现, 这里只保留阈值参数)
  const LONG_PRESS_MS = 400;   // 长按阈值
  const REPEAT_INTERVAL = 1000; // 长按重复触发间隔 (1秒)
  const SEEK_STEP = 5;         // 一次快进/快退的秒数 (长按方向键和菜单里的快进/快退共用)

  // Tab 切换状态
  const tabs = [
    { key: 'detail', label: '详情' },
    { key: 'comments', label: '评论' }
  ];
  let activeTab = 0;

  const dispatch = createEventDispatcher();

  // 静音状态: 系统音量接口在 KaiOS 2.4 上没有静音方法, 静音只能由应用把媒体元素 muted 置位
  $: muted = $settings.muted;

  // 静音状态变化时, 立刻作用到媒体元素 (不只在 loadedmetadata 时)
  $: if (media) {
    try { media.muted = muted; } catch (e) {}
  }

  // DASH 模式下, 同步播放独立音频流
  $: if (dashAudio && mode === 'video') {
    dashAudio.muted = muted;
  }

  // 当前激活的媒体元素
  $: media = mode === 'audio' ? audio : video;

  // 播放地址还没拿到 (设置里关了"打开视频立刻播放") → 只显示封面, 不加载视频
  $: notLoaded = mode === 'video' && !src;

  function onMediaLoaded() {
    const m = media;
    if (!m) return;
    duration = m.duration || 0;
    // 音量不设: 交给系统音量管, 应用不叠第二层增益
    m.muted = muted;
    // DASH 模式下, 同步播放独立音频流
    if (mode === 'video' && dashAudio && audioSrc) {
      dashAudio.muted = muted;
      dashAudio.currentTime = m.currentTime;
      dashAudio.play().catch(() => {});
    }
    // 从历史/收藏恢复播放进度 (video / audio 两种模式都要应用)
    applyResume();
    m.play().catch(() => {});
  }

  // loadedmetadata 时缓冲通常还没到目标位置, 直接 seek 会被夹到已缓冲边缘;
  // 因此在 canplay (数据足够) 时再兜一次
  let resumeApplied = false;
  function applyResume() {
    const m = media;
    if (!m || !(resumeAt > 0) || resumeApplied) return;
    let seekableEnd = m.duration || 0;
    try {
      if (m.seekable && m.seekable.length) seekableEnd = m.seekable.end(m.seekable.length - 1);
    } catch (e) { /* ignore */ }
    if (!seekableEnd) return;
    try {
      m.currentTime = Math.max(0, Math.min(resumeAt, seekableEnd - 1));
      resumeApplied = true;
      if (mode === 'video' && dashAudio) {
        try { dashAudio.currentTime = m.currentTime; } catch (e) {}
      }
    } catch (e) { /* ignore */ }
  }

  function onTimeUpdate() {
    const m = mode === 'audio' ? audio : video;
    if (m) {
      currentTime = m.currentTime;
      // 更新缓冲进度
      if (m.buffered && m.buffered.length > 0) {
        buffered = m.buffered.end(m.buffered.length - 1);
      }
      // DASH 模式下同步音频时间
      if (mode === 'video' && dashAudio && audioSrc) {
        const diff = Math.abs(dashAudio.currentTime - m.currentTime);
        if (diff > 0.3) {
          dashAudio.currentTime = m.currentTime;
        }
      }
    }
  }

  // 上报观看进度
  function doReportProgress() {
    if (!meta || !meta.aid || !meta.cid) return;
    const m = mode === 'audio' ? audio : video;
    if (!m) return;
    const progress = Math.floor(m.currentTime);
    // 避免重复上报同一进度
    if (progress === lastReportedTime) return;
    lastReportedTime = progress;
    reportProgress(meta.aid, meta.cid, progress).catch(() => {});
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

  function onPlay() {
    if (mode === 'video' && dashAudio && audioSrc) {
      dashAudio.play().catch(() => {});
    }
    dispatch('playstate', { playing: true });
    // 开始播放时启动上报
    startReportTimer();
  }

  function onPause() {
    if (mode === 'video' && dashAudio && audioSrc) {
      dashAudio.pause();
    }
    dispatch('playstate', { playing: false });
    // 暂停时停止上报，并立即上报一次当前进度
    stopReportTimer();
    doReportProgress();
  }

  function onMediaError(e) {
    error = mode === 'audio' ? '音频错误' : '视频错误';
    if (dashAudio) {
      dashAudio.pause();
    }
    dispatch('error', error);
  }

  function onAudioEnded() {
    // 播放结束时上报最终进度
    doReportProgress();
    dispatch('ended');
  }
  function onVideoEnded() {
    if (dashAudio) {
      dashAudio.pause();
    }
    // 播放结束时上报最终进度
    doReportProgress();
    dispatch('ended');
  }

  function togglePlay() {
    const m = mode === 'audio' ? audio : video;
    if (!m) return;
    if (m.paused) {
      m.play().catch(() => {});
      if (mode === 'video' && dashAudio && audioSrc) {
        dashAudio.play().catch(() => {});
      }
    } else {
      m.pause();
      if (mode === 'video' && dashAudio && audioSrc) {
        dashAudio.pause();
      }
    }
  }

  /**
   * 中键 (播放)
   *
   * 播放地址还没拿到时 (设置里关了"打开视频立刻播放"), 这一下不是"播放/暂停",
   * 而是"去把视频加载出来并播放" —— 通知父组件去拉播放地址
   */
  function requestPlay() {
    if (notLoaded) {
      dispatch('playrequest');
      return;
    }
    togglePlay();
  }

  function toggleFullscreen() {
    // 触发全屏事件,由父组件 Player.svelte 处理跳转
    // 带上当前播放进度,以便全屏模式接续播放
    const m = mode === 'audio' ? audio : video;
    dispatch('fullscreen', { currentTime: m ? m.currentTime : 0 });
  }

  function seek(delta) {
    const m = mode === 'audio' ? audio : video;
    if (!m) return;
    const newTime = Math.max(0, Math.min(m.duration || 0, m.currentTime + delta));
    m.currentTime = newTime;
    if (mode === 'video' && dashAudio && audioSrc) {
      dashAudio.currentTime = newTime;
    }
  }

  // 调音量 = 只调系统音量
  //
  // 应用不维护"应用内音量": KaiOS 2.4 读不到系统音量 (volumeManager 只有
  // requestUp/requestDown/requestShow, 没有读数也没有 input 事件),
  // 自己画一根滑块只会和系统对不上。requestUp/requestDown 会让系统弹出
  // 自己的音量气泡 (显示 1/15 这样的档位), 反馈交给系统。

  /** @param {number} delta */
  function bumpVolume(delta) {
    requestSystemVolume(delta);
  }

  // Tab 切换
  /** @param {number} i */
  function changeTab(i) {
    activeTab = i;
    dispatch('tabchange', tabs[i].key);
  }

  // 滚动详情/评论区域
  const SCROLL_STEP = 60;
  /** @param {number} delta */
  function scrollContent(delta) {
    const selector = activeTab === 0 ? '.detail-scroll' : '.comment-scroll';
    const el = root && root.querySelector(selector);
    if (el) el.scrollTop += delta * SCROLL_STEP;
  }

  // ========== 评论 tab 的中键 ==========
  // 评论列表里中键 = 激活当前焦点 (展开/收起子评论、加载更多),
  // 焦点不在评论列表里时才是播放/暂停。
  // 展开逻辑在 CommentSection 内部, 这里只负责把按键转成"激活焦点"。
  function activateInComments() {
    const el = /** @type {any} */ (document.activeElement);
    if (el && el.closest && el.closest('.comment-list')) {
      activateFocused();
      return true;
    }
    return false;
  }

  // ── 按键处理 ─────────────────────────────────────────────────────────
  // 全部交给按键总线 (lib/keyboard/index.js) 的作用域处理, 不再自己挂
  // window 监听。好处:
  //   - 和页面级按键走同一套分发, 不会再出现"页面在 keydown 处理、播放器在
  //     keyup 处理"导致同一次按键被响应两遍
  //   - 长按状态由总线统一维护, keydown/keyup 的键名归一化后一致,
  //     不会出现"keyup 没匹配上 keydown 的键名"导致定时器泄漏
  //
  // 方向键用 { press, long } 形式: press = 短按 (松手时触发),
  // long = 长按 (按住 400ms 后触发, 之后每秒重复)。

  // 短按方向键: 详情页滚动 / 评论页在评论之间移动
  /** @param {number} delta */
  function shortArrow(delta) {
    if (activeTab === 0) {
      scrollContent(delta);
    } else {
      const moved = moveFocus(delta);
      if (!moved) scrollContent(delta);
    }
  }

  // ── 软键菜单 (二级 / 三级) ─────────────────────────────────────────
  // 视频页能派的动作有十来个 (互动 / 播放控制 / 分享 / 举报…),
  // 软键栏只有三个格子, 塞不下 → 右软键变成「更多」, 按它展开二级菜单;
  // 二级菜单里的项如果还有子项, 再展开一层就是三级菜单。
  //
  // 二级菜单的**顺序**按用起来的顺手程度排:
  //   1. UP 主页   —— 常常就想知道这视频是谁做的
  //   2. 播放控制  —— 看的时候最常调的东西 (快进/快退/音量)
  //   3. 互动      —— 一键三连/点赞/投币/收藏 收进**三级菜单**
  //   4. 其它      —— 分享 / 举报
  //
  // 互动那四项收进三级菜单: 二级菜单一眼能扫完, 想表态时再展开一层。
  //
  // 菜单按**语义**分成组 (group 只有每组第一项写, 后面的项继承):
  //   播放控制 —— 看的时候调节: 快进 / 快退 / 音量加 / 音量减
  //   其它     —— 分享 / 举报
  //
  // 菜单树写成**函数**: 打开菜单的那一刻才求值, 菜单项能跟着 meta 走
  // (作者信息没到时「UP 主页」就是灰的, 按了没反应)。
  //
  // 菜单跟着这个按键作用域一起注册 / 释放 (opts.menu),
  // 播放器卸载时自动收走, 不会漏到别的页面。
  function buildVideoMenu() {
    const ownerMid = meta && meta.owner ? meta.owner.mid : 0;
    const bvid = (meta && meta.bvid) || '';
    return {
      slot: 'right',           // 占右软键
      label: '更多',           // 右软键显示的文案
      title: '更多操作',       // 菜单面板标题 (面包屑第一级)
      items: [
        // ── 1. UP 主页 ──────────────────────────────────────────────
        {
          label: 'UP 主页',
          disabled: !ownerMid,
          action: () => dispatch('author', { mid: ownerMid })
        },

        // ── 2. 播放控制 (看的时候调节) ────────────────────────────────
        // hint 提示"还有更快的键": 方向键长按就是同样的事 (见上面的按键表)
        { group: '播放控制', label: '快进', hint: '长按 → 键', action: () => seek(SEEK_STEP) },
        { group: '播放控制', label: '快退', hint: '长按 ← 键', action: () => seek(-SEEK_STEP) },
        { group: '播放控制', label: '音量加', hint: '长按 ↑ 键', action: () => bumpVolume(1) },
        { group: '播放控制', label: '音量减', hint: '长按 ↓ 键', action: () => bumpVolume(-1) },

        // ── 3. 互动 → 三级菜单 ───────────────────────────────────────
        // 点赞/投币/收藏/三连的接口逻辑在 Player.svelte (那里才有登录态和
        // status/counts), 播放器这边派事件过去。
        {
          label: '互动',
          items: [
            { label: '一键三连', action: () => dispatch('triple') },
            { label: '点赞', action: () => dispatch('like') },
            { label: '投币', action: () => dispatch('coin') },
            { label: '收藏', action: () => dispatch('fav') }
          ]
        },

        // ── 4. 其它 ────────────────────────────────────────────────────
        {
          group: '其它',
          label: '分享',
          items: [
            {
              label: '复制链接',
              action: () => showToast('https://www.bilibili.com/video/' + bvid)
            },
            { label: '分享给好友', action: () => showToast('分享功能待实现') }
          ]
        },
        {
          group: '其它',
          label: '举报',
          items: [
            { label: '不友善', action: () => showToast('举报功能待实现') },
            { label: '垃圾广告', action: () => showToast('举报功能待实现') },
            { label: '其他', action: () => showToast('举报功能待实现') }
          ]
        }
      ]
    };
  }

  onMount(() => {
    const off = onKey('video-player', {
      Up: {
        press: () => shortArrow(-1),
        long: () => bumpVolume(1),
        threshold: LONG_PRESS_MS,
        repeat: REPEAT_INTERVAL
      },
      Down: {
        press: () => shortArrow(+1),
        long: () => bumpVolume(-1),
        threshold: LONG_PRESS_MS,
        repeat: REPEAT_INTERVAL
      },
      Left: {
        press: () => { if (activeTab > 0) changeTab(activeTab - 1); },
        long: () => seek(-SEEK_STEP),
        threshold: LONG_PRESS_MS,
        repeat: REPEAT_INTERVAL
      },
      Right: {
        press: () => { if (activeTab < tabs.length - 1) changeTab(activeTab + 1); },
        long: () => seek(SEEK_STEP),
        threshold: LONG_PRESS_MS,
        repeat: REPEAT_INTERVAL
      },
      // 中键用 { press } 形式: 松手时触发一次。
      // 不能用普通函数 —— 按住不放会连发 keydown (e.repeat), 播放/暂停会被反复触发;
      // 而且 KaiOS 上长按中键会触发 MicrophoneToggle (语音助手), 动作重复一次就够。
      Enter: {
        press: () => {
          // 评论 tab: 焦点在评论列表里 → 激活焦点 (展开/收起子评论、加载更多)
          if (activeTab === 1 && activateInComments()) return;
          // 其余情况: 播放 / 暂停
          requestPlay();
        }
      },
      // 真机上真的有音量键的机型 (Nokia 6300 4G / 8000 4G / 225 4G 等):
      // 硬件音量键 → 和长按 ↑↓ 一样调音量 (KaiOS 侧走 navigator.volumeManager)
      VolumeUp: () => bumpVolume(1),
      VolumeDown: () => bumpVolume(-1),
      // 静音键: 系统音量接口没有静音方法, 静音由应用把媒体元素 muted 置位
      Mute: () => {
        settings.update(s => ({ ...s, muted: !s.muted }));
      },
      // 左软键: 评论 tab = 回复 (功能下线, 显示「待实现」), 详情 tab = 全屏
      SoftLeft: () => {
        // 评论 tab: 回复功能下线 (软键显示「待实现」), 按下去给个提示
        if (activeTab === 1) {
          showToast('评论回复功能待实现');
        } else {
          toggleFullscreen();
        }
      }
      // 右软键不再单独绑: 它变成了「更多」, 由软键栏的二级菜单接管
      // (见下面的 buildVideoMenu / opts.menu)
    }, { priority: 10, softkeys: true, menu: () => buildVideoMenu() });

    // 封面尺寸跟着视口走 (跟着播放区域宽度)
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => {
      window.removeEventListener('resize', updateSize);
      off();
    };
  });

  function fmt(t) {
    if (!t || isNaN(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // 格式化时间
  /** @param {number} ts */
  function relativeTime(ts) {
    if (!ts) return '';
    const now = Date.now() / 1000;
    const diff = now - ts;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 2592000) return Math.floor(diff / 86400) + '天前';
    const d = new Date(ts * 1000);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  onDestroy(() => {
    // 组件销毁时停止上报并上报最终进度
    stopReportTimer();
    doReportProgress();
    releaseWakeLock();
    if (dashAudio) {
      dashAudio.pause();
      dashAudio.src = '';
    }
  });
</script>

<div class="video-detail-page" bind:this={root}>
  <!-- 顶部视频播放区域 -->
  <div class="player-area">
    <div class="player">
      {#if mode === 'video'}
        {#if src}
          <video
            bind:this={video}
            {src}
            {poster}
            preload="metadata"
            audio-channel="content"
            on:loadedmetadata={onMediaLoaded}
            on:timeupdate={onTimeUpdate}
            on:progress={onTimeUpdate}
            on:play={onPlay}
            on:pause={onPause}
            on:ended={onVideoEnded}
            on:error={onMediaError}
          ></video>
        {:else}
          <!--
            播放地址还没拉到 (设置里关了"打开视频立刻播放"):
            不建 <video> 元素 = 一个字节的视频数据都不下, 只显示封面
          -->
          <img class="cover" src={posterUrl} alt="" />
        {/if}
        <!-- DASH 模式下同步播放独立音频流 -->
        {#if audioSrc}
          <audio
            bind:this={dashAudio}
            src={audioSrc}
            preload="metadata"
            style="display: none;"
          ></audio>
        {/if}
      {:else}
        <!-- 听视频模式: 仅渲染 <audio>, 不画任何画面, 真正省电省带宽 -->
        <audio
          bind:this={audio}
          src={audioSrc}
          preload="metadata"
          audio-channel="content"
          on:loadedmetadata={onMediaLoaded}
          on:timeupdate={onTimeUpdate}
          on:progress={onTimeUpdate}
          on:play={onPlay}
          on:pause={onPause}
          on:ended={onAudioEnded}
          on:error={onMediaError}
        ></audio>
      {/if}

      <!-- 覆盖层: 平时隐藏, 出错时露出错误文案 (音量提示交给系统自己的气泡) -->
      <div class="overlay" class:hidden={!showControls && !error}>
        <div class="title">{title}</div>
        <div class="time">{fmt(currentTime)} / {fmt(duration)}</div>
        {#if mode === 'audio'}
          <div class="listen-badge">● 听视频模式 (仅音频)</div>
        {/if}
        {#if error}
          <div class="err">{error}</div>
        {/if}
      </div>

      <!-- 还没加载视频: 提示按中键 (播放) 才去拉流 -->
      {#if notLoaded}
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

      <!-- 播放进度条 -->
      <div class="progress-bar">
        <div class="progress-track">
          <!-- 缓冲进度 -->
          <div class="progress-buffered" style="width: {duration > 0 ? (buffered / duration) * 100 : 0}%"></div>
          <!-- 播放进度 -->
          <div class="progress-played" style="width: {duration > 0 ? (currentTime / duration) * 100 : 0}%"></div>
        </div>
        <!-- 时间显示 -->
        <div class="progress-time">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Tab 切换栏 -->
  <div class="tab-bar">
    {#each tabs as t, i}
      <button
        class="tab"
        class:active={activeTab === i}
        on:click={() => changeTab(i)}
      >
        {t.label}
      </button>
    {/each}
  </div>

  <!-- 内容区域 -->
  <div class="content-area">
    {#if activeTab === 0}
      <!-- 视频详情 Tab -->
      <div class="detail-scroll" data-nav-root>
        {#if meta}
          <!-- 视频标题 -->
          <div class="detail-section">
            <h1 class="video-title">{meta.title || title}</h1>
            <div class="video-meta-row">
              <span class="meta-item">▶ {formatCount(meta.stat ? meta.stat.view : 0)}</span>
              <span class="meta-item">❝ {formatCount(meta.stat ? meta.stat.danmaku : 0)}</span>
              <span class="meta-item">{relativeTime(meta.pubdate)}</span>
            </div>
          </div>

          <!-- UP主信息 -->
          {#if meta.owner}
            <div class="detail-section up-info">
              <img class="up-face" src={meta.owner.face} alt="" />
              <div class="up-text">
                <div class="up-name">{meta.owner.name}</div>
                {#if meta.owner.fans}
                  <div class="up-fans">{formatCount(meta.owner.fans)} 粉丝</div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- 视频简介 -->
          {#if meta.desc}
            <div class="detail-section">
              <div class="section-label">简介</div>
              <div class="video-desc">{meta.desc}</div>
            </div>
          {/if}

          <!-- 互动数据 -->
          <div class="detail-section">
            <div class="interact-row">
              <div class="interact-item" class:active={status.like}>
                <span class="interact-icon">❤</span>
                <span class="interact-count">{formatCount(counts.like)}</span>
              </div>
              <div class="interact-item" class:active={status.coin}>
                <span class="interact-icon">◎</span>
                <span class="interact-count">{formatCount(counts.coin)}</span>
              </div>
              <div class="interact-item" class:active={status.fav}>
                <span class="interact-icon">★</span>
                <span class="interact-count">{formatCount(counts.fav)}</span>
              </div>
            </div>
          </div>

          <!-- 视频标签 -->
          {#if meta.tname}
            <div class="detail-section">
              <div class="section-label">分区</div>
              <div class="tag-list">
                <span class="tag">{meta.tname}</span>
              </div>
            </div>
          {/if}
        {:else}
          <div class="empty-state">
            <span class="empty-text">加载中...</span>
          </div>
        {/if}
      </div>
    {:else}
      <!-- 评论区 Tab -->
      <div class="comment-scroll" data-nav-root>
        <CommentSection
          comments={replies}
          commentsLoading={replyLoading}
          commentsError={replyError}
          commentHasMore={replyHasMore}
          oid={meta ? (meta.aid || meta.bvid) : ''}
          on:focuschange={(/** @type {any} */ e) => dispatch('focuschange', e.detail)}
          on:loadMore={() => dispatch('loadmore')}
        />
      </div>
    {/if}
  </div>
</div>

<style>
  /* ========== 页面根容器 ========== */
  .video-detail-page {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--md-sys-color-surface);
    overflow: hidden;
  }

  /* ========== 视频播放区域 ==========
     16:9 的高度按**视口宽度**算 (播放区域铺满 .screen 的 100vw),
     不写死 135px (= 240 * 9/16) —— 换屏幕宽度时播放区不会被拉变形。
     Firefox 48 不支持 aspect-ratio, 只能用 vw 换算。 */
  .player-area {
    flex-shrink: 0;
    width: 100%;
    height: 56.25vw;   /* 16:9 */
    max-height: 45vh;  /* 屏幕太矮时别把播放区撑太大 */
    background: #000;
    position: relative;
  }

  .player {
    width: 100%;
    height: 100%;
    position: relative;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }

  /* 还没加载视频时显示的封面 (占法和 <video> 一样) */
  .cover {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }

  /* 封面上的提示: 按中键才去加载播放 (压在封面上, 所以给个深底才看得清) */
  .cover-hint {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 4px 10px;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    font-size: var(--md-sys-typescale-body-medium-size);
    border-radius: 12px;
    white-space: nowrap;
    pointer-events: none;
  }

  audio {
    width: 100%;
    height: 32px;
  }

  /* 播放器覆盖层 */
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
    color: #fff;
    padding: 4px 6px;
    font-size: var(--md-sys-typescale-body-small-size);
    pointer-events: none;
  }
  .overlay.hidden {
    display: none;
  }
  .overlay .title {
    font-size: var(--md-sys-typescale-body-large-size);
    color: #fff;
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .overlay .time {
    font-size: var(--md-sys-typescale-body-small-size);
    color: #aaa;
  }
  .listen-badge {
    margin-top: 4px;
    color: var(--md-sys-color-primary);
    font-size: var(--md-sys-typescale-body-small-size);
  }
  .err {
    margin-top: 4px;
    color: var(--md-sys-color-error);
    font-size: var(--md-sys-typescale-body-small-size);
  }

  /* ========== 播放进度条 ========== */
  .progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 4px 6px 6px;
    background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
    pointer-events: none;
  }
  .progress-track {
    position: relative;
    width: 100%;
    height: 3px;
    background: rgba(255,255,255,0.2);
    border-radius: var(--md-sys-shape-corner-small);
    overflow: hidden;
  }
  .progress-buffered {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: rgba(255,255,255,0.35);
    border-radius: var(--md-sys-shape-corner-small);
    transition: width 0.3s ease;
  }
  .progress-played {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: var(--md-sys-color-primary);
    border-radius: var(--md-sys-shape-corner-small);
    transition: width 0.2s linear;
  }
  .progress-time {
    display: flex;
    justify-content: space-between;
    margin-top: 3px;
    font-size: var(--md-sys-typescale-label-small-size);
    color: rgba(255,255,255,0.8);
  }

  /* ========== Tab 栏 ========== */
  .tab-bar {
    display: flex;
    height: 32px;
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }
  .tab-bar .tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--md-sys-typescale-body-small-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    color: var(--md-sys-color-on-surface-variant);
    background: transparent;
    border: none;
    cursor: pointer;
    position: relative;
  }
  .tab-bar .tab.active {
    color: var(--md-sys-color-primary);
  }
  .tab-bar .tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 20%;
    right: 20%;
    height: 2px;
    background: var(--md-sys-color-primary);
    border-radius: var(--md-sys-shape-corner-small);
  }

  /* ========== 内容区域 ========== */
  .content-area {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* ========== 详情滚动区 ========== */
  .detail-scroll {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    /* scrollbar-width: none; Firefox 48 不支持 */
    padding: 8px;
  }
  .detail-scroll::-webkit-scrollbar {
    display: none;
  }

  .detail-section {
    padding: 8px 0;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  .detail-section:last-child {
    border-bottom: none;
  }

  .video-title {
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    color: var(--md-sys-color-on-surface);
    line-height: 1.4;
    margin: 0 0 4px 0;
  }

  .video-meta-row {
    display: flex;
    /* gap: 12px; Firefox 48 不支持 flex gap */
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .video-meta-row .meta-item {
    margin-right: 12px;
  }
  .video-meta-row .meta-item:last-child {
    margin-right: 0;
  }
  .meta-item {
    white-space: nowrap;
  }

  /* UP主信息 */
  .up-info {
    display: flex;
    align-items: center;
    /* gap: 8px; Firefox 48 不支持 flex gap */
  }
  .up-info .up-face {
    margin-right: 8px;
  }
  .up-face {
    width: 36px;
    height: 36px;
    border-radius: var(--md-sys-shape-corner-full);
    object-fit: cover;
    flex-shrink: 0;
  }
  .up-text {
    flex: 1;
    min-width: 0;
  }
  .up-name {
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    color: var(--md-sys-color-primary);
  }
  .up-fans {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* 简介 */
  .section-label {
    font-size: var(--md-sys-typescale-label-large-size);
    font-weight: var(--md-sys-typescale-label-large-weight);
    color: var(--md-sys-color-on-surface-variant);
    margin-bottom: 4px;
  }
  .video-desc {
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface);
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-all;
  }

  /* 互动按钮 */
  .interact-row {
    display: flex;
    justify-content: space-around;
    padding: 4px 0;
  }
  .interact-item {
    display: flex;
    align-items: center;
    /* gap: 4px; Firefox 48 不支持 flex gap */
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .interact-item .interact-icon {
    margin-right: 4px;
  }
  .interact-item.active {
    color: var(--md-sys-color-primary);
  }
  .interact-icon {
    font-size: 14px;
  }
  .interact-count {
    font-size: var(--md-sys-typescale-body-small-size);
  }

  /* 标签 */
  .tag-list {
    display: flex;
    flex-wrap: wrap;
    /* gap: 4px; Firefox 48 不支持 flex gap */
  }
  .tag-list .tag {
    margin-right: 4px;
    margin-bottom: 4px;
  }
  .tag {
    padding: 2px 8px;
    border-radius: var(--md-sys-shape-corner-small);
    background: var(--md-sys-color-surface-container-low);
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* ========== 评论滚动区 ========== */
  .comment-scroll {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    /* scrollbar-width: none; Firefox 48 不支持 */
    padding: 4px 8px;
  }
  .comment-scroll::-webkit-scrollbar {
    display: none;
  }

  /* ========== 空状态 / 加载 ========== */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 8px;
    /* gap: 8px; Firefox 48 不支持 flex gap */
  }
  .empty-state > * + * {
    margin-top: 8px;
  }
  .empty-text {
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .loading-more {
    display: flex;
    align-items: center;
    justify-content: center;
    /* gap: 8px; Firefox 48 不支持 flex gap */
    padding: 12px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .loading-more > * + * {
    margin-left: 8px;
  }
  .spinner-small {
    width: 16px;
    height: 16px;
    border: 2px solid var(--md-sys-color-outline-variant);
    border-top-color: var(--md-sys-color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
