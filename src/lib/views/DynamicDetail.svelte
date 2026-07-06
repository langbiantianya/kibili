<script>
  import { onMount, onDestroy } from 'svelte';
  import { onKey, offKey, moveFocus } from '../keyboard/index.js';
  import { setSoftkeys } from '../stores/ui.js';
  import Loading from '../components/Loading.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { getDynamicDetail } from '../api/dynamic.js';
  import { getReplies, getSubReplies, addReply } from '../api/interact.js';
  import { formatCount, relativeTime, stripHtml } from '../utils/format.js';
  import { biliImg } from '../utils/platform.js';
  import CommentReply from '../components/CommentReply.svelte';

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

  // 子评论展开状态: rpid -> { expanded: bool, loading: bool, replies: [] }
  let subRepliesMap = {};

  // 评论回复
  let replyText = '';
  let replySending = false;
  let replyError = '';
  let replyTarget = null; // { rpid, uname } 回复目标，null 为回复视频
  let focusedCommentRpid = null; // 当前键盘聚焦的评论 rpid

  // 获取子评论中被回复人的名字
  // 优先从 message 中的 "回复 @xxx :" 提取，其次从 parent 匹配已有评论
  function getReplyToName(r, rootComment, siblingReplies) {
    // 从 message 提取 "回复 @xxx :"
    const msg = r.content && r.content.message || '';
    const match = msg.match(/^回复 @(.+?)\s*:/);
    if (match) return match[1];
    // 从 parent 匹配: 如果 parent === root，则是回复根评论
    if (r.parent === rootComment.rpid) return rootComment.member.uname;
    // 从兄弟评论中查找 parent
    const found = siblingReplies.find(s => s.rpid === r.parent);
    if (found) return found.member.uname;
    return '';
  }

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

  // 加载子评论，打平显示
  async function loadSubReplies(c) {
    if (!detail || !detail.archive || !detail.archive.bvid) return;
    const rpid = c.rpid;
    // 已展开则收起
    if (subRepliesMap[rpid] && subRepliesMap[rpid].expanded) {
      subRepliesMap[rpid] = { ...subRepliesMap[rpid], expanded: false };
      subRepliesMap = subRepliesMap; // 触发响应式更新
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
      const oid = detail.archive.bvid;
      const data = await getSubReplies(oid, rpid);
      const replies = (data && data.replies) ? data.replies : [];
      subRepliesMap[rpid] = { expanded: true, loading: false, replies };
      subRepliesMap = subRepliesMap;
    } catch (e) {
      subRepliesMap[rpid] = { expanded: false, loading: false, replies: [] };
      subRepliesMap = subRepliesMap;
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
  async function sendReply(text) {
    if (!text.trim()) return;
    if (!detail || !detail.archive || !detail.archive.bvid) {
      replyError = '无法评论';
      return;
    }
    replySending = true;
    replyError = '';
    try {
      const oid = detail.archive.bvid;
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
      // 刷新评论列表
      commentPage = 1;
      comments = [];
      commentHasMore = true;
      await loadComments();
    } catch (e) {
      replyError = e.message || '发送失败';
    } finally {
      replySending = false;
    }
  }

  // 设置回复目标（点击评论卡片时）
  // c: 根评论; sub: 子评论（可选）
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
          changeTab(1); // 切换到评论 tab
          // 聚焦输入框
          setTimeout(() => {
            const textarea = document.querySelector('.reply-bar textarea');
            if (textarea) textarea.focus();
          }, 100);
        } else if (activeTab === 1) {
          // 评论 tab：回复当前聚焦的评论
          const focused = document.querySelector('.comment-item:focus, .sub-item:focus');
          if (focused) {
            const rpid = Number(focused.dataset.rpid);
            // 先查找根评论
            const rootComment = comments.find(c => c.rpid === rpid);
            if (rootComment) {
              setReplyTarget(rootComment);
            } else {
              // 查找子评论
              for (const c of comments) {
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
            // 未选中评论，回复帖子本身
            replyTarget = null;
          }
          // 聚焦输入框
          const textarea = document.querySelector('.reply-bar textarea');
          if (textarea) textarea.focus();
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
            {@const sub = subRepliesMap[c.rpid]}
            <div class="comment-item" data-navable tabindex="0" data-rpid={c.rpid}
                 on:click={() => setReplyTarget(c)}
                 on:keydown={(e) => { if (e.key === 'Enter' && c.rcount > 0) loadSubReplies(c); }}>
              <div class="comment-head">
                <img class="comment-face" src={biliImg(c.member.face, 32, 32)} alt="" />
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
                  {@const replyName = getReplyToName(r, c, sub.replies)}
                  <div class="sub-item" data-navable tabindex="0" data-rpid={r.rpid}
                       on:click={() => setReplyTarget(c, r)}>
                    <div class="comment-head">
                      <img class="comment-face" src={biliImg(r.member.face, 24, 24)} alt="" />
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
              {/if}
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
        <!-- 评论回复输入框 -->
        <CommentReply
          placeholder={replyTarget ? `回复 @${replyTarget.uname}...` : '写评论...'}
          disabled={replySending}
          value={replyText}
          on:input={(e) => replyText = e.detail}
          on:send={(e) => sendReply(e.detail)}
        />
        {#if replyError}
          <div class="reply-error">{replyError}</div>
        {/if}
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
    gap: 8px;
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .detail-content::-webkit-scrollbar {
    display: none;
  }
  .author-row {
    display: flex;
    align-items: center;
    gap: 8px;
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
    font-size: var(--md-sys-typescale-body-small-size);
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
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .comment-list::-webkit-scrollbar {
    display: none;
  }
  .comment-item {
    padding: 8px 0;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    transition: background 0.15s ease;
    cursor: pointer;
  }
  .comment-item:focus,
  .comment-item:hover {
    background: var(--md-sys-color-surface-container-high);
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
    border-radius: var(--md-sys-shape-corner-full);
    object-fit: cover;
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
    word-break: break-word;
  }
  .comment-stat {
    font-size: var(--md-sys-typescale-body-small-size);
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
  .sub-loading {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 30px;
    padding: 4px 0;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .sub-item {
    margin-left: 30px;
    padding: 6px 0;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    transition: background 0.15s ease;
    cursor: pointer;
  }
  .sub-item:focus,
  .sub-item:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .reply-to {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .sub-toggle {
    cursor: pointer;
  }
  .reply-error {
    padding: 4px 12px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-error);
    background: var(--md-sys-color-surface-container);
    text-align: center;
  }
  .no-more {
    text-align: center;
    padding: 12px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
