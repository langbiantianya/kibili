// 视频互动 (Like / Coin / Fav / Triple) + 评论
// 端点参考: SocialSisterYi/bilibili-API-collect/docs/video/action.md
//           SocialSisterYi/bilibili-API-collect/docs/comment/

import { get, post } from './bili.js';
import { get as getStore } from 'svelte/store';
import { user } from '../stores/user.js';

function requireLogin() {
  const u = getStore(user);
  if (!u.sessdata && !u.accessToken) {
    throw Object.assign(new Error('NOT_LOGIN'), { code: -101 });
  }
  // 优先用 web csrf
  if (!u.bili_jct) {
    throw Object.assign(new Error('NO_CSRF'), { code: -101 });
  }
  return u;
}

// ============ 评论 ============
// 获取评论列表
// 端点: GET /x/v2/reply
// type=1 = 视频; sort: 0=时间 / 1=点赞 / 2=回复(热门) / 3=按回复
export async function getReplies(oid, { pn = 1, ps = 20, sort = 2, nohot = 0 } = {}) {
  return get('/x/v2/reply', {
    query: { type: 1, oid, pn, ps, sort, nohot },
    needCookie: true
  });
}

// 获取指定评论的回复（子评论）
// 端点: GET /x/v2/reply/reply
// root: 根评论 rpid; type=1 = 视频
export async function getSubReplies(oid, root, { pn = 1, ps = 20 } = {}) {
  return get('/x/v2/reply/reply', {
    query: { type: 1, oid, root, pn, ps },
    needCookie: true
  });
}

// 发表评论 (需登录 + bili_jct)
// 端点: POST /x/v2/reply/add
export async function addReply(oid, message, { root = 0, parent = 0, plat = 1 } = {}) {
  const u = requireLogin();
  const body = 'oid=' + oid +
               '&type=1' +
               '&root=' + root +
               '&parent=' + parent +
               '&message=' + encodeURIComponent(message) +
               '&plat=' + plat +
               '&csrf=' + u.bili_jct;
  return post('/x/v2/reply/add', body, { needCookie: true });
}

// 点赞/取消点赞评论
// 端点: POST /x/v2/reply/action
export async function likeReply(oid, rpid, action = 1) {
  const u = requireLogin();
  const body = 'oid=' + oid + '&type=1&rpid=' + rpid + '&action=' + action + '&csrf=' + u.bili_jct;
  return post('/x/v2/reply/action', body, { needCookie: true });
}

// ============ 互动 (点赞 / 投币 / 收藏 / 三连) ============
// 端点参考: SocialSisterYi/bilibili-API-collect/docs/video/action.md

// 点赞视频 (like: 1=点赞 / 2=取消)
// 端点: POST /x/web-interface/archive/like
export async function likeVideo(bvid, liked) {
  const u = requireLogin();
  return post('/x/web-interface/archive/like',
    'bvid=' + encodeURIComponent(bvid) + '&like=' + (liked ? 1 : 2) + '&csrf=' + u.bili_jct,
    { needCookie: true }
  );
}

// 查询当前用户是否已点赞
// 端点: GET /x/web-interface/archive/has/like
export async function hasLike(bvid) {
  const u = getStore(user);
  if (!u.sessdata) return 0;
  try {
    const d = await get('/x/web-interface/archive/has/like', {
      query: { bvid },
      needCookie: true
    });
    return d || 0;
  } catch (e) {
    return 0;
  }
}

// 投币 (multiply: 1 或 2; select_like: 1=同时点赞)
// 端点: POST /x/web-interface/coin/add
export async function coinVideo(bvid, multiply = 1, select_like = 0) {
  const u = requireLogin();
  return post('/x/web-interface/coin/add',
    'bvid=' + encodeURIComponent(bvid) + '&multiply=' + multiply + '&select_like=' + select_like + '&csrf=' + u.bili_jct,
    { needCookie: true }
  );
}

// 查询当前用户已投币数
// 端点: GET /x/web-interface/archive/coins
export async function getCoinCount(bvid) {
  const u = getStore(user);
  if (!u.sessdata) return 0;
  try {
    const d = await get('/x/web-interface/archive/coins', {
      query: { bvid },
      needCookie: true
    });
    return d || 0;
  } catch (e) {
    return 0;
  }
}

// 一键三连 (赞+币+藏)
// 端点: POST /x/web-interface/archive/like/triple
export async function tripleAction(bvid) {
  const u = requireLogin();
  return post('/x/web-interface/archive/like/triple',
    'bvid=' + encodeURIComponent(bvid) + '&csrf=' + u.bili_jct,
    { needCookie: true }
  );
}

// 收藏到指定文件夹
// 端点: POST /medialist/gateway/coll/resource/deal
export async function favVideo(bvid, { add_media_ids = '', del_media_ids = '' } = {}) {
  const u = requireLogin();
  const body = 'rid=' + encodeURIComponent(bvid) +
               '&type=2' +
               '&add_media_ids=' + encodeURIComponent(add_media_ids) +
               '&del_media_ids=' + encodeURIComponent(del_media_ids) +
               '&csrf=' + u.bili_jct;
  return post('/medialist/gateway/coll/resource/deal', body, { needCookie: true });
}

// 取消收藏 (从指定文件夹移除)
export async function unfavVideo(bvid, del_media_ids) {
  const u = requireLogin();
  const body = 'rid=' + encodeURIComponent(bvid) +
               '&type=2' +
               '&add_media_ids=' +
               '&del_media_ids=' + encodeURIComponent(del_media_ids || '') +
               '&csrf=' + u.bili_jct;
  return post('/medialist/gateway/coll/resource/deal', body, { needCookie: true });
}

// 查询是否已收藏
// 端点: GET /x/v2/fav/video/favoured
export async function hasFav(bvid) {
  const u = getStore(user);
  if (!u.sessdata) return 0;
  try {
    const d = await get('/x/v2/fav/video/favoured', {
      query: { bvid },
      needCookie: true
    });
    return (d && d.favoured) ? 1 : 0;
  } catch (e) {
    return 0;
  }
}

// 一次拉取所有状态 (点赞/投币/收藏)
export async function getStatus(bvid) {
  const u = getStore(user);
  if (!u.sessdata) return { like: 0, coin: 0, fav: 0 };
  try {
    const [liked, coined, faved] = await Promise.all([
      hasLike(bvid),
      getCoinCount(bvid),
      hasFav(bvid)
    ]);
    return { like: liked, coin: coined, fav: faved };
  } catch (e) {
    return { like: 0, coin: 0, fav: 0 };
  }
}

// 分享 (顺带加分享数)
// 端点: POST /x/web-interface/share/add
export async function shareVideo(bvid) {
  const u = requireLogin();
  return post('/x/web-interface/share/add',
    'bvid=' + encodeURIComponent(bvid) + '&csrf=' + u.bili_jct,
    { needCookie: true }
  );
}
