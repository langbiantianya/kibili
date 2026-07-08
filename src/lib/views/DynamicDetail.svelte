<script>
  import { onMount, onDestroy } from 'svelte';
  import { onKey, offKey, moveFocus } from '../keyboard/index.js';
  import { setSoftkeys } from '../stores/ui.js';
  import Loading from '../components/Loading.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import CommentSection from '../components/CommentSection.svelte';
  import { getDynamicDetail } from '../api/dynamic.js';
  import { getReplies, addReply } from '../api/interact.js';
  import { formatCount, stripHtml } from '../utils/format.js';
  import { biliImg } from '../utils/platform.js';

  // 从 URL hash 参数获取动态 ID
  // 格式: #/dynamic-detail?id=xxx
  function getDynamicId() {
    const hash = location.hash || '';
    const match = hash.match(/[?&]id=([^&]+)/);
    return match ? match[1] : '';
  }

  // Tab
  const tabs = [
    { key: 'detail', label: '详情' },
    { key: 'comments', label: '评论' }
  ];
  let activeTab = 0;

  // 动态详情数据
  let detail = null;
  let detailLoading = true;
  let detailError = '';

  // 评论数据
  let comments = [];
  let commentsLoading = false;
  let commentsError = '';
  let commentPage = 1;
  let commentHasMore = true;

  // CommentSection 组件实例引用
  /** @type {any} */
  let commentSectionRef;

  // 评论回复
  let replyTarget = null; // 回复目标，null 为回复视频

  // 解析动态详情数据
  function parseDetail(data) {
    if (!data || !data.item) return null;
    const item = data.item;
    const modules = item.modules || {};
    const author = modules.module_author || {};
    const moduleDynamic = modules.module_dynamic || {};
    const moduleStat = modules.module_stat || {};

    return {
      id: item.id_str || '',
      type: item.type || '',
      // 作者信息
      author: {
        mid: author.mid || 0,
        name: author.name || '',
        face: author.face || '',
        pub_time: author.pub_time || '',
        pub_action: author.pub_action || ''
      },
      // 动态内容
      content: moduleDynamic.desc ? moduleDynamic.desc.text : '',
      // 统计数据
      stat: {
        like: moduleStat.like ? moduleStat.like.count : 0,
        forward: moduleStat.forward ? moduleStat.forward.count : 0,
        comment: moduleStat.comment ? moduleStat.comment.count : 0,
        view: moduleStat.view ? moduleStat.view.count : 0
      },
      // 附件（视频/图片等）
      archive: extractArchive(moduleDynamic)
    };
  }

  function extractArchive(moduleDynamic) {
    if (!moduleDynamic.major) return null;
    const major = moduleDynamic.major;
    if (major.type === 'MAJOR_TYPE_ARCHIVE' && major.archive) {
      return {
        type: 'video',
        title: major.archive.title || '',
        cover: major.archive.cover || '',
        bvid: major.archive.bvid || '',
        duration: major.archive.duration_text || ''
      };
    }
    if (major.type === 'MAJOR_TYPE_DRAW' && major.draw) {
      return {
        type: 'draw',
        items: major.draw.items || []
      };
    }
    if (major.type === 'MAJOR_TYPE_OPUS' && major.opus) {
      return {
        type: 'opus',
        summary: major.opus.summary ? major.opus.summary.text : ''
      };
    }
    return null;
  }

  async function loadDetail() {
    const id = getDynamicId();
    if (!id) {
      detailError = '动态ID缺失';
      detailLoading = false;
      return;
    }
    detailLoading = true;
    detailError = '';
    try {
      const data = await getDynamicDetail(id);
      console.log('[DynamicDetail] getDynamicDetail response:', data);
      detail = parseDetail(data);
      console.log('[DynamicDetail] parsed detail:', detail);
    } catch (e) {
      console.error('[DynamicDetail] getDynamicDetail error:', e);
      detailError = e.message || '加载失败';
    } finally {
      detailLoading = false;
    }
  }

  async function loadComments(isLoadMore = false) {
    if (!detail || !detail.archive || !detail.archive.bvid) {
      commentsError = '该动态没有可评论的视频';
      return;
    }
    if (commentsLoading || !commentHasMore) return;

    if (isLoadMore) {
      commentsLoading = true;
    } else {
      commentsLoading = true;
      commentPage = 1;
      comments = [];
    }
    commentsError = '';

    try {
      // 通过 bvid 获取评论, oid 需要是 aid (数字)
      // 但 getReplies 接口接受 bvid 作为 oid, 所以直接用 bvid
      const oid = detail.archive.bvid;
      console.log('[DynamicDetail] getReplies oid:', oid);
      const data = await getReplies(oid, { pn: commentPage, ps: 20, sort: 2 });
      console.log('[DynamicDetail] getReplies response:', data);
      const newComments = (data && data.replies) ? data.replies : [];
      if (isLoadMore) {
        comments = comments.concat(newComments);
      } else {
        comments = newComments;
      }
      commentHasMore = newComments.length >= 20;
      commentPage++;
    } catch (e) {
      console.error('[DynamicDetail] getReplies error:', e);
      commentsError = e.message || '加载失败';
    } finally {
      commentsLoading = false;
    }
  }

  function changeTab(i) {
    activeTab = i;
    if (i === 1 && comments.length === 0 && !commentsLoading) {
      loadComments();
    }
  }

  // 滚动距离（像素）
  const SCROLL_STEP = 60;

  function scrollDetail(delta) {
    const el = document.querySelector('.detail-content');
    if (el) el.scrollTop += delta * SCROLL_STEP;
  }

  function scrollComments(delta) {
    const el = document.querySelector('.comment-list');
    if (el) el.scrollTop += delta * SCROLL_STEP;
  }

  // 发送评论
  async function sendReply(text, root, parent) {
    if (!text.trim()) return;
    if (!detail || !detail.archive || !detail.archive.bvid) {
      return;
    }
    try {
      const oid = detail.archive.bvid;
      await addReply(oid, text.trim(), { root, parent });
      // 刷新评论列表
      commentPage = 1;
      comments = [];
      commentHasMore = true;
      await loadComments();
    } catch (e) {
      throw e;
    }
  }

  // 设置回复目标（点击评论卡片时）
  // c: 根评论; sub: 子评论（可选）
  /** @param {any} c */
  /** @param {any} [sub] */
  function setReplyTarget(c, sub) {
    if (sub) {
      // 回复子评论：root 是根评论 rpid，parent 是子评论 rpid
      replyTarget = { rpid: sub.rpid, uname: sub.member.uname, rootRpid: c.rpid };
    } else if (c) {
      // 回复根评论
      replyTarget = { rpid: c.rpid, uname: c.member.uname };
    } else {
      replyTarget = null;
    }
  }

  onMount(() => {
    // 初始软键设置
    setSoftkeys('刷新', '');
    loadDetail();
    onKey('dynamic-detail', {
      ArrowDown: () => {
        if (activeTab === 0) scrollDetail(+1);
        else {
          const moved = moveFocus(+1);
          if (!moved) scrollComments(+1);
        }
      },
      ArrowUp: () => {
        if (activeTab === 0) scrollDetail(-1);
        else {
          const moved = moveFocus(-1);
          if (!moved) scrollComments(-1);
        }
      },
      ArrowLeft: () => { if (activeTab > 0) changeTab(activeTab - 1); },
      ArrowRight: () => { if (activeTab < tabs.length - 1) changeTab(activeTab + 1); },
      SoftLeft: () => loadDetail(),
      SoftRight: () => {
        if (activeTab === 0) {
          // 详情 tab：直接评论帖子
          replyTarget = null;
          if (commentSectionRef) {
            commentSectionRef.openReply();
          }
        } else if (activeTab === 1) {
          // 评论 tab：回复当前聚焦的评论
          const focused = document.querySelector('.comment-item:focus, .sub-item:focus');
          if (focused) {
            const rpid = Number(focused.dataset.rpid);
            // 先查找根评论
            const rootComment = comments.find(c => c.rpid === rpid);
            if (rootComment) {
              setReplyTarget(rootComment);
              if (commentSectionRef) {
                commentSectionRef.openReply(rootComment);
              }
            } else {
              // 查找子评论
              for (const c of comments) {
                // 子评论查找需要在 CommentSection 内部处理
                // 这里简化处理，直接回复视频本身
              }
            }
          } else {
            // 未选中评论，回复帖子本身
            if (commentSectionRef) {
              commentSectionRef.openReply();
            }
          }
        }
      },
      '0': () => changeTab(activeTab === 0 ? 1 : 0),
    });
  });

  onDestroy(() => {
    offKey('dynamic-detail');
  });

  // 当切换 tab 时更新软键
  $: if (activeTab === 0) {
    setSoftkeys('刷新', '评论');
  } else {
    setSoftkeys('刷新', '回复');
  }

  // 处理评论发送事件
  async function onCommentSend(e) {
    const { text, root, parent } = e.detail;
    try {
      await sendReply(text, root, parent);
      if (commentSectionRef) {
        commentSectionRef.onSendSuccess();
      }
    } catch (err) {
      if (commentSectionRef) {
        commentSectionRef.onSendError(err.message || '发送失败');
      }
    }
  }
</script>

<div class="screen">
  <!-- Tab 切换 -->
  <div class="tab-bar">
    {#each tabs as t, i}
      <button class="tab" class:active={activeTab === i} on:click={() => changeTab(i)}>
        {t.label}
      </button>
    {/each}
  </div>

  <div class="main">
    {#if activeTab === 0}
      <!-- 详情 Tab -->
      {#if detailLoading}
        <Loading message="加载中..." />
      {:else if detailError}
        <EmptyState message={detailError} />
      {:else if detail}
        <div class="detail-content scroll-y">
          <!-- 作者信息 -->
          <div class="author-row">
            {#if detail.author.face}
              <img class="author-face" src={biliImg(detail.author.face, 40, 40)} alt="" />
            {/if}
            <div class="author-info">
              <div class="author-name">{detail.author.name}</div>
              <div class="author-action">{detail.author.pub_action} · {detail.author.pub_time}</div>
            </div>
          </div>

          <!-- 动态内容 -->
          {#if detail.content}
            <div class="content-text">{stripHtml(detail.content)}</div>
          {/if}

          <!-- 附件（视频/图片） -->
          {#if detail.archive}
            {#if detail.archive.type === 'video'}
              <div class="archive-card">
                <img class="archive-cover" src={biliImg(detail.archive.cover, 120, 80)} alt="" />
                <div class="archive-info">
                  <div class="archive-title">{detail.archive.title}</div>
                  {#if detail.archive.duration}<span class="archive-dur">{detail.archive.duration}</span>{/if}
                </div>
              </div>
            {:else if detail.archive.type === 'draw'}
              <div class="draw-list">
                {#each detail.archive.items as img}
                  <img src={biliImg(img.src, 100, 100)} alt="" />
                {/each}
              </div>
            {/if}
          {/if}

          <!-- 统计数据 -->
          <div class="stat-row">
            <span class="stat-item">❤ {formatCount(detail.stat.like)}</span>
            <span class="stat-item">↗ {formatCount(detail.stat.forward)}</span>
            <span class="stat-item">💬 {formatCount(detail.stat.comment)}</span>
            <span class="stat-item">👁 {formatCount(detail.stat.view)}</span>
          </div>
        </div>
      {:else}
        <EmptyState message="暂无数据" />
      {/if}
    {:else}
      <!-- 评论 Tab -->
      <CommentSection
        bind:this={commentSectionRef}
        comments={comments}
        commentsLoading={commentsLoading}
        commentsError={commentsError}
        commentHasMore={commentHasMore}
        oid={detail && detail.archive ? detail.archive.bvid : ''}
        on:send={onCommentSend}
      />
    {/if}
  </div>
</div>

<style>
  .tab-bar {
    display: flex;
    height: 32px;
    background: var(--md-sys-color-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    flex-shrink: 0;
  }
  .tab {
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
  .tab.active {
    color: var(--md-sys-color-primary);
  }
  .tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 20%;
    right: 20%;
    height: 2px;
    background: var(--md-sys-color-primary);
    border-radius: var(--md-sys-shape-corner-small);
  }

  .detail-content {
    padding: 8px;
    display: flex;
    flex-direction: column;
    /* gap: 8px; Firefox 48 不支持 flex gap */
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    /* scrollbar-width: none; Firefox 48 不支持 */
  }
  .detail-content::-webkit-scrollbar {
    display: none;
  }
  .detail-content > * + * {
    margin-top: 8px;
  }
  .author-row {
    display: flex;
    align-items: center;
    /* gap: 8px; Firefox 48 不支持 flex gap */
  }
  .author-row .author-face {
    margin-right: 8px;
  }
  .author-face {
    width: 36px;
    height: 36px;
    border-radius: var(--md-sys-shape-corner-full);
    object-fit: cover;
  }
  .author-info {
    flex: 1;
    min-width: 0;
  }
  .author-name {
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    color: var(--md-sys-color-primary);
  }
  .author-action {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .content-text {
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface);
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .archive-card {
    display: flex;
    /* gap: 8px; Firefox 48 不支持 flex gap */
    padding: 8px;
    background: var(--md-sys-color-surface-container-low);
    border-radius: var(--md-sys-shape-corner-small);
    border-left: 2px solid var(--md-sys-color-primary);
  }
  .archive-card .archive-cover {
    margin-right: 8px;
  }
  .archive-cover {
    width: 80px;
    height: 60px;
    object-fit: cover;
    border-radius: var(--md-sys-shape-corner-small);
    flex-shrink: 0;
  }
  .archive-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    /* gap: 4px; Firefox 48 不支持 flex gap */
  }
  .archive-info .archive-dur {
    margin-top: 4px;
  }
  .archive-title {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .archive-dur {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .draw-list {
    display: flex;
    flex-wrap: wrap;
    /* gap: 4px; Firefox 48 不支持 flex gap */
  }
  .draw-list img {
    margin-right: 4px;
    margin-bottom: 4px;
  }
  .draw-list img {
    width: 100px;
    height: 100px;
    object-fit: cover;
    border-radius: var(--md-sys-shape-corner-small);
  }
  .stat-row {
    display: flex;
    justify-content: space-around;
    padding: 8px 0;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    margin-top: 4px;
  }
  .stat-item {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
