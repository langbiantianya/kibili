<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { acquireWakeLock, releaseWakeLock } from './wake.js';
  import { settings } from '../stores/settings.js';
  import { moveFocus } from '../keyboard/index.js';
  import { getSubReplies, addReply } from '../api/interact.js';
  import { showToast } from '../stores/ui.js';

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

  // 子评论展开状态: rpid -> { expanded: bool, loading: bool, replies: [] }
  let subRepliesMap = {};

  // 评论回复
  let replyText = '';
  let replySending = false;
  let replyError = '';
  let replyTarget = null; // { rpid, uname, rootRpid? } 回复目标，null 为回复视频

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
  let isFullscreen = false; // 全屏状态

  // 长按检测
  const LONG_PRESS_MS = 400; // 长按阈值
  const REPEAT_INTERVAL = 1000; // 长按重复触发间隔 (1秒)
  let keyTimers = {}; // 存储按键定时器
  let longPressed = {}; // 标记是否已触发长按
  let repeatTimers = {}; // 存储重复触发定时器

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
    // 听视频模式下, 从父组件传入的 resumeAt 开始
    if (mode === 'audio' && resumeAt > 0 && m.duration) {
      try { m.currentTime = Math.min(resumeAt, m.duration - 1); } catch (e) {}
    }
    m.play().catch(() => {});
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

  function onPlay() {
    if (mode === 'video' && dashAudio && audioSrc) {
      dashAudio.play().catch(() => {});
    }
    dispatch('playstate', { playing: true });
  }

  function onPause() {
    if (mode === 'video' && dashAudio && audioSrc) {
      dashAudio.pause();
    }
    dispatch('playstate', { playing: false });
  }

  function onMediaError(e) {
    error = mode === 'audio' ? '音频错误' : '视频错误';
    if (dashAudio) {
      dashAudio.pause();
    }
    dispatch('error', error);
  }

  function onAudioEnded() {
    dispatch('ended');
  }
  function onVideoEnded() {
    if (dashAudio) {
      dashAudio.pause();
    }
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

  // 发送评论
  async function sendReply(text) {
    if (!text.trim()) return;
    if (!meta || !meta.aid) {
      replyError = '无法评论';
      return;
    }
    replySending = true;
    replyError = '';
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
      replyText = '';
      replyTarget = null;
      showToast('评论发送成功');
    } catch (e) {
      replyError = e.message || '发送失败';
    } finally {
      replySending = false;
    }
  }

  // 长按检测: 开始
  /** @param {string} key */
  function startLongPress(key, /** @type {() => void} */ longAction) {
    longPressed[key] = false;
    keyTimers[key] = setTimeout(() => {
      longPressed[key] = true;
      // 首次执行长按动作
      longAction();
      // 设置重复触发定时器 (每隔1秒)
      repeatTimers[key] = setInterval(() => {
        longAction();
      }, REPEAT_INTERVAL);
    }, LONG_PRESS_MS);
  }

  // 长按检测: 结束
  /** @param {string} key */
  function endLongPress(key, /** @type {() => void} */ shortAction) {
    if (keyTimers[key]) {
      clearTimeout(keyTimers[key]);
      delete keyTimers[key];
    }
    // 清除重复触发定时器
    if (repeatTimers[key]) {
      clearInterval(repeatTimers[key]);
      delete repeatTimers[key];
    }
    // 如果没有触发长按，执行短按
    if (!longPressed[key]) {
      shortAction();
    }
    delete longPressed[key];
  }

  // 清除所有长按定时器
  function clearAllTimers() {
    Object.keys(keyTimers).forEach(k => {
      if (keyTimers[k]) clearTimeout(keyTimers[k]);
    });
    Object.keys(repeatTimers).forEach(k => {
      if (repeatTimers[k]) clearInterval(repeatTimers[k]);
    });
    keyTimers = {};
    longPressed = {};
    repeatTimers = {};
  }

  function fmt(t) {
    if (!t || isNaN(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // 格式化数字
  /** @param {number} n */
  function formatCount(n) {
    if (!n) return '0';
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return String(n);
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

  onMount(() => {
    // 使用原生 keydown/keyup 实现长按/短按区分
    const onKeyDown = (e) => {
      const key = e.key;
      if (keyTimers[key]) return; // 已经在长按中

      switch (key) {
        case 'ArrowUp':
          e.preventDefault();
          startLongPress(key, () => {
            // 长按: 持续增加系统音量 (KaiOS 音量级别 +1)
            bumpVolume(1);
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          startLongPress(key, () => {
            // 长按: 持续降低系统音量 (KaiOS 音量级别 -1)
            bumpVolume(-1);
          });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          startLongPress(key, () => {
            // 长按: 持续后退
            seek(-5);
          });
          break;
        case 'ArrowRight':
          e.preventDefault();
          startLongPress(key, () => {
            // 长按: 持续前进
            seek(5);
          });
          break;
      }
    };

    const onKeyUp = (e) => {
      const key = e.key;
      // Enter 和 SoftLeft / SoftRight 不需要长按检测，直接处理
      if (key === 'Enter' || key === 'SoftLeft' || key === 'SoftRight') {
        // 这些按键在 keydown 中没有进入 startLongPress，所以 keyTimers[key] 为 undefined
        // 直接处理即可
      } else if (!keyTimers[key] && !longPressed[key]) {
        return; // 不是我们的按键
      }

      switch (key) {
        case 'ArrowUp':
          e.preventDefault();
          endLongPress(key, () => {
            // 短按: 详情页向上滚动 / 评论页聚焦上一条
            if (activeTab === 0) {
              scrollContent(-1);
            } else {
              const moved = moveFocus(-1);
              if (!moved) scrollContent(-1);
            }
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          endLongPress(key, () => {
            // 短按: 详情页向下滚动 / 评论页聚焦下一条
            if (activeTab === 0) {
              scrollContent(+1);
            } else {
              const moved = moveFocus(+1);
              if (!moved) scrollContent(+1);
            }
          });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          endLongPress(key, () => {
            // 短按: 切换到上一个 tab
            if (activeTab > 0) changeTab(activeTab - 1);
          });
          break;
        case 'ArrowRight':
          e.preventDefault();
          endLongPress(key, () => {
            // 短按: 切换到下一个 tab
            if (activeTab < tabs.length - 1) changeTab(activeTab + 1);
          });
          break;
        case 'Enter':
          e.preventDefault();
          // 只有在评论区且聚焦在某条评论上时，才展开子评论，否则播放/暂停
          if (activeTab === 1) {
            const focused = document.querySelector('.comment-item:focus, .sub-item:focus');
            if (focused) {
              const rpid = Number(focused.dataset.rpid);
              // 查找对应的根评论
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
          break;
        case 'SoftLeft':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'SoftRight':
          e.preventDefault();
          // 在评论区时，设置回复目标并聚焦输入框
          if (activeTab === 1) {
            const focused = document.querySelector('.comment-item:focus, .sub-item:focus');
            if (focused) {
              const rpid = Number(focused.dataset.rpid);
              // 查找对应的根评论
              const rootComment = replies.find(c => c.rpid === rpid);
              if (rootComment) {
                setReplyTarget(rootComment);
              } else {
                // 查找子评论
                for (const c of replies) {
                  const sub = subRepliesMap[c.rpid];
                  if (sub && sub.replies) {
                    const subComment = sub.replies.find(r => r.rpid === rpid);
                    if (subComment) {
                      setReplyTarget(c, subComment);
                      break;
                    }
                  }
                }
              }
            } else {
              // 未选中评论，回复视频本身
              setReplyTarget(null);
            }
            // 聚焦输入框
            setTimeout(() => {
              const textarea = document.querySelector('.reply-bar textarea');
              if (textarea) textarea.focus();
            }, 100);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);

    // 返回清理函数
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mozfullscreenchange', onFullscreenChange);
      clearAllTimers();
    };
  });

  onDestroy(() => {
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
      <div class="detail-scroll">
        {#if meta}
          <!-- 视频标题 -->
          <div class="detail-section">
            <h1 class="video-title">{meta.title || title}</h1>
            <div class="video-meta-row">
              <span class="meta-item">▶ {formatCount(meta.stat ? meta.stat.view : 0)}</span>
              <span class="meta-item">💬 {formatCount(meta.stat ? meta.stat.danmaku : 0)}</span>
              <span class="meta-item">📅 {relativeTime(meta.pubdate)}</span>
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
                <span class="interact-icon">🪙</span>
                <span class="interact-count">{formatCount(counts.coin)}</span>
              </div>
              <div class="interact-item" class:active={status.fav}>
                <span class="interact-icon">⭐</span>
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
      <div class="comment-scroll">
        {#if replyLoading && replies.length === 0}
          <div class="empty-state">
            <div class="spinner-small"></div>
            <span class="empty-text">加载评论...</span>
          </div>
        {:else if replies.length === 0}
          <div class="empty-state">
            <span class="empty-text">暂无评论</span>
          </div>
        {:else}
          {#each replies as c (c.rpid)}
            {#each [subRepliesMap[c.rpid]] as sub}
              <div class="comment-item" data-navable tabindex="0" data-rpid={c.rpid}
                   on:click={() => setReplyTarget(c)}
                   on:keydown={(e) => { if (e.key === 'Enter' && c.rcount > 0) loadSubReplies(c); }}>
                <div class="comment-head">
                  <img class="comment-face" src={c.member.face} alt="" />
                  <span class="comment-name">{c.member.uname}</span>
                  <span class="comment-time">{relativeTime(c.ctime)}</span>
                </div>
                <div class="comment-content">{c.content.message}</div>
                <div class="comment-stat">
                  <span>❤ {formatCount(c.like)}</span>
                  {#if c.rcount > 0}
                    <span class="sub-toggle">💬 {formatCount(c.rcount)}{sub && sub.expanded ? ' ▼' : ' ▶'}</span>
                  {/if}
                </div>
                <!-- 子评论打平显示 -->
                {#if sub && sub.loading}
                  <div class="sub-loading">
                    <div class="spinner-small"></div>
                    <span>加载中...</span>
                  </div>
                {:else if sub && sub.expanded && sub.replies.length}
                  {#each sub.replies as r (r.rpid)}
                    {#each [getReplyToName(r, c, sub.replies)] as replyName}
                      <div class="sub-item" data-navable tabindex="0" data-rpid={r.rpid}
                           on:click={() => setReplyTarget(c, r)}>
                        <div class="comment-head">
                          <img class="comment-face" src={r.member.face} alt="" />
                          <span class="comment-name">{r.member.uname}</span>
                          {#if replyName}
                            <span class="reply-to">回复 @{replyName}</span>
                          {/if}
                          <span class="comment-time">{relativeTime(r.ctime)}</span>
                        </div>
                        <div class="comment-content">{r.content.message}</div>
                        <div class="comment-stat">
                          <span>❤ {formatCount(r.like)}</span>
                        </div>
                      </div>
                    {/each}
                  {/each}
                {/if}
              </div>
            {/each}
          {/each}
          {#if replyLoading}
            <div class="loading-more">
              <div class="spinner-small"></div>
              <span>加载中...</span>
            </div>
          {/if}
        {/if}
        <!-- 评论回复输入框 -->
        {#if activeTab === 1}
          <div class="reply-bar">
            <textarea
              placeholder={replyTarget ? `回复 @${replyTarget.uname}...` : '写评论...'}
              disabled={replySending}
              value={replyText}
              on:input={(e) => replyText = e.target.value}
              on:keydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(replyText); } }}
            ></textarea>
            <button class="reply-send" disabled={replySending || !replyText.trim()} on:click={() => sendReply(replyText)}>
              发送
            </button>
          </div>
          {#if replyError}
            <div class="reply-error">{replyError}</div>
          {/if}
        {/if}
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

  .comment-item {
    padding: 8px 0;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    outline: none;
  }
  .comment-item:focus {
    background: var(--md-sys-color-surface-container-high);
  }
  .comment-item:last-child {
    border-bottom: none;
  }
  .comment-head {
    display: flex;
    align-items: center;
    /* gap: 6px; Firefox 48 不支持 flex gap */
    margin-bottom: 4px;
  }
  .comment-head .comment-face {
    margin-right: 6px;
  }
  .comment-face {
    width: 24px;
    height: 24px;
    border-radius: var(--md-sys-shape-corner-full);
    object-fit: cover;
    flex-shrink: 0;
  }
  .comment-name {
    font-size: var(--md-sys-typescale-body-small-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    color: var(--md-sys-color-primary);
  }
  .comment-time {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-left: auto;
  }
  .comment-content {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface);
    line-height: 1.4;
    margin-left: 30px;
    word-break: break-all;
  }
  .comment-stat {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-left: 30px;
    margin-top: 4px;
    display: flex;
    /* gap: 8px; Firefox 48 不支持 flex gap */
  }
  .comment-stat > * + * {
    margin-left: 8px;
  }
  .sub-toggle {
    cursor: pointer;
  }

  /* 子评论 */
  .sub-loading {
    display: flex;
    align-items: center;
    /* gap: 6px; Firefox 48 不支持 flex gap */
    margin-left: 30px;
    padding: 4px 0;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .sub-loading > * + * {
    margin-left: 6px;
  }
  .sub-item {
    margin-left: 30px;
    padding: 6px 0;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    outline: none;
  }
  .sub-item:focus {
    background: var(--md-sys-color-surface-container-high);
  }
  .reply-to {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* 评论回复输入框 */
  .reply-bar {
    display: flex;
    /* gap: 8px; Firefox 48 不支持 flex gap */
    padding: 8px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
  }
  .reply-bar textarea {
    flex: 1;
    margin-right: 8px;
  }
  .reply-bar textarea {
    flex: 1;
    min-height: 32px;
    max-height: 80px;
    padding: 6px 10px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-small);
    background: var(--md-sys-color-surface-container-low);
    color: var(--md-sys-color-on-surface);
    font-size: var(--md-sys-typescale-body-medium-size);
    resize: none;
    outline: none;
  }
  .reply-bar textarea:focus {
    border-color: var(--md-sys-color-primary);
  }
  .reply-send {
    padding: 6px 12px;
    border: none;
    border-radius: var(--md-sys-shape-corner-small);
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    font-size: var(--md-sys-typescale-body-small-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    cursor: pointer;
  }
  .reply-send:disabled {
    background: var(--md-sys-color-outline-variant);
    color: var(--md-sys-color-on-surface-variant);
    cursor: not-allowed;
  }
  .reply-error {
    padding: 4px 12px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-error);
    background: var(--md-sys-color-surface-container);
    text-align: center;
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
