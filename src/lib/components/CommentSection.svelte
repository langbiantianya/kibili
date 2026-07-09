<script>
  import { createEventDispatcher } from 'svelte';
  import { getSubReplies } from '../api/interact.js';
  import { formatCount, relativeTime } from '../utils/format.js';
  import { biliImg } from '../utils/platform.js';
  import CommentReply from './CommentReply.svelte';
  import LoadingMore from './LoadingMore.svelte';

  // ========== Props ==========
  /** @type {any[]} */
  export let comments = [];
  export let commentsLoading = false;
  export let commentsError = '';
  export let commentHasMore = true;
  /** @type {string|number} */
  export let oid = ''; // 评论对象ID (bvid 或 aid)
  /** @type {string} */
  export let emptyMessage = '暂无评论';

  // ========== 内部状态 ==========
  // 子评论展开状态: rpid -> { expanded: bool, loading: bool, replies: [] }
  let subRepliesMap = {};

  // 评论回复
  let replyText = '';
  let replySending = false;
  let replyError = '';
  /** @type {{ rpid: number, uname: string, rootRpid?: number } | null} */
  let replyTarget = null;
  let showReplyModal = false;

  // CommentReply 组件实例引用
  /** @type {any} */
  let commentReplyRef;

  const dispatch = createEventDispatcher();

  // ========== 子评论 ==========

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

  // 加载子评论，打平显示
  async function loadSubReplies(c) {
    if (!oid) return;
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
      const data = await getSubReplies(oid, rpid);
      const replies = (data && data.replies) ? data.replies : [];
      subRepliesMap[rpid] = { expanded: true, loading: false, replies };
      subRepliesMap = subRepliesMap;
    } catch (e) {
      subRepliesMap[rpid] = { expanded: false, loading: false, replies: [] };
      subRepliesMap = subRepliesMap;
    }
  }

  // ========== 评论回复 ==========

  // 设置回复目标
  /** @param {any} c */
  /** @param {any} [sub] */
  function setReplyTarget(c, sub) {
    if (sub) {
      replyTarget = { rpid: sub.rpid, uname: sub.member.uname, rootRpid: c.rpid };
    } else if (c) {
      replyTarget = { rpid: c.rpid, uname: c.member.uname };
    } else {
      replyTarget = null;
    }
  }

  // 打开回复模态框（供外部调用）
  /** @param {any} [c] */
  /** @param {any} [sub] */
  export function openReply(c, sub) {
    setReplyTarget(c, sub);
    replyText = '';
    showReplyModal = true;
  }

  // 关闭回复模态框
  export function closeReply() {
    showReplyModal = false;
    replyText = '';
    replyTarget = null;
  }

  // 发送评论
  async function sendReply(text) {
    if (!text.trim()) return;
    replySending = true;
    replyError = '';
    try {
      // replyTarget: { rpid, uname, rootRpid? }
      // 如果是子评论，root 是根评论 rpid，parent 是当前评论 rpid
      // 如果是根评论，root 和 parent 都是该评论 rpid
      // 回复帖子本身：root=0, parent=0
      let root = 0;
      let parent = 0;
      if (replyTarget) {
        root = replyTarget.rootRpid || replyTarget.rpid;
        parent = replyTarget.rpid;
      }

      // 通过事件让父组件处理发送（因为不同页面使用的 API 可能不同）
      dispatch('send', { text: text.trim(), root, parent });
    } catch (e) {
      replyError = e.message || '发送失败';
    } finally {
      replySending = false;
    }
  }

  // 处理发送成功（由父组件调用）
  export function onSendSuccess() {
    replyText = '';
    replyTarget = null;
    showReplyModal = false;
  }

  // 处理发送失败（由父组件调用）
  /** @param {string} msg */
  export function onSendError(msg) {
    replyError = msg || '发送失败';
    replySending = false;
  }

  // 处理加载更多评论
  function loadMore() {
    dispatch('loadMore');
  }
</script>

<div class="comment-section">
  {#if comments.length === 0 && !commentsLoading}
    <div class="empty-state">
      <span class="empty-text">{emptyMessage}</span>
    </div>
  {:else}
    <div class="comment-list scroll-y">
      {#each comments as c (c.rpid)}
        {#each [subRepliesMap[c.rpid]] as sub}
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
                {#each [getReplyToName(r, c, sub.replies)] as replyName}
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
              {/each}
            {/if}
          </div>
        {/each}
      {/each}
      {#if commentsLoading}
        <LoadingMore />
      {:else if !commentHasMore && comments.length > 0}
        <div class="no-more">没有更多评论了</div>
      {/if}
    </div>

    <!-- 评论回复全屏组件 -->
    {#if showReplyModal}
      <CommentReply
        bind:this={commentReplyRef}
        placeholder={replyTarget ? `回复 @${replyTarget.uname}...` : '写评论...'}
        disabled={replySending}
        value={replyText}
        on:input={(/** @type {any} */ e) => replyText = e.detail}
        on:send={(/** @type {any} */ e) => sendReply(e.detail)}
        on:close={() => {
          showReplyModal = false;
          replyText = '';
          replyTarget = null;
        }}
      />
    {/if}
    {#if replyError}
      <div class="reply-error">{replyError}</div>
    {/if}
  {/if}
</div>

<style>
  .comment-section {
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-orient: vertical;
    -webkit-box-direction: normal;
    -ms-flex-direction: column;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .comment-list {
    padding: 4px 8px;
    -webkit-box-flex: 1;
    -ms-flex: 1;
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    /* scrollbar-width: none; Firefox 48 不支持 */
  }
  .comment-list::-webkit-scrollbar {
    display: none;
  }

  .comment-item {
    padding: 8px 0;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    -webkit-transition: background 0.15s ease;
    transition: background 0.15s ease;
    cursor: pointer;
    outline: none;
  }
  .comment-item:focus,
  .comment-item:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .comment-item:last-child {
    border-bottom: none;
  }

  .comment-head {
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-align: center;
    -ms-flex-align: center;
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
    -o-object-fit: cover;
    object-fit: cover;
    -ms-flex-negative: 0;
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
    display: -webkit-box;
    display: -ms-flexbox;
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
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-align: center;
    -ms-flex-align: center;
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
    -webkit-transition: background 0.15s ease;
    transition: background 0.15s ease;
    cursor: pointer;
    outline: none;
  }
  .sub-item:focus,
  .sub-item:hover {
    background: var(--md-sys-color-surface-container-high);
  }

  .reply-to {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  .reply-error {
    padding: 4px 12px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-error);
    background: var(--md-sys-color-surface-container);
    text-align: center;
    -ms-flex-negative: 0;
    flex-shrink: 0;
  }

  /* 空状态 / 加载 */
  .empty-state {
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-orient: vertical;
    -webkit-box-direction: normal;
    -ms-flex-direction: column;
    flex-direction: column;
    -webkit-box-align: center;
    -ms-flex-align: center;
    align-items: center;
    -webkit-box-pack: center;
    -ms-flex-pack: center;
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

  .no-more {
    text-align: center;
    padding: 12px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
</style>
