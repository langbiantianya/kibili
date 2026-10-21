<script>
  import { onMount, tick } from 'svelte';
  import { onKey, moveFocus } from '../keyboard/index.js';
  import { setSoftkeys, showToast } from '../stores/ui.js';
  import Loading from '../components/Loading.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import CommentSection from '../components/CommentSection.svelte';
  import { getDynamicDetail, parseDynamicItem } from '../api/dynamic.js';
  import { getReplies } from '../api/interact.js';
  import { formatCount, stripHtml } from '../utils/format.js';
  import { biliImg } from '../utils/platform.js';
  import { navigate } from '../router/index.js';

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

  // 评论列表里中键的提示 (展开/收起/更多), 由 CommentSection 报上来
  let commentHint = '';
  let commentInList = false;   // 焦点是不是在评论列表里

  // 解析动态详情数据
  //
  // 动态类型有十几种 (视频/图片/图文/专栏/合集/剧集/转发/直播/一般类型/失效…),
  // 字段位置各不相同 —— 统一解析在 api/dynamic.js 的 parseDynamicItem 里做,
  // 这里只管渲染。
  function parseDetail(data) {
    if (!data || !data.item) return null;
    return parseDynamicItem(data.item);
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
      detail = parseDetail(data);
      if (!detail) {
        detailError = '动态不存在或已失效';
      }
    } catch (e) {
      console.error('[DynamicDetail] getDynamicDetail error:', e);
      detailError = e.message || '加载失败';
    } finally {
      detailLoading = false;
    }
    // 有图就把焦点放到第一张图上 ——
    // 不然 D-pad 够不着图片 (详情 tab 的上下键默认是滚动), 用户没法选图
    await focusFirstImage();
  }

  /**
   * 焦点是不是在图片列表里
   *
   * 详情 tab 的上下键: 焦点在图片列表里 → 在图片之间移动;
   * 不在 → 滚动正文。
   */
  function focusInImageList() {
    const el = document.activeElement;
    return !!(el && el.closest && el.closest('.image-list'));
  }

  /**
   * 焦点落到第一张图上 (有图才做)
   */
  async function focusFirstImage() {
    await tick();
    const el = document.querySelector('.image-item');
    if (el && el.focus) el.focus();
  }

  /**
   * 评论对象 (oid/type)
   *
   * 评论挂在哪个对象上取决于动态类型:
   *   视频 → 视频 aid, 图片 → 相册 id, 图文/转发/纯文字 → 动态本身 id,
   *   专栏 → cv 号, 音频 → au 号, 收藏夹 → 收藏夹 id
   * 以前这里固定用视频 bvid, 非视频动态一律报"没有可评论的视频"。
   */
  $: commentOid = detail && detail.comment ? detail.comment.oid : '';
  $: commentType = detail && detail.comment ? detail.comment.type : 0;

  async function loadComments(isLoadMore = false) {
    if (!commentOid) {
      commentsError = '该动态暂不支持评论';
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
      const data = await getReplies(commentOid, { pn: commentPage, ps: 20, sort: 2, type: commentType });
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
    // 离开评论 tab 时清掉中键提示, 免得回来还显示上次的文案
    if (i !== 1) {
      commentHint = '';
      commentInList = false;
    }
    // 详情 tab 的中键提示也跟焦点走 —— 切 tab 时焦点不在详情内容里,
    // 提示要重置, 不然会显示上一个 tab 的"查看/播放"
    if (i !== 0) {
      focusKind = '';
      focusHint = '';
    } else {
      // 切回详情 tab: 评论列表被销毁, 焦点没了 —— 重新落到第一张图上,
      // 不然中键既没提示也没反应 (图片的点击要靠焦点触发)
      focusFirstImage();
    }
    if (i === 1 && comments.length === 0 && !commentsLoading) {
      loadComments();
    }
  }

  function openArchiveVideo() {
    if (detail && detail.major && detail.major.bvid) {
      navigate('/player?bvid=' + detail.major.bvid);
    }
  }

  // 转发动态里原动态是视频时, 点原视频卡片也能播
  function openOrigVideo() {
    if (detail && detail.orig && detail.orig.major && detail.orig.major.bvid) {
      navigate('/player?bvid=' + detail.orig.major.bvid);
    }
  }

  // ── 图片全屏查看 ─────────────────────────────────────────────────────
  // 图片数组通过 URL 参数传给图片查看器 (imgs=<编码后的 JSON>&i=<序号>)
  //
  // URL 有长度上限, 图特别多时整个数组塞不进去 —— 这种就不跳了,
  // 免得跳过去是个空页面。
  const MAX_URL_LEN = 6000;

  /**
   * 打开图片查看器
   *
   * @param {any[]} list 图片数组 (解析后的 { src, width, height })
   * @param {number} index 从第几张开始看
   */
  function openImages(list, index) {
    if (!list || !list.length) return;
    const urls = [];
    let realIndex = 0;
    for (let i = 0; i < list.length; i++) {
      const u = list[i] && list[i].src;
      if (!u) continue;
      // 只留有地址的图, 序号要跟着过滤后的数组走 (不然会错位)
      if (i === index) realIndex = urls.length;
      urls.push(u);
    }
    if (!urls.length) return;
    const q = 'imgs=' + encodeURIComponent(JSON.stringify(urls)) + '&i=' + realIndex;
    if (q.length > MAX_URL_LEN) {
      showToast('图片太多, 暂时打不开大图');
      return;
    }
    navigate('/image-viewer?' + q);
  }

  /**
   * 这条动态能不能用中键直接播视频
   *
   * 两种情况:
   *   - 视频动态本身 (major.kind === 'video')
   *   - 转发动态, 原动态是视频 (orig.major.kind === 'video')
   *
   * 没有视频可播就返回空串 —— 中键不显示提示 (没绑定的键不显示文案)。
   */
  $: playBvid = detail
    ? ((detail.major && detail.major.kind === 'video' && detail.major.bvid) ||
       (detail.orig && detail.orig.major && detail.orig.major.kind === 'video' && detail.orig.major.bvid) ||
       '')
    : '';

  // 中键: 播视频 (视频动态, 或转发的原动态是视频)
  function playVideo() {
    if (!playBvid) return;
    navigate('/player?bvid=' + playBvid);
  }

  // ── 焦点与中键提示 ───────────────────────────────────────────────────
  // 详情 tab 里可聚焦的东西有好几样, 中键做的事不一样:
  //   视频卡片 → 播视频;  图片 → 进图片查看器
  // 所以中键提示要跟着焦点走 (文案必须和行为一致)。
  //
  // focusKind: 'image' = 焦点在图片上, 'video' = 在视频卡片上, '' = 别的
  let focusKind = '';
  let focusHint = '';

  /**
   * @param {string} kind 'image' / 'video' / ''
   * @param {string} hint 中键提示文案
   */
  function onFocusChange(kind, hint) {
    focusKind = kind;
    focusHint = hint;
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

  onMount(() => {
    loadDetail();
    // onKey() 返回自己的注销函数, 直接交给 onMount 的返回值 → 组件销毁时
    // 只移除"本实例"注册的作用域 (同名实例之间不会互相踩)
    // 按键名用规范名: Up / Down / Left / Right
    return onKey('dynamic-detail', {
      Down: () => {
        if (activeTab === 0) {
          // 焦点在图片列表里 → 上下键在图片之间移动 (选图)
          if (focusInImageList()) {
            const moved = moveFocus(+1);
            if (moved) return;
          }
          scrollDetail(+1);
        } else {
          const moved = moveFocus(+1);
          if (!moved) scrollComments(+1);
        }
      },
      Up: () => {
        if (activeTab === 0) {
          if (focusInImageList()) {
            const moved = moveFocus(-1);
            if (moved) return;
          }
          scrollDetail(-1);
        } else {
          const moved = moveFocus(-1);
          if (!moved) scrollComments(-1);
        }
      },
      Left: () => { if (activeTab > 0) changeTab(activeTab - 1); },
      Right: () => { if (activeTab < tabs.length - 1) changeTab(activeTab + 1); },
      // 中键: 焦点在图片上 → 进图片查看器 (返回 false, 交给框架默认的
      // "激活当前焦点", 由图片自己的 on:click 处理);
      // 焦点在视频卡片上 (或者没落在任何东西上) → 播视频。
      // 评论 tab 里中键归评论项 (评论项是可聚焦的, 走框架默认行为)
      Enter: () => {
        if (activeTab !== 0) return false;
        if (focusKind === 'image') return false;
        if (!playBvid) return false;
        playVideo();
      },
      SoftLeft: () => {
        // 详情 tab: 切到评论; 评论 tab: 回复功能下线 (软键显示「待实现」)
        if (activeTab === 0) {
          changeTab(1);
        } else {
          showToast('评论回复功能待实现');
        }
      },
      '0': () => changeTab(activeTab === 0 ? 1 : 0),
    }, { softkeys: true });
  });

  // 评论列表里焦点变了 → 中键提示跟着变 (文案必须和行为一致)
  function onCommentFocusChange(e) {
    commentHint = (e.detail && e.detail.hint) ? e.detail.hint : '';
    commentInList = !!(e.detail && e.detail.inList);
  }

  // 软键是唯一来源: 切 tab 时更新 (左=评论/待实现; 返回走退格键, 右软键不占)
  // 初始 activeTab = 0, 这段响应式语句在首次渲染时就会跑, 所以 onMount 里
  // 不再重复设置一遍软键, 避免两处设置互相覆盖。
  //
  // 中键 (center) 提示:
  //   详情 tab: 焦点在图片上 → "查看"; 焦点在视频卡片上 → "播放";
  //            焦点不在这些东西上 → 有视频可播就 "播放", 没有就不显示
  //            (没绑定的键不显示文案)
  //   评论 tab: 焦点在评论上 → "展开"/"收起"; 焦点不在评论上 → 不显示
  $: if (activeTab === 0) {
    setSoftkeys('评论', '', focusHint || (playBvid ? '播放' : ''));
  } else {
    setSoftkeys('待实现', '', commentInList ? commentHint : '');
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
        <div class="detail-content scroll-y" data-nav-root>
          <!-- 作者信息 -->
          <div class="author-row">
            {#if detail.author.face}
              <img class="author-face" src={biliImg(detail.author.face, 40, 40)} alt="" />
            {/if}
            <div class="author-info">
              <div class="author-name">{detail.author.name}</div>
              <div class="author-action">{detail.author.pub_action ? detail.author.pub_action + ' · ' : ''}{detail.author.pub_time}</div>
            </div>
          </div>

          <!-- 动态内容 -->
          {#if detail.content}
            <div class="content-text">{stripHtml(detail.content)}</div>
          {/if}

          <!-- 主体 (按动态类型渲染) -->
          {#if detail.major}
            {#if detail.major.kind === 'video'}
              <!-- 视频: 点一下去播放器 -->
              <div class="archive-card" data-navable tabindex="0"
                   on:click={() => openArchiveVideo()}
                   on:focus={() => onFocusChange('video', '播放')}>
                <img class="archive-cover" src={biliImg(detail.major.cover, 120, 80)} alt="" />
                <div class="archive-info">
                  <div class="archive-title">{detail.major.title}</div>
                  {#if detail.major.duration}<span class="archive-dur">{detail.major.duration}</span>{/if}
                </div>
              </div>
            {:else if detail.major.kind === 'images'}
              <!-- 带图动态: 中键进大图看 -->
              <div class="image-list">
                {#each detail.major.images as img, i}
                  <div class="image-item" data-navable tabindex="0"
                       on:click={() => openImages(detail.major.images, i)}
                       on:focus={() => onFocusChange('image', '查看')}>
                    <img src={biliImg(img.src, 240, 0)} alt="" />
                  </div>
                {/each}
              </div>
            {:else if detail.major.kind === 'opus'}
              <!-- 图文动态: 标题 + 正文 + 图片 -->
              {#if detail.major.title}<div class="major-title">{detail.major.title}</div>{/if}
              {#if detail.major.text}<div class="content-text">{stripHtml(detail.major.text)}</div>{/if}
              {#if detail.major.images.length}
                <div class="image-list">
                  {#each detail.major.images as img, i}
                    <div class="image-item" data-navable tabindex="0"
                         on:click={() => openImages(detail.major.images, i)}
                         on:focus={() => onFocusChange('image', '查看')}>
                      <img src={biliImg(img.src, 240, 0)} alt="" />
                    </div>
                  {/each}
                </div>
              {/if}
            {:else if detail.major.kind === 'forward'}
              <!-- 转发: 原作者 + 原文本 + 原主体 -->
              <div class="forward-box">
                <div class="forward-label">转发动态</div>
                {#if detail.orig}
                  {#if detail.orig.author.name}
                    <div class="forward-author">{detail.orig.author.name}</div>
                  {/if}
                  {#if detail.orig.content}
                    <div class="forward-text">{stripHtml(detail.orig.content)}</div>
                  {/if}
                  {#if detail.orig.major}
                    {#if detail.orig.major.kind === 'video'}
                      <!-- 原动态是视频: 也能点进去播 -->
                      <div class="archive-card" data-navable tabindex="0"
                           on:click={() => openOrigVideo()}
                           on:focus={() => onFocusChange('video', '播放')}>
                        <img class="archive-cover" src={biliImg(detail.orig.major.cover, 120, 80)} alt="" />
                        <div class="archive-info">
                          <div class="archive-title">{detail.orig.major.title}</div>
                          {#if detail.orig.major.duration}<span class="archive-dur">{detail.orig.major.duration}</span>{/if}
                        </div>
                      </div>
                    {:else if detail.orig.major.kind === 'opus'}
                      {#if detail.orig.major.title}<div class="major-title">{detail.orig.major.title}</div>{/if}
                      {#if detail.orig.major.text}<div class="content-text">{stripHtml(detail.orig.major.text)}</div>{/if}
                      {#if detail.orig.major.images.length}
                        <div class="image-list">
                          {#each detail.orig.major.images as img, i}
                            <div class="image-item" data-navable tabindex="0"
                                 on:click={() => openImages(detail.orig.major.images, i)}
                                 on:focus={() => onFocusChange('image', '查看')}>
                              <img src={biliImg(img.src, 240, 0)} alt="" />
                            </div>
                          {/each}
                        </div>
                      {/if}
                    {:else if detail.orig.major.kind === 'images'}
                      <div class="image-list">
                        {#each detail.orig.major.images as img, i}
                          <div class="image-item" data-navable tabindex="0"
                               on:click={() => openImages(detail.orig.major.images, i)}
                               on:focus={() => onFocusChange('image', '查看')}>
                            <img src={biliImg(img.src, 240, 0)} alt="" />
                          </div>
                        {/each}
                      </div>
                    {:else if detail.orig.major.kind === 'invalid'}
                      <div class="tip-box">原动态已失效</div>
                    {:else}
                      {#if detail.orig.major.title}<div class="major-title">{detail.orig.major.title}</div>{/if}
                      {#if detail.orig.major.cover}
                        <img class="major-cover" src={biliImg(detail.orig.major.cover, 160, 100)} alt="" />
                      {/if}
                    {/if}
                  {/if}
                {:else}
                  <div class="tip-box">原动态不可见</div>
                {/if}
              </div>
            {:else if detail.major.kind === 'invalid'}
              <div class="tip-box">{detail.major.desc || '该动态已失效'}</div>
            {:else if detail.major.kind === 'unknown'}
              <div class="tip-box">暂不支持的动态类型 ({detail.major.type})</div>
            {:else}
              <!-- 专栏 / 合集 / 剧集 / 一般类型 / 直播 / 音频 / 课程 -->
              {#if detail.major.title}<div class="major-title">{detail.major.title}</div>{/if}
              {#if detail.major.badge}<div class="major-badge">{detail.major.badge}</div>{/if}
              {#if detail.major.text}<div class="content-text">{stripHtml(detail.major.text)}</div>{/if}
              {#if detail.major.cover}
                <img class="major-cover" src={biliImg(detail.major.cover, 160, 100)} alt="" />
              {/if}
              {#if detail.major.label}<div class="major-label">{detail.major.label}</div>{/if}
            {/if}
          {/if}

          <!-- 相关内容卡片 (游戏 / 商品 / 预约 / 投票 / 视频跳转) -->
          {#if detail.additional && (detail.additional.title || detail.additional.desc)}
            <div class="additional-card">
              {#if detail.additional.cover}
                <img class="additional-cover" src={biliImg(detail.additional.cover, 60, 60)} alt="" />
              {/if}
              <div class="additional-info">
                {#if detail.additional.label}<div class="additional-label">{detail.additional.label}</div>{/if}
                {#if detail.additional.title}<div class="additional-title">{detail.additional.title}</div>{/if}
                {#if detail.additional.desc}<div class="additional-desc">{detail.additional.desc}</div>{/if}
              </div>
            </div>
          {/if}

          <!-- 统计数据 -->
          <div class="stat-row">
            <span class="stat-item">❤ {formatCount(detail.stat.like)}</span>
            <span class="stat-item">↗ {formatCount(detail.stat.forward)}</span>
            <span class="stat-item">❝ {formatCount(detail.stat.comment)}</span>
            <span class="stat-item">▶ {formatCount(detail.stat.view)}</span>
          </div>
        </div>
      {:else}
        <EmptyState message="暂无数据" />
      {/if}
    {:else}
      <!-- 评论 Tab -->
      <CommentSection
        comments={comments}
        commentsLoading={commentsLoading}
        commentsError={commentsError}
        commentHasMore={commentHasMore}
        oid={commentOid}
        commentType={commentType}
        on:focuschange={onCommentFocusChange}
        on:loadMore={() => loadComments(true)}
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
    /* Gecko 48 不支持 -webkit-line-clamp, max-height 兜底 (2 行) */
    max-height: 2.6em;
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

  /* ---- 各种动态主体的通用样式 ---- */

  /*
    图片列表 (带图动态 / 图文动态): 一行一张
    高度要**限住** —— 屏幕只有 240x320, 详情页去掉软键栏(28)和 tab 栏(32)
    只剩 260 高, 满宽的竖图 (2:3) 有 336 高, 一屏放不下, 看着像被截断了。
    限高之后整张图一屏能看全, 想看细节按中键进大图。
  */
  .image-list {
    display: block;
  }
  .image-list img {
    max-width: 100%;
    max-height: 250px;
    width: auto;
    height: auto;
    display: inline-block;
    vertical-align: top;
    border-radius: var(--md-sys-shape-corner-small);
  }
  /* 图片外面那层: 可聚焦, 中键进大图看 */
  .image-item {
    margin-bottom: 4px;
    text-align: center;
    cursor: pointer;
    outline: none;
  }
  .image-item:focus img {
    outline: 2px solid var(--md-sys-color-primary);
  }

  /* 标题 (图文/专栏/合集/剧集…) */
  .major-title {
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    color: var(--md-sys-color-on-surface);
    line-height: 1.35;
  }

  /* 角标 (番剧/合集的角标文案) */
  .major-badge {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-primary);
  }

  /* 副标题 (专栏阅读量等) */
  .major-label {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }

  /* 相关内容卡片 (游戏/商品/预约/投票) */
  .additional-card {
    display: flex;
    padding: 6px;
    background: var(--md-sys-color-surface-container-low);
    border-radius: var(--md-sys-shape-corner-small);
  }
  .additional-card .additional-cover {
    margin-right: 6px;
  }
  .additional-cover {
    width: 40px;
    height: 40px;
    object-fit: cover;
    border-radius: var(--md-sys-shape-corner-small);
    flex-shrink: 0;
  }
  .additional-info {
    flex: 1;
    min-width: 0;
  }
  .additional-label {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .additional-title {
    font-size: var(--md-sys-typescale-body-medium-size);
    color: var(--md-sys-color-on-surface);
    font-weight: var(--md-sys-typescale-label-medium-weight);
  }
  .additional-desc {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    line-height: 1.3;
  }

  /* 封面 (专栏/合集/剧集/一般类型) */
  .major-cover {
    width: 160px;
    height: 100px;
    object-fit: cover;
    border-radius: var(--md-sys-shape-corner-small);
    align-self: flex-start;
  }

  /* 转发 */
  .forward-box {
    padding: 8px;
    background: var(--md-sys-color-surface-container-low);
    border-radius: var(--md-sys-shape-corner-small);
    border-left: 2px solid var(--md-sys-color-outline);
  }
  .forward-label {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    margin-bottom: 4px;
  }
  .forward-author {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-primary);
    margin-bottom: 2px;
  }
  .forward-text {
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface);
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-all;
    margin-bottom: 4px;
  }

  /* 提示 (失效/不支持) */
  .tip-box {
    padding: 10px;
    text-align: center;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    background: var(--md-sys-color-surface-container-low);
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
