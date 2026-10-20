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
  import { extractArchive } from '../api/dynamic.js';
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

  function dynVideo(d) {
    return extractArchive(d);
  }
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
      {#each [dynVideo(d)] as v}
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
