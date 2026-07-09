<script>
  import { onMount, onDestroy } from 'svelte';
  import { isLogin, user } from '../stores/user.js';
  import { getDynamicNew, getDynamicHistory, getDynamicAll, extractArchive, extractAuthor } from '../api/dynamic.js';
  import { queue } from '../stores/queue.js';
  import { navigate } from '../router/index.js';
  import { onKey, offKey, moveFocus } from '../keyboard/index.js';
  import { setSoftkeys, showToast } from '../stores/ui.js';
  import TabBar from '../components/TabBar.svelte';
  import FeedList from '../components/FeedList.svelte';
  import Loading from '../components/Loading.svelte';
  import LoadingMore from '../components/LoadingMore.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { stripHtml, relativeTime, formatCount } from '../utils/format.js';
  import { biliImg } from '../utils/platform.js';

  const tabs = [
    { key: 'video',   label: '视频' },
    { key: 'dynamic', label: '动态' }
  ];
  let activeTab = 0;

  // 视频流 (来自关注动态, 过滤 video)
  /** @type {any[]} */
  let videos = [];
  let videoLoading = false;
  let videoLoadingMore = false;
  let videoError = '';

  // 动态流 (含文字 / 图片 / 视频)
  let dynamics = [];
  let dynLoading = false;
  let dynLoadingMore = false;
  let dynError = '';

  // 视频分页
  let videoOffset = '';
  let videoHasMore = true;

  // 动态分页
  let dynOffset = '';
  let dynHasMore = true;

  async function loadVideos(isLoadMore = false) {
    if (!$isLogin) {
      videoError = '请先登录';
      return;
    }
    if (videoLoading || videoLoadingMore || !videoHasMore) return;
    if (isLoadMore) videoLoadingMore = true;
    else videoLoading = true;
    videoError = '';
    try {
      const { getDynamicAll } = await import('../api/dynamic.js');
      const d = await getDynamicAll({ type: 'video', offset: videoOffset });
      const items = (d && d.items) ? d.items : [];
      if (items.length) {
        const newVideos = items.map(it => {
          const v = extractArchive(it);
          if (!v) return null;
          const author = extractAuthor(it);
          const moduleStat = it.modules && it.modules.module_stat;
          return {
            bvid: v.bvid,
            cid: v.cid,
            aid: v.aid,
            title: v.title,
            pic: v.pic,
            owner: author,
            duration: v.duration,
            stat: v.stat,
            // 动态统计数据: like/forward/comment
            moduleStat: moduleStat ? {
              like: moduleStat.like ? moduleStat.like.count : 0,
              likeStatus: moduleStat.like ? moduleStat.like.status : false,
              forward: moduleStat.forward ? moduleStat.forward.count : 0,
              comment: moduleStat.comment ? moduleStat.comment.count : 0
            } : null
          };
        }).filter(Boolean);
        videos = videos.concat(newVideos);
        videoHasMore = d.has_more !== false;
        videoOffset = d.offset || '';
      } else {
        videoHasMore = false;
      }
    } catch (e) {
      videoError = e.message || '加载失败';
    } finally {
      videoLoading = false;
      videoLoadingMore = false;
    }
  }

  async function loadDynamics(isLoadMore = false) {
    if (!$isLogin) {
      dynError = '请先登录';
      return;
    }
    if (dynLoading || dynLoadingMore || !dynHasMore) return;
    if (isLoadMore) dynLoadingMore = true;
    else dynLoading = true;
    dynError = '';
    try {
      // 使用 web 端新协议 (和 video Tab 一致), 确保 ID 格式兼容 getDynamicDetail
      const { getDynamicAll } = await import('../api/dynamic.js');
      const d = await getDynamicAll({ type: 'all', offset: dynOffset });
      const items = (d && d.items) ? d.items : [];
      if (items.length) {
        dynamics = dynamics.concat(items);
        dynHasMore = d.has_more !== false;
        dynOffset = d.offset || '';
      } else {
        dynHasMore = false;
      }
    } catch (e) {
      dynError = e.message || '加载失败';
    } finally {
      dynLoading = false;
      dynLoadingMore = false;
    }
  }

  // 滚动到末尾时加载更多
  function onMoveFocus(delta) {
    const moved = moveFocus(delta);
    if (!moved && delta > 0) {
      // 向下滚动到末尾, 加载下一页
      if (activeTab === 0) loadVideos(true);
      else loadDynamics(true);
    }
    return moved;
  }

  // 解析 card JSON 字符串
  function parseCard(s) {
    if (typeof s === 'string') {
      try { return JSON.parse(s); } catch (e) { return null; }
    }
    return s;
  }

  // 动态文字 (兼容新旧协议)
  // 新协议文字来源优先级:
  // 1. module_dynamic.desc.text (UP主配文)
  // 2. module_dynamic.major.opus.summary.text (图文动态)
  // 3. module_dynamic.major.archive.desc (视频简介)
  // 4. module_dynamic.major.article.desc (专栏摘要)
  // 5. 旧协议 card
  function dynText(d) {
    const md = d.modules && d.modules.module_dynamic;
    if (!md) return '';

    // 1. 纯文字配文
    if (md.desc && md.desc.text) {
      return stripHtml(md.desc.text);
    }

    // 2. 图文动态 (opus)
    if (md.major && md.major.opus && md.major.opus.summary && md.major.opus.summary.text) {
      return stripHtml(md.major.opus.summary.text);
    }

    // 3. 视频简介
    if (md.major && md.major.archive && md.major.archive.desc) {
      return stripHtml(md.major.archive.desc);
    }

    // 4. 专栏摘要
    if (md.major && md.major.article && md.major.article.desc) {
      return stripHtml(md.major.article.desc);
    }

    // 5. 旧协议
    const card = parseCard(d.card);
    if (!card) return '';
    if (card.item && card.item.content) return stripHtml(card.item.content);
    if (card.item && card.item.description) return stripHtml(card.item.description);
    if (card.title) return stripHtml(card.title);
    return '';
  }

  // 动态作者 (兼容新旧协议)
  function dynAuthor(d) {
    // 新协议: modules.module_author.name
    if (d.modules && d.modules.module_author && d.modules.module_author.name) {
      return d.modules.module_author.name;
    }
    // 旧协议: desc.user_profile.info.uname
    if (d.desc && d.desc.user_profile && d.desc.user_profile.info) {
      return d.desc.user_profile.info.uname || '';
    }
    return '';
  }

  // 动态作者头像 (兼容新旧协议)
  function dynFace(d) {
    // 新协议: modules.module_author.face
    if (d.modules && d.modules.module_author && d.modules.module_author.face) {
      return d.modules.module_author.face;
    }
    // 旧协议: desc.user_profile.info.face
    if (d.desc && d.desc.user_profile && d.desc.user_profile.info) {
      return d.desc.user_profile.info.face || '';
    }
    return '';
  }

  function dynTime(d) {
    // 新协议: modules.module_author.pub_ts
    if (d.modules && d.modules.module_author && d.modules.module_author.pub_ts) {
      return relativeTime(d.modules.module_author.pub_ts);
    }
    // 旧协议: desc.timestamp
    if (d.desc && d.desc.timestamp) {
      return relativeTime(d.desc.timestamp);
    }
    return '';
  }

  function dynVideo(d) {
    return extractArchive(d);
  }

  function playVideo(v) {
    const idx = videos.findIndex(x => x.bvid === v.bvid);
    // 将 Following 视频列表写入 queue，而非沿用首页推荐的 queue
    queue.set({ items: [...videos], index: idx >= 0 ? idx : 0, source: 'following', label: '关注·视频' });
    navigate('/player?bvid=' + v.bvid);
  }

  // 打开动态详情
  // 新协议 id_str (web 端) 或旧协议 dynamic_id (vc 端)
  function openDynamicDetail(d) {
    const id = d.id_str || (d.desc && d.desc.dynamic_id);
    if (id) {
      navigate('/dynamic-detail?id=' + id);
    }
  }

  function gotoLogin() {
    navigate('/login');
  }

  function changeTab(i) {
    activeTab = i;
    if (i === 0 && videos.length === 0 && !videoLoading) loadVideos();
    if (i === 1 && dynamics.length === 0 && !dynLoading) loadDynamics();
  }

  onMount(() => {
    // 左软键: 未登录=登录, 已登录=刷新; 右软键: 切换 Tab
    const leftLabel = $isLogin ? '刷新' : '登录';
    const rightLabel = '切Tab';
    setSoftkeys(leftLabel, rightLabel);
    onKey('following', {
      ArrowDown: () => onMoveFocus(+1),
      ArrowUp: () => onMoveFocus(-1),
      SoftLeft: () => {
        if ($isLogin) {
          // 已登录: 刷新当前 Tab
          if (activeTab === 0) { videos = []; videoOffset = ''; videoHasMore = true; loadVideos(); }
          else { dynamics = []; dynOffset = ''; dynHasMore = true; loadDynamics(); }
        } else {
          // 未登录: 跳转登录页
          navigate('/login');
        }
      },
      SoftRight: () => changeTab(activeTab === 0 ? 1 : 0),
      '0': () => activeTab === 0 ? loadVideos() : loadDynamics(),
    });
    // 默认加载第一个 Tab
    changeTab(0);
  });

  onDestroy(() => {
    offKey('following');
  });
</script>

<div class="screen">
  <TabBar {tabs} active={activeTab} on:change={(e) => changeTab(e.detail)} />

  <div class="main">
    {#if !$isLogin}
      <EmptyState message="登录后查看关注" hint="按 5 键登录" />
    {:else if activeTab === 0}
      {#if videoLoading && videos.length === 0}
        <Loading message="加载中..." />
      {:else if videoError}
        <EmptyState message={videoError} />
      {:else}
        {#if videoLoadingMore}
          <LoadingMore />
        {/if}
        <FeedList items={videos} on:play={(e) => playVideo(e.detail)} />
      {/if}
    {:else}
      {#if dynLoading && dynamics.length === 0}
        <Loading message="加载中..." />
      {:else if dynError}
        <EmptyState message={dynError} />
      {:else if dynamics.length === 0}
        <EmptyState message="暂无动态" />
      {:else}
        {#if dynLoadingMore}
          <LoadingMore />
        {/if}
        <div class="dyn-list scroll-y">
          {#each dynamics as d (d.id_str)}
            {#each [dynVideo(d)] as v}
              <div class="dyn-item" data-navable tabindex="0"
                   on:click={() => openDynamicDetail(d)}
                   on:keydown={(e) => { if (e.key === 'Enter') openDynamicDetail(d); }}>
                <div class="head">
                  <img class="face" src={dynFace(d)} alt="" />
                  <span class="name">{dynAuthor(d)}</span>
                  <span class="time">{dynTime(d)}</span>
                </div>
                {#if dynText(d)}<div class="text">{dynText(d)}</div>{/if}
                {#if v}
                  <div class="archive">
                    {#if v.type === 'archive' || v.type === 'ugc_season'}
                      <!-- 视频/合集 -->
                      <div class="atitle">{v.title}</div>
                      <div class="astat">▶ {formatCount((v.stat && (v.stat.play || v.stat.view)) || 0)}</div>
                    {:else if v.type === 'article'}
                      <!-- 专栏 -->
                      <div class="atitle">📄 {v.title}</div>
                      <div class="astat">{v.label || ''}</div>
                    {:else if v.type === 'draw'}
                      <!-- 图片 -->
                      <div class="draw-preview">
                        {#each v.items.slice(0, 3) as imgSrc}
                          <img src={biliImg(imgSrc, 60, 60)} alt="" />
                        {/each}
                      </div>
                    {:else if v.type === 'opus'}
                      <!-- 图文 -->
                      <div class="atitle">{v.title || v.desc}</div>
                    {:else if v.type === 'live'}
                      <!-- 直播 -->
                      <div class="atitle">🔴 {v.title}</div>
                    {/if}
                  </div>
                {/if}
                <!-- 点赞/转发/评论统计 -->
                {#if d.modules && d.modules.module_stat}
                  {#each [d.modules.module_stat] as stat}
                    <div class="dyn-stat">
                      <span class="stat-item" class:liked={stat.like && stat.like.status}>❤ {formatCount(stat.like && stat.like.count)}</span>
                      <span class="stat-item">↗ {formatCount(stat.forward && stat.forward.count)}</span>
                      <span class="stat-item">💬 {formatCount(stat.comment && stat.comment.count)}</span>
                    </div>
                  {/each}
                {/if}
              </div>
            {/each}
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .dyn-list {
    height: 100%;
  }
  .dyn-item {
    padding: 6px 8px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    font-size: var(--md-sys-typescale-body-medium-size);
    transition: background 0.15s ease;
  }
  .dyn-item:focus,
  .dyn-item:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .head {
    display: flex;
    align-items: center;
    /* gap: 6px; Firefox 48 不支持 flex gap */
    font-size: var(--md-sys-typescale-body-small-size);
    margin-bottom: 2px;
  }
  .head .face {
    margin-right: 6px;
  }
  .face {
    width: 20px;
    height: 20px;
    border-radius: var(--md-sys-shape-corner-full);
    object-fit: cover;
    flex-shrink: 0;
  }
  .name {
    color: var(--md-sys-color-primary);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .time {
    color: var(--md-sys-color-on-surface-variant);
    flex-shrink: 0;
  }
  .text {
    color: var(--md-sys-color-on-surface);
    margin-bottom: 3px;
    line-height: 1.3;
  }
  .archive {
    background: var(--md-sys-color-surface-container-low);
    padding: 4px 6px;
    border-left: 2px solid var(--md-sys-color-primary);
    border-radius: 0 var(--md-sys-shape-corner-small) var(--md-sys-shape-corner-small) 0;
    margin-bottom: 2px;
  }
  .atitle {
    color: var(--md-sys-color-on-surface);
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: var(--md-sys-typescale-label-medium-weight);
  }
  .astat {
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--md-sys-typescale-body-small-size);
    margin-top: 1px;
  }

  .draw-preview {
    display: flex;
    /* gap: 4px; Firefox 48 不支持 flex gap */
    margin-top: 4px;
  }
  .draw-preview img {
    margin-right: 4px;
  }
  .draw-preview img {
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: var(--md-sys-shape-corner-small);
  }

  .dyn-stat {
    display: flex;
    /* gap: 12px; Firefox 48 不支持 flex gap */
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
  }
  .dyn-stat .stat-item {
    margin-right: 12px;
  }
  .dyn-stat .stat-item {
    display: flex;
    align-items: center;
    /* gap: 2px; Firefox 48 不支持 flex gap */
  }
  .dyn-stat .stat-item > * + * {
    margin-left: 2px;
  }
  .dyn-stat .stat-item.liked {
    color: var(--md-sys-color-primary);
  }
</style>
