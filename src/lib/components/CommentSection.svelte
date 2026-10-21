<script>
  // 评论列表 (视频页 / 动态详情页共用)
  //
  // ── 评论层级 ────────────────────────────────────────────────────────
  // B 站的评论是对话树:
  //   一级评论 → 二级评论(回复一级) → 三级评论(回复二级) → …
  // 一级评论列表接口 (GET /x/v2/reply) 只返回一级评论, 每条带 rcount
  // (子评论条数) 和 parent (回复父评论 rpid, 一级为 0)。
  //
  // 子评论接口 (GET /x/v2/reply/reply?root=<根评论rpid>) 一次就能拿回整棵
  // 子树 (data.replies 可能是平铺的, 也可能是嵌套的, 见 utils/commenttree.js),
  // 这里按 parent 字段建树后按层级缩进打平渲染。
  //
  // 展开/收起状态**只存在这里** —— 之前播放器自己也存了一份, 两份状态
  // 互不相通, 结果是"按了中键没反应" (状态改了但渲染的是另一份)。
  //
  // ── 关于回复 ────────────────────────────────────────────────────────
  // 评论回复功能暂时下线 (软键显示「待实现」)。这里只保留评论的**浏览**:
  // 中键 = 展开/收起当前评论的子评论。

  import { createEventDispatcher } from 'svelte';
  import { getSubReplies } from '../api/interact.js';
  import { buildCommentTree } from '../utils/commenttree.js';
  import { formatCount, relativeTime } from '../utils/format.js';
  import { biliImg } from '../utils/platform.js';
  import LoadingMore from './LoadingMore.svelte';

  // ========== Props ==========
  /** @type {any[]} */
  export let comments = [];
  export let commentsLoading = false;
  export let commentsError = '';
  export let commentHasMore = true;
  /** @type {string|number} */
  export let oid = ''; // 评论对象ID (视频 aid / 相册 id / 动态 id …)
  /**
   * 评论对象类型 (对应 /x/v2/reply 的 type)
   * 1=视频(默认) / 11=相册 / 12=专栏 / 14=音频 / 17=动态 / 19=收藏夹
   * 动态详情页的评论对象随动态类型变, 见 api/dynamic.js 的 DYNAMIC_COMMENT_TYPE
   */
  export let commentType = 1;
  /** @type {string} */
  export let emptyMessage = '暂无评论';

  // ========== 内部状态 ==========
  // 子评论状态: 根评论 rpid → {
  //   expanded 是否展开 / loading 是否在加载 / error 加载失败原因
  //   raw 接口返回的原始列表 (分页时累加) / items 建好树的条目 / total 总条数
  // }
  /** @type {Record<string, any>} */
  let subMap = {};

  const dispatch = createEventDispatcher();

  // 子评论分页: 一页最多 20 条 (接口硬上限), 更多要点「更多回复」
  const SUB_PAGE_SIZE = 20;

  // ========== 子评论 ==========

  /**
   * 展开/收起某条一级评论的子评论
   *
   * @param {any} c 一级评论
   */
  async function toggleSub(c) {
    if (!c || !c.rcount) return;
    const rpid = String(c.rpid);
    const cur = subMap[rpid];

    // 已展开 → 收起
    if (cur && cur.expanded) {
      subMap[rpid] = { ...cur, expanded: false };
      subMap = subMap;
      notifyHint(c);
      return;
    }
    // 已经加载过 → 直接展开 (不再发请求)
    if (cur && cur.raw && cur.raw.length) {
      subMap[rpid] = { ...cur, expanded: true };
      subMap = subMap;
      notifyHint(c);
      return;
    }

    // 首次加载
    subMap[rpid] = { expanded: true, loading: true, error: '', raw: [], items: [], total: 0, page: 1 };
    subMap = subMap;
    notifyHint(c);
    await fetchSub(c, 1, true);
  }

  /**
   * 拉子评论
   *
   * @param {any} c 一级评论
   * @param {number} pn 页码
   * @param {boolean} reset 是否从头开始 (清掉旧数据)
   */
  async function fetchSub(c, pn, reset) {
    const rpid = String(c.rpid);
    try {
      const data = await getSubReplies(oid, c.rpid, { pn: pn, ps: SUB_PAGE_SIZE, type: commentType });
      const list = (data && data.replies) ? data.replies : [];
      const page = data && data.page ? data.page : null;
      // 总条数: 接口的 page.count 和一级评论上的 rcount 取大的那个 ——
      // 两个字段的口径不完全一致 (一个可能只算直属回复), 取大不会漏
      const count = (page && page.count) ? page.count : 0;
      const total = Math.max(count, c.rcount || 0);

      const cur = subMap[rpid] || {};
      // 分页时可能有重叠条目, 按 rpid 去重 (重复的 key 会让 svelte 的 each 报错)
      const raw = [];
      const seen = {};
      const all = reset ? list : (cur.raw || []).concat(list);
      for (let i = 0; i < all.length; i++) {
        const n = all[i];
        if (!n || !n.rpid || seen[n.rpid]) continue;
        seen[n.rpid] = true;
        raw.push(n);
      }
      const items = buildCommentTree(raw, c.rpid, c.member ? c.member.uname : '');

      subMap[rpid] = {
        // 用当前状态里的 expanded: 加载期间用户又点了一下收起的话, 别给弹回来
        expanded: cur.expanded !== false,
        loading: false,
        error: '',
        raw: raw,
        items: items,
        total: total,
        page: pn
      };
    } catch (e) {
      const cur = subMap[rpid] || {};
      subMap[rpid] = {
        ...cur,
        expanded: false,
        loading: false,
        error: (e && e.message) ? e.message : '回复加载失败'
      };
    }
    subMap = subMap;
  }

  /**
   * 加载更多子评论 (接口一页最多 20 条)
   *
   * @param {any} c 一级评论
   */
  async function loadMoreSub(c) {
    const rpid = String(c.rpid);
    const cur = subMap[rpid];
    if (!cur || cur.loading) return;
    subMap[rpid] = { ...cur, loading: true, error: '' };
    subMap = subMap;
    await fetchSub(c, (cur.page || 1) + 1, false);
  }

  /**
   * 还能不能继续加载更多子评论
   *
   * @param {any} sub
   * @returns {boolean}
   */
  function hasMoreSub(sub) {
    if (!sub || !sub.items) return false;
    const total = sub.total || 0;
    return total > sub.items.length;
  }

  // ========== 中键提示 ==========
  // 评论列表里的中键 = 展开/收起当前评论的子评论。
  // 提示文案跟着焦点走, 页面拿它显示软键栏中间那格 (文案必须和行为一致)。

  /**
   * @param {any} c
   * @returns {string} 展开 / 收起 / ''
   */
  function hintFor(c) {
    if (!c || !c.rcount) return '';
    const sub = subMap[String(c.rpid)];
    return sub && sub.expanded ? '收起' : '展开';
  }

  /**
   * @param {any} c
   */
  function notifyHint(c) {
    // inList: 焦点在评论列表里 —— 页面据此决定中键提示
    // (列表里中键是"激活当前焦点", 不是播放/暂停)
    dispatch('focuschange', { hint: hintFor(c), inList: true });
  }

  /**
   * 焦点落到一条一级评论上
   * @param {any} c
   */
  function onCommentFocus(c) {
    notifyHint(c);
  }

  // 处理加载更多评论
  function loadMore() {
    dispatch('loadMore');
  }
</script>

<div class="comment-section">
  {#if comments.length === 0 && !commentsLoading}
    <div class="empty-state">
      <span class="empty-text">{commentsError || emptyMessage}</span>
    </div>
  {:else}
    <div class="comment-list scroll-y" data-nav-root>
      {#each comments as c (c.rpid)}
        {#each [subMap[String(c.rpid)]] as sub}
          <div class="comment-group">
            <!-- 一级评论: 中键/点击 = 展开或收起它的子评论 -->
            <div class="comment-item" data-navable tabindex="0" data-rpid={c.rpid}
                 on:click={() => toggleSub(c)}
                 on:focus={() => onCommentFocus(c)}>
              <div class="comment-head">
                <img class="comment-face" src={biliImg(c.member.face, 32, 32)} alt="" />
                <span class="comment-name">{c.member.uname}</span>
                <span class="comment-time">{relativeTime(c.ctime)}</span>
              </div>
              <div class="comment-content">{c.content.message}</div>
              <div class="comment-stat">
                <span>❤ {formatCount(c.like)}</span>
                {#if c.rcount > 0}
                  <span class="sub-toggle" class:expanded={sub && sub.expanded}>
                    {sub && sub.expanded ? '▾' : '▸'} {formatCount(c.rcount)} 条回复
                  </span>
                {/if}
              </div>
            </div>

            <!-- 子评论: 按对话层级缩进打平 -->
            {#if sub && sub.loading && !sub.items.length}
              <div class="sub-loading">
                <div class="spinner-small"></div>
                <span>加载回复...</span>
              </div>
            {:else if sub && sub.error}
              <div class="sub-error">回复加载失败, 再按一次中键重试</div>
            {:else if sub && sub.items && sub.items.length}
              {#each sub.items as row (row.node.rpid)}
                <!-- 层级最多缩到 3 层 (240px 宽的屏幕缩太多正文就没地方了) -->
                <div class="sub-item depth-{Math.min(row.depth, 3)}" data-navable tabindex="0"
                     data-rpid={row.node.rpid}
                     on:focus={() => dispatch('focuschange', { hint: '', inList: true })}>
                  <div class="comment-head">
                    <img class="comment-face" src={biliImg(row.node.member.face, 24, 24)} alt="" />
                    <span class="comment-name">{row.node.member.uname}</span>
                    {#if row.replyName}
                      <span class="reply-to">回复 @{row.replyName}</span>
                    {/if}
                    <span class="comment-time">{relativeTime(row.node.ctime)}</span>
                  </div>
                  <div class="comment-content">{row.node.content.message}</div>
                  <div class="comment-stat">
                    <span>❤ {formatCount(row.node.like)}</span>
                  </div>
                </div>
              {/each}
              {#if hasMoreSub(sub)}
                <div class="sub-more" data-navable tabindex="0"
                     on:click={() => loadMoreSub(c)}
                     on:focus={() => dispatch('focuschange', { hint: '更多', inList: true })}>
                  {sub.loading ? '加载中...' : `还有 ${formatCount(sub.total - sub.items.length)} 条回复, 按中键继续加载`}
                </div>
              {/if}
            {/if}
          </div>
        {/each}
      {/each}
      {#if commentsLoading}
        <LoadingMore />
      {:else if commentHasMore}
        <div class="load-more" data-navable tabindex="0"
             on:click={() => loadMore()}
             on:focus={() => dispatch('focuschange', { hint: '更多', inList: true })}>
          加载更多评论
        </div>
      {:else if comments.length > 0}
        <div class="no-more">没有更多评论了</div>
      {/if}
    </div>
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

  /* 一条评论 + 它的子评论算一组 */
  .comment-group {
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
  }
  .comment-group:last-child {
    border-bottom: none;
  }

  .comment-item {
    padding: 8px 0;
    -webkit-transition: background 0.15s ease;
    transition: background 0.15s ease;
    cursor: pointer;
    outline: none;
  }
  .comment-item:focus,
  .comment-item:hover {
    background: var(--md-sys-color-surface-container-high);
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
    -ms-flex-negative: 0;
    flex-shrink: 0;
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
  .sub-toggle.expanded {
    color: var(--md-sys-color-primary);
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

  .sub-error {
    margin-left: 30px;
    padding: 4px 0;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-error);
  }

  .sub-item {
    padding: 6px 0;
    -webkit-transition: background 0.15s ease;
    transition: background 0.15s ease;
    cursor: pointer;
    outline: none;
  }
  .sub-item:focus,
  .sub-item:hover {
    background: var(--md-sys-color-surface-container-high);
  }

  /*
    层级缩进: 每往下一层往里缩 12px, 最多缩到第 3 层。
    240px 宽的屏幕缩太多正文就没地方了 —— 缩进用 padding-left 而不是
    margin-left (margin 会在 flex 布局里算宽度)。
    depth 0 = 根评论的直属回复, 1 = 回复二级, 2 = 回复三级, 3+ 统一按 3 显示。
  */
  .sub-item {
    padding-left: 30px;
  }
  .sub-item.depth-1 {
    padding-left: 42px;
  }
  .sub-item.depth-2 {
    padding-left: 54px;
  }
  .sub-item.depth-3 {
    padding-left: 54px;
  }

  .sub-more {
    margin-left: 30px;
    padding: 6px 0;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-primary);
    cursor: pointer;
    outline: none;
  }
  .sub-more:focus {
    background: var(--md-sys-color-surface-container-high);
  }

  .reply-to {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
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

  .load-more {
    text-align: center;
    padding: 10px;
    margin: 6px 0 10px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-primary);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-small);
  }
  .load-more:focus {
    background: var(--md-sys-color-surface-container-high);
    outline: 1px solid var(--md-sys-color-primary);
  }
</style>
