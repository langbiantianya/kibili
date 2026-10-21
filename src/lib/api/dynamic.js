// 关注动态 (web 端)
// 端点参考: alittlehuaji/bilibili-api-collect-mirror/docs/dynamic/

import { get } from './bili.js';

// 列表接口的 features 参数
//
// ⚠ itemOpusStyle 必须带: 不带的话图文动态只返回老式的 MAJOR_TYPE_DRAW
// (只有图片, 没有正文), 带上才返回 MAJOR_TYPE_OPUS (标题 + 正文 + 图片)。
// 真机实测: 同一个动态, 带 features 返回 OPUS + 完整 summary,
// 不带返回 DRAW + 只有 items 数组。
const LIST_FEATURES = 'itemOpusStyle';

// 关注动态列表 (web 端主端点)
// 端点: GET /x/polymer/web-dynamic/v1/feed/all
// type: all / video / pgc / article
// offset: 翻页游标
// 响应: data.items[] 含 modules.module_dynamic.major.archive (视频)
//
// ⚠ features 必须带 itemOpusStyle: 不带的话图文动态只会返回老式的
// MAJOR_TYPE_DRAW (只有图片, 没有正文), 带上才返回 MAJOR_TYPE_OPUS
// (标题 + 正文 + 图片)。真机实测确认。
export async function getDynamicAll({ type = 'all', offset = '', page = 1 } = {}) {
  const query = { type, page, features: LIST_FEATURES };
  if (offset) query.offset = offset;
  return get('/x/polymer/web-dynamic/v1/feed/all', {
    query,
    needCookie: true
  });
}

// 用户空间动态
// 端点: GET /x/polymer/web-dynamic/v1/feed/space
// needCookie: 这个接口风控比较严, 带上登录态 (和设备 buvid) 才稳定返回
export async function getDynamicSpace(hostMid, { offset = '', features = LIST_FEATURES } = {}) {
  const query = { host_mid: hostMid, features };
  if (offset) query.offset = offset;
  return get('/x/polymer/web-dynamic/v1/feed/space', { query, needCookie: true });
}

// 动态详情
// 端点: GET /x/polymer/web-dynamic/v1/detail
// 该接口偶发 -352 风控错误, 指数退避重试 (首次 500ms)
//
// features 是**必填**参数 (文档标注), 少了它有的动态会直接 4101139 加载失败。
// 这里带上 web 端默认的一整套功能开关, 图文动态 (MAJOR_TYPE_OPUS) 才拿得到完整内容。
const DETAIL_FEATURES = 'itemOpusStyle,opusBigCover,onlyfansVote,endFooterHidden,decorationCard,onlyfansAssetsV2,ugcDelete,onlyfansQaCard,commentsNewVersion';

export async function getDynamicDetail(id, { maxRetries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await get('/x/polymer/web-dynamic/v1/detail', {
        query: {
          id,
          timezone_offset: -480,
          platform: 'web',
          gaia_source: 'main_web',
          features: DETAIL_FEATURES
        },
        // 带登录态: 转发动态 (DYNAMIC_TYPE_FORWARD) 的原动态内容 (item.orig)
        // 未登录时接口会把它掐掉, 只剩一句"转发动态"占位符。
        needCookie: true
      });
    } catch (e) {
      lastError = e;
      const code = e && typeof e === 'object' ? /** @type {any} */(e).code : undefined;
      // -352 是风控; 没有 code 的 (网络错误/响应非 JSON) 也可能是风控导致的,
      // 这两种都重试, 其余直接抛。
      const retryable = code === -352 || code === undefined;
      if (!retryable) throw e;
      // 最后一次也失败了, 抛出去
      if (attempt === maxRetries) throw e;
      // 指数退避: 500ms, 1000ms, 2000ms...
      const delay = 500 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ============ 动态解析 (统一) ============
//
// 动态的主体类型有十几种 (见镜像文档 docs/dynamic/dynamic_enum.md):
//   MAJOR_TYPE_ARCHIVE   视频
//   MAJOR_TYPE_DRAW      带图动态
//   MAJOR_TYPE_OPUS      图文动态 (现在 B 站的主流形态)
//   MAJOR_TYPE_ARTICLE   专栏
//   MAJOR_TYPE_UGC_SEASON 合集
//   MAJOR_TYPE_PGC       剧集
//   MAJOR_TYPE_COMMON    一般类型 (装扮/点评/分享…)
//   MAJOR_TYPE_LIVE      直播间
//   MAJOR_TYPE_FORWARD   转发
//   MAJOR_TYPE_MUSIC     音频
//   MAJOR_TYPE_NONE      动态失效
// 每种类型的字段位置都不一样, 这里统一成一种结构, 视图层不用再关心具体类型。

/**
 * 评论用的 oid/type —— 不同动态类型评论挂在不同的对象上
 * (见镜像文档 docs/dynamic/dynamic_enum.md 的"动态类型"表)
 */
export const DYNAMIC_COMMENT_TYPE = {
  VIDEO: 1,        // 投稿视频: oid = 视频 aid
  DRAW: 11,        // 带图动态: oid = 相册 id
  ARTICLE: 12,     // 专栏:     oid = 专栏 cv 号
  MUSIC: 14,       // 音频:     oid = 音频 au 号
  WORD: 17,        // 纯文字/转发/一般类型: oid = 动态本身 id
  MEDIALIST: 19    // 收藏夹:   oid = 收藏夹 id
};

/**
 * 富文本节点 → 纯文本
 *
 * 富文本节点类型见 docs/opus/rich_text_nodes.md:
 *   TEXT(1) / AT(2) / LOTTERY(3) / VOTE(4) / TOPIC / GOODS / BV / AV
 *   EMOJI(9) / CV / VIEW_PICTURE / WEB / TAOBAO / MAIL / OGV_SEASON / OGV_EP
 * 除了纯文字节点, 其余类型的 text 字段一般也带可读的词 (@某人、#话题#、表情…)
 *
 * @param {Array} nodes rich_text_nodes
 * @returns {string}
 */
export function richTextToPlain(nodes) {
  if (!nodes || !nodes.length) return '';
  let out = '';
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n) continue;
    const t = n.text || n.orig_text || '';
    if (t) out += t;
  }
  return out;
}

/**
 * 动态主体类型 → 展示用的 kind
 *
 * 见镜像文档 docs/dynamic/dynamic_enum.md 的「动态主体类型」表。
 */
const MAJOR_KIND = {
  MAJOR_TYPE_ARCHIVE: 'video',
  MAJOR_TYPE_DRAW: 'images',
  MAJOR_TYPE_OPUS: 'opus',
  MAJOR_TYPE_ARTICLE: 'article',
  MAJOR_TYPE_UGC_SEASON: 'season',
  MAJOR_TYPE_PGC: 'pgc',
  MAJOR_TYPE_COURSES: 'courses',
  MAJOR_TYPE_COMMON: 'common',
  MAJOR_TYPE_UPOWER_COMMON: 'common',
  MAJOR_TYPE_MEDIALIST: 'common',
  MAJOR_TYPE_LIVE: 'live',
  MAJOR_TYPE_LIVE_RCMD: 'live',
  MAJOR_TYPE_MUSIC: 'music',
  MAJOR_TYPE_SUBSCRIPTION: 'common',
  MAJOR_TYPE_SUBSCRIPTION_NEW: 'common',
  MAJOR_TYPE_FORWARD: 'forward',
  MAJOR_TYPE_NONE: 'invalid'
};

/**
 * 主体里"有封面 + 标题 + 简介"的那一类 (视频/合集/剧集/专栏/一般类型…)
 *
 * 这些类型的字段名基本一致, 统一按同一套规则取, 少写一堆分支。
 */
function fillCardLike(base, a) {
  if (!a) return;
  base.title = a.title || '';
  base.cover = a.cover || (a.covers && a.covers[0]) || '';
  base.desc = a.desc || '';
  base.text = a.desc || '';
  base.duration = a.duration_text || a.duration || '';
  base.jumpUrl = a.jump_url || '';
  base.stat = a.stat || null;
  base.bvid = a.bvid || '';
  base.aid = a.aid != null ? String(a.aid) : '';
  base.cid = a.cid != null ? String(a.cid) : '';
  base.label = a.label || '';
  base.badge = a.badge ? a.badge.text || '' : '';
}

/**
 * 动态主体 (module_dynamic.major) → 统一的结构
 *
 * ⚠ 关键: **必须按 major.type 分派**, 不能靠"哪个字段存在"来判断。
 * 接口返回的 major 对象里 archive/pgc/draw/article/opus/... **所有键都在**,
 * 只是不匹配的类型对应的值是 null —— 真机上实测 DYNAMIC_TYPE_DRAW 的
 * major.type 其实是 MAJOR_TYPE_OPUS, 而 DYNAMIC_TYPE_ARTICLE 也是 OPUS。
 *
 * @param {any} major
 * @returns {Object|null} 统一结构; 没有 major 返回 null
 */
export function parseDynamicMajor(major) {
  if (!major) return null;

  const type = major.type || '';
  const base = {
    kind: MAJOR_KIND[type] || 'unknown',
    type: type,
    title: '',
    cover: '',
    desc: '',
    text: '',
    bvid: '',
    aid: '',
    cid: '',
    duration: '',
    label: '',
    badge: '',
    images: [],
    jumpUrl: '',
    stat: null,        // 视频/合集主体自带的统计 (播放数等)
    orig: null,        // 转发: 原动态的主体
    origAuthor: null,  // 转发: 原作者
    origText: ''       // 转发: 原动态的文字
  };

  switch (type) {
    case 'MAJOR_TYPE_ARCHIVE':
      fillCardLike(base, major.archive);
      return base;

    case 'MAJOR_TYPE_OPUS':
    case 'MAJOR_TYPE_DRAW': {
      // 图文动态 (opus) —— 现在 B 站的主流形态: 标题 + 富文本正文 + 图片。
      // 老的带图动态 (draw) 也走这里: draw.items 里的图和 opus.pics 一样。
      const a = major.opus || major.draw;
      if (!a) return base;
      if (major.opus) {
        const sum = a.summary || {};
        base.title = a.title || '';
        base.text = sum.text || richTextToPlain(sum.rich_text_nodes);
        base.desc = base.text;
        base.jumpUrl = a.jump_url || '';
        const pics = a.pics || [];
        for (let i = 0; i < pics.length; i++) {
          const p = pics[i] || {};
          base.images.push({ src: p.url || '', width: p.width || 0, height: p.height || 0 });
        }
      } else {
        // 老式 draw: 图片在 items, 文字没有单独字段
        const items = a.items || [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i] || {};
          base.images.push({ src: it.src || '', width: it.width || 0, height: it.height || 0 });
        }
      }
      base.cover = base.images.length ? base.images[0].src : '';
      return base;
    }

    case 'MAJOR_TYPE_ARTICLE':
      fillCardLike(base, major.article);
      return base;

    case 'MAJOR_TYPE_UGC_SEASON':
      fillCardLike(base, major.ugc_season);
      return base;

    case 'MAJOR_TYPE_PGC':
      fillCardLike(base, major.pgc);
      return base;

    case 'MAJOR_TYPE_COURSES':
      fillCardLike(base, major.courses);
      if (base.title && !base.text) base.text = major.courses.sub_title || '';
      return base;

    case 'MAJOR_TYPE_COMMON':
      fillCardLike(base, major.common);
      return base;

    case 'MAJOR_TYPE_UPOWER_COMMON':
      // 充电相关
      fillCardLike(base, major.upower_common);
      return base;

    case 'MAJOR_TYPE_LIVE': {
      const a = major.live;
      fillCardLike(base, a);
      if (a) {
        base.desc = a.desc_first || a.desc_second || '';
        base.text = base.desc;
      }
      return base;
    }

    case 'MAJOR_TYPE_LIVE_RCMD': {
      // 直播推荐: content 是一段 JSON 字符串
      const a = major.live_rcmd;
      fillCardLike(base, a);
      if (a && a.content) {
        try {
          const c = JSON.parse(a.content);
          // 真机实测: 标题/封面在 live_play_info 里, 不是顶层
          const lp = c.live_play_info || {};
          base.title = lp.title || c.title || base.title;
          base.cover = lp.cover || c.cover || base.cover;
          base.desc = lp.uname ? '主播 ' + lp.uname : (lp.description || c.description || '');
          base.text = base.desc;
        } catch (e) {
          // 不是 JSON 就当普通文本
          base.desc = String(a.content).slice(0, 80);
          base.text = base.desc;
        }
      }
      return base;
    }

    case 'MAJOR_TYPE_MUSIC': {
      const a = major.music;
      fillCardLike(base, a);
      return base;
    }

    case 'MAJOR_TYPE_NONE': {
      const a = major.none;
      base.desc = (a && a.tips) || '该动态已失效';
      base.text = base.desc;
      return base;
    }

    default:
      // 未知类型: 兜底扫一遍常见字段, 尽量别把内容丢掉
      fillCardLike(base, major.archive || major.pgc || major.ugc_season || major.common || major.article);
      return base;
  }
}

/**
 * 转发动态的原动态 (item.orig) → 统一结构
 *
 * ⚠ 转发动态的 **major 是 null**, 原动态不在 major 里, 而是在 **item.orig**
 * (见镜像文档 docs/dynamic/all.md: "orig | 原动态信息 | 仅 DYNAMIC_TYPE_FORWARD 存在")。
 * 真机实测: item.orig 是一个完整的动态 item (含自己的 modules/author/major)。
 *
 * @param {any} orig item.orig
 * @returns {Object|null}
 */
export function parseDynamicOrig(orig) {
  if (!orig) return null;

  const modules = orig.modules || {};
  const md = modules.module_dynamic || {};
  const author = modules.module_author || {};

  const descText = md.desc ? (md.desc.text || richTextToPlain(md.desc.rich_text_nodes)) : '';

  return {
    id: orig.id_str || '',
    type: orig.type || '',
    author: {
      mid: author.mid || 0,
      name: author.name || '',
      face: author.face || ''
    },
    // 原动态的正文: desc 为空时退回 opus.summary.text
    content: descText || (md.major && md.major.opus && md.major.opus.summary
      ? (md.major.opus.summary.text || richTextToPlain(md.major.opus.summary.rich_text_nodes))
      : ''),
    major: parseDynamicMajor(md.major),
    stat: modules.module_stat || null
  };
}

/**
 * 相关内容卡片 (module_dynamic.additional) → 统一结构
 *
 * 常见的几种 (见 docs/dynamic/all.md):
 *   ADDITIONAL_TYPE_COMMON   游戏/装扮/番剧卡片 (desc1/desc2 是两行描述)
 *   ADDITIONAL_TYPE_UGC      视频跳转卡片
 *   ADDITIONAL_TYPE_VOTE     投票
 *   ADDITIONAL_TYPE_GOODS    商品
 *   ADDITIONAL_TYPE_RESERVE  预约
 *
 * @param {any} additional module_dynamic.additional
 * @returns {Object|null}
 */
export function parseDynamicAdditional(additional) {
  if (!additional || !additional.type) return null;

  const type = additional.type;
  const base = {
    type: type,
    title: '',
    cover: '',
    desc: '',
    label: '',
    jumpUrl: ''
  };

  if (type === 'ADDITIONAL_TYPE_COMMON' && additional.common) {
    const c = additional.common;
    base.title = c.title || '';
    base.cover = c.cover || '';
    base.label = c.head_text || '';
    // desc1/desc2 是两行描述, 都可能为空
    base.desc = [c.desc1, c.desc2].filter(Boolean).join(' · ');
    base.jumpUrl = c.jump_url || '';
    return base;
  }

  if (type === 'ADDITIONAL_TYPE_UGC' && additional.ugc) {
    const u = additional.ugc;
    base.title = u.title || '';
    base.cover = u.cover || '';
    base.label = u.head_text || '';
    base.desc = u.desc_second || '';
    base.jumpUrl = u.jump_url || '';
    return base;
  }

  if (type === 'ADDITIONAL_TYPE_VOTE' && additional.vote) {
    const v = additional.vote;
    base.title = v.desc || '';
    base.label = '投票';
    base.desc = v.join_num ? (v.join_num + ' 人参与') : '';
    return base;
  }

  if (type === 'ADDITIONAL_TYPE_GOODS' && additional.goods) {
    const g = additional.goods;
    base.label = g.head_text || '';
    base.title = g.head_text || '商品';
    const items = g.items || [];
    if (items.length) base.desc = items.map(it => it.title || '').filter(Boolean).join('、');
    return base;
  }

  if (type === 'ADDITIONAL_TYPE_RESERVE' && additional.reserve) {
    const r = additional.reserve;
    base.title = r.title || '';
    base.label = '预约';
    base.desc = (r.desc1 && r.desc1.text) || '';
    base.jumpUrl = r.jump_url || '';
    return base;
  }

  return base;
}

/**
 * 动态 item → 统一的详情结构
 *
 * @param {any} item web 端 dynamic item
 * @returns {Object|null}
 */
export function parseDynamicItem(item) {
  if (!item) return null;

  const modules = item.modules || {};
  const author = modules.module_author || {};
  const md = modules.module_dynamic || {};
  const ms = modules.module_stat || {};
  const basic = item.basic || {};

  const descText = md.desc ? (md.desc.text || richTextToPlain(md.desc.rich_text_nodes)) : '';

  // 转发: major 是 null, 原动态在 item.orig
  const isForward = item.type === 'DYNAMIC_TYPE_FORWARD' || !!item.orig;
  let major = null;
  let orig = null;

  // 转发者没写评论时, 接口给的正文是"转发动态"这四个字 (占位符), 当成没有正文
  const content = (isForward && descText === '转发动态') ? '' : descText;

  if (isForward) {
    orig = parseDynamicOrig(item.orig);
    // 转发本身没有主体, 统一成 kind='forward', 原内容挂在 orig 上
    major = {
      kind: 'forward',
      type: 'MAJOR_TYPE_FORWARD',
      title: '',
      cover: '',
      desc: '',
      text: '',
      bvid: '',
      aid: '',
      cid: '',
      duration: '',
      label: '',
      badge: '',
      images: [],
      jumpUrl: '',
      stat: null,
      orig: orig ? orig.major : null,
      origAuthor: orig ? orig.author : null,
      origText: orig ? orig.content : ''
    };
  } else {
    major = parseDynamicMajor(md.major);
  }

  // 评论对象: 不同动态类型评论挂在不同对象上 (视频 aid / 相册 id / 动态 id …)
  // basic.comment_id_str + basic.comment_type 就是对的, 接口直接给了;
  // 拿不到时按动态类型兜底 (见 DYNAMIC_COMMENT_TYPE)。
  const fallbackType = FALLBACK_COMMENT_TYPE[item.type] || 0;
  const commentOid = basic.comment_id_str || '';
  const commentType = basic.comment_type || fallbackType || 0;

  return {
    id: item.id_str || '',
    type: item.type || '',
    isForward: isForward,
    author: {
      mid: author.mid || 0,
      name: author.name || '',
      face: author.face || '',
      pub_time: author.pub_time || '',
      pub_action: author.pub_action || ''
    },
    // 动态正文
    content: content,
    // 统计数据
    stat: {
      like: ms.like ? ms.like.count : 0,
      forward: ms.forward ? ms.forward.count : 0,
      comment: ms.comment ? ms.comment.count : 0,
      view: ms.view ? ms.view.count : 0
    },
    // 主体 (统一结构)
    major: major,
    // 转发: 原动态的完整信息
    orig: orig,
    // 相关内容卡片 (游戏/商品/预约/投票…)
    additional: parseDynamicAdditional(md.additional),
    // 评论对象: 不同动态类型评论挂在不同对象上 (视频 aid / 相册 id / 动态 id …)
    comment: {
      oid: commentOid,
      type: commentType
    }
  };
}

/**
 * 动态类型 → 评论对象类型 (basic.comment_type 拿不到时的兜底)
 *
 * 真机实测:
 *   DYNAMIC_TYPE_AV      → 1  (视频 aid)
 *   DYNAMIC_TYPE_ARTICLE → 12 (专栏 cv 号)
 *   DYNAMIC_TYPE_DRAW    → 11 (相册 id)
 *   DYNAMIC_TYPE_FORWARD → 17 (动态本身 id)
 */
const FALLBACK_COMMENT_TYPE = {
  DYNAMIC_TYPE_AV: DYNAMIC_COMMENT_TYPE.VIDEO,
  DYNAMIC_TYPE_UGC_SEASON: DYNAMIC_COMMENT_TYPE.VIDEO,
  DYNAMIC_TYPE_PGC: DYNAMIC_COMMENT_TYPE.VIDEO,
  DYNAMIC_TYPE_PGC_UNION: DYNAMIC_COMMENT_TYPE.VIDEO,
  DYNAMIC_TYPE_ARTICLE: DYNAMIC_COMMENT_TYPE.ARTICLE,
  DYNAMIC_TYPE_DRAW: DYNAMIC_COMMENT_TYPE.DRAW,
  DYNAMIC_TYPE_MUSIC: DYNAMIC_COMMENT_TYPE.MUSIC,
  DYNAMIC_TYPE_MEDIALIST: DYNAMIC_COMMENT_TYPE.MEDIALIST,
  DYNAMIC_TYPE_WORD: DYNAMIC_COMMENT_TYPE.WORD,
  DYNAMIC_TYPE_FORWARD: DYNAMIC_COMMENT_TYPE.WORD,
  DYNAMIC_TYPE_COMMON_SQUARE: DYNAMIC_COMMENT_TYPE.WORD,
  DYNAMIC_TYPE_LIVE: DYNAMIC_COMMENT_TYPE.WORD,
  DYNAMIC_TYPE_LIVE_RCMD: DYNAMIC_COMMENT_TYPE.WORD
};

// ============ 旧协议 (api.vc.bilibili.com) - 备用 ============
// 关注的最新动态
// 端点: GET /dynamic_svr/v1/dynamic_svr/dynamic_new
export async function getDynamicNew(uid, { type_list = 268435455 } = {}) {
  return get('/dynamic_svr/v1/dynamic_svr/dynamic_new', {
    useVc: true,
    query: { uid, type_list },
    needCookie: true
  });
}

// 关注动态下一页
// 端点: GET /dynamic_svr/v1/dynamic_svr/dynamic_history
export async function getDynamicHistory(uid, { offset_dynamic_id, type_list = 268435455 } = {}) {
  return get('/dynamic_svr/v1/dynamic_svr/dynamic_history', {
    useVc: true,
    query: { uid, type_list, offset_dynamic_id },
    needCookie: true
  });
}

// ============ 解析辅助 ============
// 解析 web 端 dynamic item, 提取附件 (视频/合集/专栏/图片等)
export function extractArchive(dynamicItem) {
  if (!dynamicItem) return null;
  const m = dynamicItem.modules && dynamicItem.modules.module_dynamic;
  if (!m || !m.major) return null;

  const majorType = m.major.type;

  // 视频
  if (majorType === 'MAJOR_TYPE_ARCHIVE' && m.major.archive) {
    const a = m.major.archive;
    return {
      type: 'archive',
      bvid: a.bvid,
      aid: a.aid,
      cid: a.cid,
      title: a.title,
      pic: a.cover,
      desc: a.desc,
      duration: a.duration_text,
      stat: a.stat
    };
  }

  // 合集
  if (majorType === 'MAJOR_TYPE_UGC_SEASON' && m.major.ugc_season) {
    const a = m.major.ugc_season;
    return {
      type: 'ugc_season',
      title: a.title || '',
      pic: a.cover || '',
      desc: a.desc || '',
      duration: a.duration_text || '',
      stat: a.stat
    };
  }

  // 专栏
  if (majorType === 'MAJOR_TYPE_ARTICLE' && m.major.article) {
    const a = m.major.article;
    return {
      type: 'article',
      title: a.title || '',
      pic: (a.covers && a.covers[0]) || '',
      desc: a.desc || '',
      label: a.label || ''
    };
  }

  // 带图动态
  if (majorType === 'MAJOR_TYPE_DRAW' && m.major.draw) {
    const a = m.major.draw;
    return {
      type: 'draw',
      items: (a.items || []).map(it => it.src)
    };
  }

  // 图文动态 (opus)
  if (majorType === 'MAJOR_TYPE_OPUS' && m.major.opus) {
    const a = m.major.opus;
    return {
      type: 'opus',
      title: a.title || '',
      pic: (a.pics && a.pics[0]) || '',
      desc: a.summary ? a.summary.text : ''
    };
  }

  // 直播
  if (majorType === 'MAJOR_TYPE_LIVE' && m.major.live) {
    const a = m.major.live;
    return {
      type: 'live',
      title: a.title || '',
      pic: a.cover || '',
      desc: a.desc || ''
    };
  }

  return null;
}

// 解析 web 端 dynamic item, 提取作者
export function extractAuthor(dynamicItem) {
  const a = dynamicItem.modules && dynamicItem.modules.module_author;
  if (!a) return null;
  return {
    mid: a.mid,
    name: a.name,
    face: a.face
  };
}

// 解析 web 端 dynamic item, 提取发布时间
export function extractPubTime(dynamicItem) {
  const a = dynamicItem.modules && dynamicItem.modules.module_author;
  if (!a || !a.pub_ts) return 0;
  return a.pub_ts;
}

// 解析 web 端 dynamic item, 提取文字内容
export function extractText(dynamicItem) {
  const m = dynamicItem.modules && dynamicItem.modules.module_dynamic;
  if (!m) return '';
  if (m.desc && m.desc.text) return m.desc.text;
  if (m.major && m.major.opus && m.major.opus.summary && m.major.opus.summary.text) {
    return m.major.opus.summary.text;
  }
  return '';
}
