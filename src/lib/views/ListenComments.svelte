<script>
  // 听视频的评论页 (单独一页)
  //
  // URL: #/listen-comments?bvid=<bvid>&aid=<aid>
  //
  // 从听视频页的菜单「查看评论」进来。评论组件跟视频详情页共用
  // (components/CommentSection.svelte), 这里只管拉数据和按键。

  import { onMount } from 'svelte';
  import { getReplies } from '../api/interact.js';
  import { onKey, moveFocus } from '../keyboard/index.js';
  import { setSoftkeys } from '../stores/ui.js';
  import { buildAppMenu } from '../menu/appMenu.js';
  import CommentSection from '../components/CommentSection.svelte';

  let bvid = '';
  let aid = '';
  let replies = [];
  let replyLoading = false;
  let replyError = '';
  let replyHasMore = true;
  let replyPage = 1;
  let replyLoadingMore = false;
  /** 评论列表里中键的提示 (展开 / 收起) */
  let commentHint = '';

  async function loadReplies() {
    if (!aid) return;
    replyLoading = true;
    replyError = '';
    replyPage = 1;
    try {
      const d = await getReplies(aid, { pn: 1, ps: 20, sort: 2 });
      replies = (d && d.replies) ? d.replies : [];
      replyHasMore = replies.length >= 20;
    } catch (e) {
      replyError = e.message || '评论加载失败';
    } finally {
      replyLoading = false;
    }
  }

  async function loadMoreReplies() {
    if (replyLoadingMore || !replyHasMore) return;
    replyLoadingMore = true;
    try {
      const next = replyPage + 1;
      const d = await getReplies(aid, { pn: next, ps: 20, sort: 2 });
      const more = (d && d.replies) ? d.replies : [];
      if (more.length) {
        replies = replies.concat(more);
        replyPage = next;
        replyHasMore = more.length >= 20;
      } else {
        replyHasMore = false;
      }
    } catch (e) {
      replyError = e.message || '加载失败';
    } finally {
      replyLoadingMore = false;
    }
  }

  onMount(() => {
    const hash = location.hash || '';
    const bm = /[?&]bvid=([^&]+)/.exec(hash);
    const am = /[?&]aid=([^&]+)/.exec(hash);
    bvid = bm ? decodeURIComponent(bm[1]) : '';
    aid = am ? decodeURIComponent(am[1]) : '';

    setSoftkeys('刷新', commentHint || '选择', '更多');
    loadReplies();

    return onKey('listen-comments', {
      Down: () => moveFocus(+1),
      Up: () => moveFocus(-1)
    }, {
      softkeys: true,
      menu: () => buildAppMenu([{ label: '回到听视频', action: () => history.back() }])
    });
  });
</script>

<div class="screen">
  <div class="main scroll-y" data-nav-root>
    <div class="head">评论</div>
    <CommentSection
      comments={replies}
      commentsLoading={replyLoading}
      commentsError={replyError}
      commentHasMore={replyHasMore}
      oid={aid}
      emptyMessage="还没有评论"
      on:focuschange={(/** @type {any} */ e) => {
        commentHint = (e.detail && e.detail.hint) ? e.detail.hint : '';
        setSoftkeys('刷新', commentHint || '选择', '更多');
      }}
      on:loadMore={loadMoreReplies}
    />
  </div>
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .main {
    flex: 1;
    min-height: 0;
    background: var(--md-sys-color-surface-bright);
  }

  .head {
    padding: 8px 8px 4px;
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    color: var(--md-sys-color-on-surface);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
</style>
