<script>
  import { onMount, onDestroy } from 'svelte';
  import { navigate, back } from '../router/index.js';
  import { onKey, offKey, moveFocus } from '../keyboard/index.js';
  import { setSoftkeys } from '../stores/ui.js';
  import Loading from '../components/Loading.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { getDynamicDetail } from '../api/dynamic.js';
  import { getReplies } from '../api/interact.js';
  import { formatCount, relativeTime, stripHtml } from '../utils/format.js';
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

  function goBack() {
    back();
  }

  onMount(() => {
    // 初始软键设置
    setSoftkeys('返回', '');
    loadDetail();
    onKey('dynamic-detail', {
      ArrowDown: () => moveFocus(+1),
      ArrowUp: () => moveFocus(-1),
      SoftLeft: () => goBack(),
      SoftRight: () => {
        if (activeTab === 1) {
          loadComments(true);
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
    setSoftkeys('返回', '');
  } else {
    setSoftkeys('返回', '加载更多');
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
      {#if comments.length === 0 && !commentsLoading}
        <EmptyState message="暂无评论" />
      {:else}
        <div class="comment-list scroll-y">
          {#each comments as c (c.rpid)}
            <div class="comment-item" data-navable tabindex="0">
              <div class="comment-head">
                <img class="comment-face" src={biliImg(c.member.face, 32, 32)} alt="" />
                <span class="comment-name">{c.member.uname}</span>
                <span class="comment-time">{relativeTime(c.ctime)}</span>
              </div>
              <div class="comment-content">{c.content.message}</div>
              <div class="comment-stat">
                <span>❤ {formatCount(c.like)}</span>
                {#if c.rcount > 0}<span>💬 {formatCount(c.rcount)}</span>{/if}
              </div>
            </div>
          {/each}
          {#if commentsLoading}
            <div class="loading-more">
              <div class="spinner-small"></div>
              <span>加载中...</span>
            </div>
          {:else if !commentHasMore}
            <div class="no-more">没有更多评论了</div>
          {/if}
        </div>
      {/if}
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
    font-weight: 500;
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
    border-radius: 1px;
  }

  .detail-content {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .author-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .author-face {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
  }
  .author-info {
    flex: 1;
    min-width: 0;
  }
  .author-name {
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: 500;
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
    word-break: break-word;
  }
  .archive-card {
    display: flex;
    gap: 8px;
    padding: 8px;
    background: var(--md-sys-color-surface-container-low);
    border-radius: var(--md-sys-shape-corner-small);
    border-left: 2px solid var(--md-sys-color-primary);
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
    gap: 4px;
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
    font-size: 10px;
    color: var(--md-sys-color-on-surface-variant);
  }
  .draw-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
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

  .comment-list {
    padding: 4px 8px;
  }
  .comment-item {
    padding: 8px 0;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  .comment-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .comment-face {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
  }
  .comment-name {
    font-size: var(--md-sys-typescale-body-small-size);
    font-weight: 500;
    color: var(--md-sys-color-primary);
  }
  .comment-time {
    font-size: 10px;
    color: var(--md-sys-color-on-surface-variant);
    margin-left: auto;
  }
  .comment-content {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface);
    line-height: 1.4;
    margin-left: 30px;
    word-break: break-word;
  }
  .comment-stat {
    font-size: 10px;
    color: var(--md-sys-color-on-surface-variant);
    margin-left: 30px;
    margin-top: 4px;
    display: flex;
    gap: 8px;
  }
  .loading-more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
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
  .no-more {
    text-align: center;
    padding: 12px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
