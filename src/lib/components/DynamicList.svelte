<script>
  // 动态列表 (关注页的「动态」tab 和用户主页的「动态」tab 共用)
  //
  // 一条动态拆成两个可聚焦的部分:
  //   头部 (头像 + 昵称 + 时间) → 打开**作者主页**
  //   正文 (文字/视频/统计)     → 打开**动态详情**
  //
  // 之前整条动态是一个焦点, 点哪儿都是打开详情; 现在头部单独一个焦点,
  // 是进入其他用户主页的入口 (关注页的动态作者、用户主页的动态作者)。
  import { createEventDispatcher } from 'svelte';
  import { parseDynamicItem } from '../api/dynamic.js';
  import { stripHtml, relativeTime, formatCount } from '../utils/format.js';
  import { biliImg } from '../utils/platform.js';
  import Loading from './Loading.svelte';
  import LoadingMore from './LoadingMore.svelte';
  import EmptyState from './EmptyState.svelte';

  /** @type {Array<any>} 动态条目 */
  export let items = [];
  /** @type {boolean} 首次加载中 (列表为空时显示 loading) */
  export let loading = false;
  /** @type {boolean} 正在加载更多 */
  export let loadingMore = false;
  /** @type {string} 错误信息 */
  export let error = '';
  /** @type {string} 空列表提示 */
  export let empty = '暂无动态';

  const dispatch = createEventDispatcher();

  // 解析 card JSON 字符串
  function parseCard(s) {
    if (typeof s === 'string') {
      try { return JSON.parse(s); } catch (e) { return null; }
    }
    return s;
  }

  // 动态条目 → 统一结构 (api/dynamic.js 的 parseDynamicItem)
  //
  // 关注页和用户主页的动态都是 web 端协议 (feed/all / feed/space),
  // 字段位置跟动态类型有关 —— 统一解析在 api 层做, 这里只管渲染。
  // 旧协议 (api.vc.bilibili.com 的 card) 只在队列里用, 这里保留兜底。
  function parsed(d) {
    if (d && d.modules) return parseDynamicItem(d);
    return null;
  }

  // 动态正文 (正文区显示的那段)
  //
  // 图文动态 (opus) 的正文在主体区显示 (v.title || v.text), 这里不再重复一遍。
  // 视频/专栏动态的正文区放简介, 主体区放标题。
  function dynText(d) {
    const p = parsed(d);
    if (p) {
      // 转发的占位符正文 ("转发动态") 在 api 层已经清掉了
      if (p.content) return stripHtml(p.content);
      if (p.major) {
        if (p.major.kind === 'video' && p.major.desc) return stripHtml(p.major.desc);
        if (p.major.kind === 'article' && p.major.desc) return stripHtml(p.major.desc);
      }
      return '';
    }

    const md = d.modules && d.modules.module_dynamic;
    if (md) {
      if (md.desc && md.desc.text) return stripHtml(md.desc.text);
      if (md.major && md.major.opus && md.major.opus.summary && md.major.opus.summary.text) {
        return stripHtml(md.major.opus.summary.text);
      }
      if (md.major && md.major.archive && md.major.archive.desc) {
        return stripHtml(md.major.archive.desc);
      }
      if (md.major && md.major.article && md.major.article.desc) {
        return stripHtml(md.major.article.desc);
      }
    }

    const card = parseCard(d.card);
    if (!card) return '';
    if (card.item && card.item.content) return stripHtml(card.item.content);
    if (card.item && card.item.description) return stripHtml(card.item.description);
    if (card.title) return stripHtml(card.title);
    return '';
  }

  // 动态作者 (兼容新旧协议)
  function dynAuthor(d) {
    if (d.modules && d.modules.module_author && d.modules.module_author.name) {
      return d.modules.module_author.name;
    }
    if (d.desc && d.desc.user_profile && d.desc.user_profile.info) {
      return d.desc.user_profile.info.uname || '';
    }
    return '';
  }

  // 动态作者头像 (兼容新旧协议)
  function dynFace(d) {
    if (d.modules && d.modules.module_author && d.modules.module_author.face) {
      return d.modules.module_author.face;
    }
    if (d.desc && d.desc.user_profile && d.desc.user_profile.info) {
      return d.desc.user_profile.info.face || '';
    }
    return '';
  }

  // 动态作者 mid (进作者主页要用)
  function dynAuthorMid(d) {
    if (d.modules && d.modules.module_author && d.modules.module_author.mid) {
      return d.modules.module_author.mid;
    }
    if (d.desc && d.desc.user_profile && d.desc.user_profile.info) {
      return d.desc.user_profile.info.mid || 0;
    }
    return 0;
  }

  function dynTime(d) {
    if (d.modules && d.modules.module_author && d.modules.module_author.pub_ts) {
      return relativeTime(d.modules.module_author.pub_ts);
    }
    if (d.desc && d.desc.timestamp) {
      return relativeTime(d.desc.timestamp);
    }
    return '';
  }

  // 统一的主体解析 (api/dynamic.js 的 parseDynamicItem):
  // 视频/图片/图文/专栏/合集/剧集/转发/直播/一般类型/失效 都能拿到
</script>

{#if loading && items.length === 0}
  <Loading message="加载中..." />
{:else if error}
  <EmptyState message={error} />
{:else if items.length === 0}
  <EmptyState message={empty} />
{:else}
  <div class="dyn-list scroll-y" data-nav-root>
    {#each items as d (d.id_str)}
      {#each [parsed(d)] as p}
        <div class="dyn-item">
          <!-- 头部: 打开作者主页 -->
          <!-- 中键由框架默认行为触发 (activateFocused → click), 不再单独监听 keydown -->
          <div class="head" data-navable tabindex="0"
               on:click={() => dispatch('author', dynAuthorMid(d))}>
            <img class="face" src={dynFace(d)} alt="" />
            <span class="name">{dynAuthor(d)}</span>
            <span class="time">{dynTime(d)}</span>
          </div>
          <!-- 正文: 打开动态详情 -->
          <div class="body" data-navable tabindex="0"
               on:click={() => dispatch('open', d)}>
            {#if dynText(d)}<div class="text">{dynText(d)}</div>{/if}
            {#if p && p.major}
              {#each [p.major] as v}
              <div class="archive">
                {#if v.kind === 'video' || v.kind === 'season'}
                  <!-- 视频/合集 -->
                  <div class="atitle">{v.title}</div>
                  <div class="astat">▶ {formatCount((v.stat && (v.stat.play || v.stat.view)) || 0)}</div>
                {:else if v.kind === 'article'}
                  <!-- 专栏 -->
                  <div class="atitle">▤ {v.title}</div>
                  <div class="astat">{v.label || ''}</div>
                {:else if v.kind === 'images' || v.kind === 'opus'}
                  <!-- 带图 / 图文: 缩略图九宫格 -->
                  {#if v.kind === 'opus' && v.title}<div class="atitle">{v.title}</div>{/if}
                  {#if v.images && v.images.length}
                    <div class="draw-preview">
                      <!-- 列表里只给 3 张缩略图, 全套去动态详情看 -->
                      {#each v.images.slice(0, 3) as img}
                        <img src={biliImg(img.src, 50, 50)} alt="" />
                      {/each}
                    </div>
                  {/if}
                  {#if v.kind === 'opus' && v.text && !v.title}<div class="atitle">{v.text}</div>{/if}
                {:else if v.kind === 'forward'}
                  <!-- 转发: 显示原动态的作者和内容 -->
                  {#if p.orig}
                    <div class="atitle">↪ {p.orig.author.name || '转发动态'}</div>
                    {#if p.orig.major && p.orig.major.kind === 'video'}
                      <div class="astat">{p.orig.major.title}</div>
                    {:else if p.orig.major && p.orig.major.kind === 'opus'}
                      <div class="astat">{p.orig.major.title || ''}</div>
                    {:else if p.orig.content}
                      <div class="astat">{p.orig.content.slice(0, 40)}</div>
                    {/if}
                  {:else}
                    <div class="atitle">↪ 转发动态</div>
                  {/if}
                {:else if v.kind === 'live'}
                  <!-- 直播 -->
                  <div class="atitle">● {v.title}</div>
                {:else if v.kind === 'invalid'}
                  <div class="atitle">该动态已失效</div>
                {:else if v.kind === 'unknown'}
                  <div class="atitle">({v.type})</div>
                {/if}
              </div>
              {/each}
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
        </div>
      {/each}
    {/each}
    {#if loadingMore}<LoadingMore />{/if}
  </div>
{/if}

<style>
  .dyn-list {
    height: 100%;
  }
  .dyn-item {
    border-bottom: 1px solid var(--md-sys-color-outline-variant);
    background: var(--md-sys-color-surface);
    font-size: var(--md-sys-typescale-body-medium-size);
  }
  /* 头部和正文各自是一个焦点, 聚焦时高亮 */
  .head,
  .body {
    padding: 6px 8px;
    transition: background 0.15s ease;
  }
  .head:focus,
  .body:focus,
  .head:hover,
  .body:hover {
    background: var(--md-sys-color-surface-container-high);
  }
  .head {
    display: flex;
    align-items: center;
    /* gap: 6px; Firefox 48 不支持 flex gap */
    font-size: var(--md-sys-typescale-body-small-size);
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

  /* 卡片里的图: 九宫格风格 —— 一行几张小缩略图 */
  .draw-preview {
    display: flex;
    margin-top: 4px;
  }
  .draw-preview img {
    width: 50px;
    height: 50px;
    object-fit: cover;
    margin-right: 4px;
    margin-bottom: 4px;
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
