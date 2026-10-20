<script>
  import { onMount, tick } from 'svelte';
  import { isLogin } from '../stores/user.js';
  import { extractArchive } from '../api/dynamic.js';
  import { queue } from '../stores/queue.js';
  import { navigate } from '../router/index.js';
  import { onKey, roam, getFocusables, focusAt, focusFirst } from '../keyboard/index.js';
  import { setSoftkeys } from '../stores/ui.js';
  import { following, followingFocus, resetFollowingData, loadFollowing } from '../stores/following.js';
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
  // 数据、分页游标、加载状态全在 store 里 (见 stores/following.js):
  // 组件销毁也不丢 —— 返回本页时直接用缓存, 不重新发请求。
  // 这里不建本地别名, 一律直接读 $following.*, 保证读到的是最新值。
  //
  // 焦点位置在 followingFocus 里 (每个 tab 记一个序号),
  // 焦点由**本页独占**: FeedList 的自动聚焦在这里是关掉的 (autoFocus={false}),
  // 否则两边抢焦点, 会出现"焦点刚设好又被拉回第一条"。

  // 列表容器 (视频流是 .feed-list, 动态流是 .dyn-list)
  let mainEl = null;

  /** 当前 tab 的缓存键 */
  function tabKey() {
    return $following.activeTab === 0 ? 'video' : 'dynamic';
  }

  /** 当前列表容器 */
  function listRoot() {
    return mainEl ? mainEl.querySelector('.feed-list, .dyn-list') : null;
  }

  /**
   * 页面上现在有没有焦点
   *
   * body / html 视为"没有焦点" —— 换页回来时旧页面被卸载,
   * 焦点会掉回 body, 这正是我们要恢复焦点的时机。
   */
  function hasFocusSomewhere() {
    const a = document.activeElement;
    return !!(a && a !== document.body && a !== document.documentElement);
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
    const list = $following.videos;
    const idx = list.findIndex(x => x.bvid === v.bvid);
    // 将 Following 视频列表写入 queue，而非沿用首页推荐的 queue
    queue.set({ items: [...list], index: idx >= 0 ? idx : 0, source: 'following', label: '关注·视频' });
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

  /**
   * 切 tab
   *
   * - tab 记在 store 里 (跨页面保留)
   * - **只有没有缓存时才拉数据**: 返回本页时列表已经在缓存里, 不重复请求
   * - 焦点放回这个 tab 上次看的那一条
   */
  function changeTab(i) {
    if ($following.activeTab !== i) {
      following.update(s => ({ ...s, activeTab: i }));
    }
    if (i === 0 && $following.videos.length === 0) loadFollowing(0);
    if (i === 1 && $following.dynamics.length === 0) loadFollowing(1);
    // 切回某个 tab 时把焦点放回刚才看的那一条
    restoreFocus();
  }

  /** 手动刷新当前 tab (左软键 / 数字键 0) */
  function refreshCurrent() {
    // 清缓存重拉; 焦点位置一起作废 (刷新后回到最上面)
    resetFollowingData($following.activeTab);
    loadFollowing($following.activeTab);
  }

  /**
   * 焦点落在列表第几条 → 记下来
   *
   * Gecko 48 没有 focusin 事件, 用捕获阶段的 focus 事件代替
   * (按键框架的 installKeyboard 也是这么做的)。
   */
  function onFocusCapture(e) {
    const root = listRoot();
    if (!root || !root.contains(e.target)) return;
    const list = getFocusables(root);
    const i = list.indexOf(e.target);
    if (i >= 0) followingFocus[tabKey()] = i;
  }

  /**
   * 把焦点放回上次的位置
   *
   * 规则 (顺序很重要):
   * 1. 列表还没渲染出来 (还在 loading) → 什么都不做, 等数据到了再调
   * 2. 页面上已经有焦点 (用户在标签栏/别的控件上) → 不抢
   * 3. 记过位置 → 放回那一条; 没记过 → 第一条
   */
  async function restoreFocus() {
    await tick();
    const root = listRoot();
    if (!root) return;
    if (!getFocusables(root).length) return;
    if (hasFocusSomewhere()) return;
    const idx = followingFocus[tabKey()];
    if (idx >= 0 && focusAt(root, idx)) return;
    focusFirst(root);
  }

  // 列表内容变了 (数据到了 / 翻页追加了) → 把焦点放回该放的位置。
  // 依赖写在参数里, 只是为了告诉 Svelte "这两个长度变了就重跑"。
  $: restoreFocus($following.videos.length, $following.dynamics.length);

  // 软键标签随登录状态变化 (登录/登出后立即更新, 不用重进页面)
  // 左软键: 未登录=登录, 已登录=刷新; 右软键: 切Tab
  // 中间: 中键 (OK) 的作用提示 —— 打开当前选中的视频/动态
  $: setSoftkeys($isLogin ? '刷新' : '登录', '切Tab', $isLogin ? '打开' : '');

  onMount(() => {
    // 恢复上次的 tab (默认「视频」); 有缓存就不重新拉
    changeTab($following.activeTab);
    // 记住焦点落在第几条
    window.addEventListener('focus', onFocusCapture, true);
    // onKey() 返回注销函数 → 组件销毁时自动注销
    const off = onKey('following', {
      // 向下漫游到列表末尾时加载下一页 (roam 的 onEdge 在"没能移动"时触发)
      Down: () => roam(+1, () => loadFollowing($following.activeTab, true)),
      Up: () => roam(-1),
      SoftLeft: () => {
        if ($isLogin) {
          // 已登录: 刷新当前 Tab (只有手动刷新才重新拉数据)
          refreshCurrent();
        } else {
          // 未登录: 跳转登录页
          navigate('/login');
        }
      },
      SoftRight: () => changeTab($following.activeTab === 0 ? 1 : 0),
      // 数字键 0: 重新加载当前 Tab
      // (loadFollowing 是往数组尾部追加的, 必须先清空分页状态再加载,
      //  否则整个列表会被追加一份重复的)
      '0': () => refreshCurrent(),
    }, { softkeys: true });
    return () => {
      window.removeEventListener('focus', onFocusCapture, true);
      off();
    };
  });
</script>

<div class="screen">
  <TabBar {tabs} active={$following.activeTab} on:change={(e) => changeTab(e.detail)} />

  <div class="main" bind:this={mainEl}>
    {#if !$isLogin}
      <EmptyState message="登录后查看关注" hint="按 左软键 登录" />
    {:else if $following.activeTab === 0}
      {#if $following.videoLoading && $following.videos.length === 0}
        <Loading message="加载中..." />
      {:else if $following.videoError}
        <EmptyState message={$following.videoError} />
      {:else}
        <!-- autoFocus={false}: 焦点由本页统一管 (见 restoreFocus) -->
        <FeedList items={$following.videos} loadingMore={$following.videoLoadingMore} autoFocus={false} on:play={(e) => playVideo(e.detail)} />
      {/if}
    {:else}
      {#if $following.dynLoading && $following.dynamics.length === 0}
        <Loading message="加载中..." />
      {:else if $following.dynError}
        <EmptyState message={$following.dynError} />
      {:else if $following.dynamics.length === 0}
        <EmptyState message="暂无动态" />
      {:else}
        <div class="dyn-list scroll-y" data-nav-root>
          {#each $following.dynamics as d (d.id_str)}
            {#each [dynVideo(d)] as v}
              <!-- 中键由框架默认行为触发 (activateFocused → click), 不再单独监听 keydown -->
              <div class="dyn-item" data-navable tabindex="0"
                   on:click={() => openDynamicDetail(d)}>
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
                      <div class="atitle">▤ {v.title}</div>
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
                      <div class="atitle">● {v.title}</div>
                    {/if}
                  </div>
                {/if}
                <!-- 点赞/转发/评论统计 -->
                {#if d.modules && d.modules.module_stat}
                  {#each [d.modules.module_stat] as stat}
                    <div class="dyn-stat">
                      <span class="stat-item" class:liked={stat.like && stat.like.status}>❤ {formatCount(stat.like && stat.like.count)}</span>
                      <span class="stat-item">↗ {formatCount(stat.forward && stat.forward.count)}</span>
                      <span class="stat-item">❝ {formatCount(stat.comment && stat.comment.count)}</span>
                    </div>
                  {/each}
                {/if}
              </div>
            {/each}
          {/each}
          {#if $following.dynLoadingMore}<LoadingMore />{/if}
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
    /* gap: 2px; Firefox 48 不支持 flex gap */
  }
  .dyn-stat .stat-item > * + * {
    margin-left: 2px;
  }
  .dyn-stat .stat-item.liked {
    color: var(--md-sys-color-primary);
  }
</style>
