<script>
  import { onMount, onDestroy } from 'svelte';
  import { isLogin, user } from '../stores/user.js';
  import { getDynamicNew, getDynamicHistory, extractArchive } from '../api/dynamic.js';
  import { loadDynamicVideos, setIndex, queue } from '../stores/queue.js';
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
  let videoError = '';

  // 动态流 (含文字 / 图片 / 视频)
  let dynamics = [];
  let dynLoading = false;
  let dynError = '';
  let dynOffsetId = '';

  async function loadVideos() {
    if (!$isLogin) {
      videoError = '请先登录';
      return;
    }
    videoLoading = true;
    videoError = '';
    try {
      await loadDynamicVideos($user.mid);
      const unsub = queue.subscribe(q => videos = q.items);
      unsub();
    } catch (e) {
      videoError = e.message || '加载失败';
    } finally {
      videoLoading = false;
    }
  }

  async function loadDynamics() {
    if (!$isLogin) {
      dynError = '请先登录';
      return;
    }
    dynLoading = true;
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
        // 取最后一条的 desc.dynamic_id 作为下次 offset
        const last = cards[cards.length - 1];
        if (last && last.desc) {
          dynOffsetId = last.desc.dynamic_id;
        }
      }
    } catch (e) {
      dynError = e.message || '加载失败';
    } finally {
      dynLoading = false;
    }
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
      ArrowDown: () => moveFocus(+1),
      ArrowUp: () => moveFocus(-1),
      SoftLeft: () => changeTab(activeTab === 0 ? 1 : 0),
      '1': () => changeTab(0),
      '2': () => changeTab(1),
      '0': () => activeTab === 0 ? loadVideos() : loadDynamics(),
      '5': () => gotoLogin()
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
      {#if videoLoading}
        <Loading message="加载中..." />
      {:else if videoError}
        <EmptyState message={videoError} />
      {:else}
        <FeedList items={videos} on:play={(e) => playVideo(e.detail)} />
      {/if}
    {:else}
      {#if dynLoading}
        <Loading message="加载中..." />
      {:else if dynError}
        <EmptyState message={dynError} />
      {:else if dynamics.length === 0}
        <EmptyState message="暂无动态" />
      {:else}
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
</style>
