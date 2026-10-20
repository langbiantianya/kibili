<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { releaseWakeLock } from './wake.js';
  import { settings } from '../stores/settings.js';
  import { moveFocus, onKey } from '../keyboard/index.js';
  import { addReply, reportProgress, getSubReplies } from '../api/interact.js';
  import { showToast } from '../stores/ui.js';
  import { formatCount } from '../utils/format.js';
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

  // 子评论展开状态: rpid -> { expanded: bool, loading: bool, replies: [] }
  let subRepliesMap = {};

  // 回复目标: { rpid, uname, rootRpid? } | null
  let replyTarget = null;

  // CommentSection 组件实例引用
  /** @type {any} */
  let commentSectionRef;

  let video;
  let audio;
  let dashAudio = /** @type {HTMLAudioElement|null} */ (null);
  /** @type {any} */
  let root;
  let showControls = false;
  let showVolSlider = false;
  /** @type {number|null} */
  let volTimer = null;
  let currentTime = 0;
  let duration = 0;
  let error = '';
  let buffered = 0; // 缓冲进度

  // 观看进度上报定时器
  /** @type {number|null} */
  let reportTimer = null;
  let lastReportedTime = 0;

  // 长按检测 (由按键总线统一实现, 这里只保留阈值参数)
  const LONG_PRESS_MS = 400;   // 长按阈值
  const REPEAT_INTERVAL = 1000; // 长按重复触发间隔 (1秒)

  // Tab 切换状态
  const tabs = [
    { key: 'detail', label: '详情' },
    { key: 'comments', label: '评论' }
  ];
  let activeTab = 0;

  const dispatch = createEventDispatcher();

  $: vol = $settings.volume;
  $: muted = $settings.muted;

  // 当音量/静音状态变化时, 同步更新 DASH 音频
  $: if (dashAudio && mode === 'video') {
    dashAudio.volume = vol;
    dashAudio.muted = muted;
  }

  // 当前激活的媒体元素
  $: media = mode === 'audio' ? audio : video;

  function onMediaLoaded() {
    const m = media;
    if (!m) return;
    duration = m.duration || 0;
    m.volume = vol;
    m.muted = muted;
    // DASH 模式下, 同步播放独立音频流
    if (mode === 'video' && dashAudio && audioSrc) {
      dashAudio.volume = vol;
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

  // KaiOS 系统音量调节 (使用 navigator.volumeManager)
  // 参考: navigator.volumeManager.requestUp() / requestDown()

  /** @param {number} delta */
  function bumpVolume(delta) {
    // delta > 0 增加音量, delta < 0 降低音量
    if (typeof navigator !== 'undefined' && /** @type {any} */ (navigator).volumeManager) {
      try {
        if (delta > 0) {
          /** @type {any} */ (navigator).volumeManager.requestUp();
        } else if (delta < 0) {
          /** @type {any} */ (navigator).volumeManager.requestDown();
        }
      } catch (e) {
        // 降级: 不执行任何操作
      }
    }
    // 显示音量提示 (KaiOS 系统会显示自己的音量 UI)
    showVolSlider = true;
    if (volTimer) clearTimeout(volTimer);
    volTimer = setTimeout(() => showVolSlider = false, 1500);
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

  // ========== 子评论 ==========
  // 加载子评论，打平显示
  async function loadSubReplies(c) {
    if (!meta || !meta.aid) return;
    const rpid = c.rpid;
    // 已展开则收起
    if (subRepliesMap[rpid] && subRepliesMap[rpid].expanded) {
      subRepliesMap[rpid] = { ...subRepliesMap[rpid], expanded: false };
      subRepliesMap = subRepliesMap;
      return;
    }
    // 已加载过则直接展开
    if (subRepliesMap[rpid] && subRepliesMap[rpid].replies.length) {
      subRepliesMap[rpid] = { ...subRepliesMap[rpid], expanded: true };
      subRepliesMap = subRepliesMap;
      return;
    }
    // 首次加载
    subRepliesMap[rpid] = { expanded: false, loading: true, replies: [] };
    subRepliesMap = subRepliesMap;
    try {
      const oid = meta.aid || meta.bvid;
      const data = await getSubReplies(oid, rpid);
      const replies = (data && data.replies) ? data.replies : [];
      subRepliesMap[rpid] = { expanded: true, loading: false, replies };
      subRepliesMap = subRepliesMap;
    } catch (e) {
      subRepliesMap[rpid] = { expanded: false, loading: false, replies: [] };
      subRepliesMap = subRepliesMap;
    }
  }

  // 获取子评论中被回复人的名字
  function getReplyToName(r, rootComment, siblingReplies) {
    const msg = r.content && r.content.message || '';
    const match = msg.match(/^回复 @(.+?)\s*:/);
    if (match) return match[1];
    if (r.parent === rootComment.rpid) return rootComment.member.uname;
    const found = siblingReplies.find(s => s.rpid === r.parent);
    if (found) return found.member.uname;
    return '';
  }

  // ========== 评论回复 ==========
  // 设置回复目标
  function setReplyTarget(c, sub) {
    if (sub) {
      replyTarget = { rpid: sub.rpid, uname: sub.member.uname, rootRpid: c.rpid };
    } else if (c) {
      replyTarget = { rpid: c.rpid, uname: c.member.uname };
    } else {
      replyTarget = null;
    }
  }

  // 回复当前聚焦的评论 (未聚焦时回复视频本身)
  function replyToFocusedComment() {
    const focused = document.querySelector('.comment-item:focus, .sub-item:focus');
    if (focused) {
      const rpid = Number(focused.dataset.rpid);
      const rootComment = replies.find(c => c.rpid === rpid);
      if (rootComment) {
        setReplyTarget(rootComment);
        if (commentSectionRef) commentSectionRef.openReply(rootComment);
        return;
      }
      // 查找子评论
      for (const c of replies) {
        const sub = subRepliesMap[c.rpid];
        if (sub && sub.replies) {
          const subComment = sub.replies.find(r => r.rpid === rpid);
          if (subComment) {
            setReplyTarget(c, subComment);
            if (commentSectionRef) commentSectionRef.openReply(c, subComment);
            return;
          }
        }
      }
    }
    // 未选中评论, 回复视频本身
    if (commentSectionRef) commentSectionRef.openReply();
  }

  // 发送评论
  async function sendReply(text) {
    if (!text.trim()) return;
    if (!meta || !meta.aid) {
      return;
    }
    try {
      const oid = meta.aid || meta.bvid;
      // replyTarget: { rpid, uname, isSub? }
      // 如果是子评论，root 是根评论 rpid，parent 是当前评论 rpid
      // 如果是根评论，root 和 parent 都是该评论 rpid
      // 回复帖子本身：root=0, parent=0
      let root = 0;
      let parent = 0;
      if (replyTarget) {
        root = replyTarget.rootRpid || replyTarget.rpid;
        parent = replyTarget.rpid;
      }
      await addReply(oid, text.trim(), { root, parent });
      replyTarget = null;
      showToast('评论发送成功');
    } catch (e) {
      throw e;
    }
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

  onMount(() => {
    return onKey('video-player', {
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
        long: () => seek(-5),
        threshold: LONG_PRESS_MS,
        repeat: REPEAT_INTERVAL
      },
      Right: {
        press: () => { if (activeTab < tabs.length - 1) changeTab(activeTab + 1); },
        long: () => seek(5),
        threshold: LONG_PRESS_MS,
        repeat: REPEAT_INTERVAL
      },
      // 中键用 { press } 形式: 松手时触发一次。
      // 不能用普通函数 —— 按住不放会连发 keydown (e.repeat), 播放/暂停会被反复触发;
      // 而且 KaiOS 上长按中键会触发 MicrophoneToggle (语音助手), 动作重复一次就够。
      Enter: {
        press: () => {
          // 只有在评论区且聚焦在某条评论上时，才展开子评论，否则播放/暂停
          if (activeTab === 1) {
            const focused = document.querySelector('.comment-item:focus, .sub-item:focus');
            if (focused) {
              const rpid = Number(focused.dataset.rpid);
              const rootComment = replies.find(c => c.rpid === rpid);
              if (rootComment && rootComment.rcount > 0) {
                loadSubReplies(rootComment);
              }
            } else {
              togglePlay();
            }
          } else {
            togglePlay();
          }
        }
      },
      // 真机上真的有音量键的机型 (Nokia 6300 4G / 8000 4G / 225 4G 等):
      // 硬件音量键 → 和长按 ↑↓ 一样调音量 (KaiOS 侧走 navigator.volumeManager)
      VolumeUp: () => bumpVolume(1),
      VolumeDown: () => bumpVolume(-1),
      // 静音键
      Mute: () => {
        settings.update(s => ({ ...s, muted: !s.muted }));
        showVolSlider = true;
        if (volTimer) clearTimeout(volTimer);
        volTimer = setTimeout(() => showVolSlider = false, 1500);
      },
      SoftLeft: () => {
        // 评论 tab: 回复评论; 详情 tab: 全屏
        if (activeTab === 1) {
          replyToFocusedComment();
        } else {
          toggleFullscreen();
        }
      }
      // SoftRight 不声明: 交给全局 app-back 兜底 (右软键 = 返回, 退出播放器)
    }, { priority: 10, softkeys: true });
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

      <div class="overlay" class:hidden={!showControls && !showVolSlider}>
        <div class="title">{title}</div>
        <div class="time">{fmt(currentTime)} / {fmt(duration)}</div>
        {#if showVolSlider}
          <div class="vol-slider">
            <span>音量</span>
            <div class="bar">
              <div class="fill" style="width: {(vol * 100)}%"></div>
            </div>
            <span>{Math.round(vol * 100)}%</span>
          </div>
        {/if}
        {#if mode === 'audio'}
          <div class="listen-badge">● 听视频模式 (仅音频)</div>
        {/if}
        {#if error}
          <div class="err">{error}</div>
        {/if}
      </div>

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
          bind:this={commentSectionRef}
          comments={replies}
          commentsLoading={replyLoading}
          commentsError={replyError}
          commentHasMore={replyHasMore}
          oid={meta ? (meta.aid || meta.bvid) : ''}
          on:send={(/** @type {any} */ e) => sendReply(e.detail.text)}
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

  /* ========== 视频播放区域 ========== */
  .player-area {
    flex-shrink: 0;
    width: 100%;
    /* aspect-ratio: 16 / 9; Firefox 48 不支持 */
    height: 135px; /* 240 * 9/16 = 135px, 固定 16:9 高度 */
    max-height: 45vh;
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
  .vol-slider {
    margin-top: 4px;
    display: flex;
    align-items: center;
    /* gap: 4px; Firefox 48 不支持 flex gap */
    font-size: var(--md-sys-typescale-body-small-size);
  }
  .vol-slider > * + * {
    margin-left: 4px;
  }
  .vol-slider .bar {
    flex: 1;
    height: 6px;
    background: #333;
    border: 1px solid #555;
  }
  .vol-slider .fill {
    height: 100%;
    background: var(--md-sys-color-primary);
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
