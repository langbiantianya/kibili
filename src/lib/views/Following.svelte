<script>
  import { onMount, onDestroy } from 'svelte';
  import { isLogin, user } from '../stores/user.js';
  import { getDynamicNew, getDynamicHistory, getDynamicAll, extractArchive, extractAuthor } from '../api/dynamic.js';
  import { setIndex } from '../stores/queue.js';
  import { navigate } from '../router/index.js';
  import { onKey, offKey, moveFocus } from '../keyboard/index.js';
  import { setSoftkeys, showToast } from '../stores/ui.js';
  import TabBar from '../components/TabBar.svelte';
  import FeedList from '../components/FeedList.svelte';
  import Loading from '../components/Loading.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { stripHtml, relativeTime, formatCount } from '../utils/format.js';

  const tabs = [
    { key: 'video',   label: '视频' },
    { key: 'dynamic', label: '动态' }
  ];
  let activeTab = 0;

  // 视频流 (来自关注动态, 过滤 video)
  let videos = [];
  let videoLoading = false;
  let videoLoadingMore = false;
  let videoError = '';

  // 动态流 (含文字 / 图片 / 视频)
  let dynamics = [];
  let dynLoading = false;
  let dynLoadingMore = false;
  let dynError = '';
  let dynOffsetId = '';

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
          return {
            bvid: v.bvid,
            cid: v.cid,
            aid: v.aid,
            title: v.title,
            pic: v.pic,
            owner: author,
            duration: v.duration,
            stat: v.stat
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
      let d;
      if (dynOffsetId) {
        d = await getDynamicHistory($user.mid, { offset_dynamic_id: dynOffsetId });
      } else {
        d = await getDynamicNew($user.mid);
      }
      const cards = (d && d.cards) ? d.cards : [];
      if (cards.length) {
        dynamics = dynamics.concat(cards);
        const last = cards[cards.length - 1];
        if (last && last.desc) {
          dynOffsetId = last.desc.dynamic_id;
        }
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

  // 动态文字
  function dynText(d) {
    const card = parseCard(d.card);
    if (!card) return '';
    if (card.item && card.item.content) return stripHtml(card.item.content);
    if (card.item && card.item.description) return stripHtml(card.item.description);
    if (card.title) return stripHtml(card.title);
    return '';
  }

  // 动态作者
  function dynAuthor(d) {
    if (d.desc && d.desc.user_profile && d.desc.user_profile.info) {
      return d.desc.user_profile.info.uname || '';
    }
    return '';
  }

  function dynTime(d) {
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
    if (idx >= 0) setIndex(idx);
    navigate('#/player');
  }

  function gotoLogin() {
    navigate('#/login');
  }

  function changeTab(i) {
    activeTab = i;
    if (i === 0 && videos.length === 0 && !videoLoading) loadVideos();
    if (i === 1 && dynamics.length === 0 && !dynLoading) loadDynamics();
  }

  onMount(() => {
    setSoftkeys('切Tab', '登录');
    onKey('following', {
      ArrowDown: () => onMoveFocus(+1),
      ArrowUp: () => onMoveFocus(-1),
      SoftLeft: () => changeTab(activeTab === 0 ? 1 : 0),
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
          <div class="loading-top">
            <div class="spinner-small"></div>
            <span>加载中...</span>
          </div>
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
          <div class="loading-top">
            <div class="spinner-small"></div>
            <span>加载中...</span>
          </div>
        {/if}
        <div class="dyn-list scroll-y">
          {#each dynamics as d (d.desc && d.desc.dynamic_id)}
            {@const v = dynVideo(d)}
            <div class="dyn" data-navable tabindex="0">
              <div class="head">
                <span class="name">{dynAuthor(d)}</span>
                <span class="time">{dynTime(d)}</span>
              </div>
              {#if dynText(d)}<div class="text">{dynText(d)}</div>{/if}
              {#if v}
                <div class="archive">
                  <div class="atitle">{v.title}</div>
                  <div class="astat">▶ {formatCount((v.stat && v.stat.view) || 0)}</div>
                </div>
              {/if}
            </div>
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
  .dyn {
    padding: 6px 8px;
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    font-size: var(--md-sys-typescale-body-medium-size);
    transition: background 0.15s ease;
  }
  .dyn:focus,
  .dyn:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .head {
    display: flex;
    justify-content: space-between;
    font-size: var(--md-sys-typescale-body-small-size);
    margin-bottom: 2px;
  }
  .name {
    color: var(--md-sys-color-primary);
    font-weight: 500;
  }
  .time {
    color: var(--md-sys-color-on-surface-variant);
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
    font-weight: 500;
  }
  .astat {
    color: var(--md-sys-color-on-surface-variant);
    font-size: var(--md-sys-typescale-body-small-size);
    margin-top: 1px;
  }

  /* ============ Loading Top ============ */
  .loading-top {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
    font-size: var(--md-sys-typescale-body-small-size);
    color: var(--md-sys-color-on-surface-variant);
    background: var(--md-sys-color-surface-container);
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
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
