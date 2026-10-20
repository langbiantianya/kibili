// 用户信息 / 历史记录 / 关注 / 收藏夹 / 关系 / 搜索建议
// 端点参考: alittlehuaji/bilibili-api-collect-mirror/docs/user/

import { get } from './bili.js';
import { get as getStore } from 'svelte/store';
import { user } from '../stores/user.js';

// ============ 用户信息 ============
// 当前登录用户信息
// 端点: GET /x/web-interface/nav
// 返回: mid, uname, face, isLogin, level, vip, wallet, wbi_img
export async function getNav() {
  return get('/x/web-interface/nav', { needCookie: true });
}


// 当前登录用户的统计 (关注数/粉丝数/动态数)
// 端点: GET /x/web-interface/nav/stat
export async function getNavStat() {
  return get('/x/web-interface/nav/stat', { needCookie: true });
}

// 用户空间信息 (wbi 签名版)
// 端点: GET /x/space/wbi/acc/info
export async function getUserSpace(mid) {
  return get('/x/space/wbi/acc/info', { query: { mid }, wbi: true });
}

// 用户空间信息 (非 wbi 版, 返回 card)
// 端点: GET /x/web-interface/card
export async function getUserCard(mid, photo = false) {
  return get('/x/web-interface/card', { query: { mid, photo: photo ? 1 : 0 } });
}

// ============ 用户主页 ============

// 用户主页资料: 名片 + 空间详细信息
//
// 名片 (x/web-interface/card): 昵称/头像/签名/等级/粉丝数/关注数/投稿数/认证
// 空间详细信息 (x/space/wbi/acc/info): 性别/生日/空间简介/是否已关注
//
// 两个接口分开拉, 互不影响 —— 有的账号空间接口会 -403 (私密/风控),
// 但名片照样能用, 页面至少能显示头像昵称
export async function getUserProfile(mid) {
  const parts = await Promise.all([
    getUserCard(mid).catch(() => null),
    getUserSpace(mid).catch(() => null)
  ]);
  return { card: parts[0], space: parts[1] };
}

// 用户投稿视频
// 端点: GET /x/space/arc/search
//
// 用**非 wbi** 的老端点: wbi 版 (x/space/wbi/arc/search) 在设备上会被风控挡掉
// (-403 访问权限不足 / -352 风控校验失败), 因为它还要求 dm_img_list/dm_img_str
// 这两个风控参数。老端点不用签名, 实测能正常返回。
// 返回: { list: { vlist: [...] }, page: { count, pn, ps } }
// vlist 里的字段是扁平的 (play/comment/length/author), 用 mapUserVideo 转成
// FeedCard 认识的形状
export async function getUserVideos(mid, { pn = 1, ps = 30, order = 'pubdate' } = {}) {
  return get('/x/space/arc/search', { query: { mid, pn, ps, order } });
}

// 投稿列表条目 → FeedCard 的形状
// 投稿接口的字段是扁平的, 动态/推荐流的字段是嵌套的, 这里补齐
export function mapUserVideo(v) {
  return {
    bvid: v.bvid,
    aid: v.aid,
    title: v.title,
    pic: v.pic,
    duration: v.length || '',
    owner: { mid: v.mid, name: v.author || '' },
    stat: {
      play: v.play || 0,
      comment: v.comment || 0,
      danmaku: v.video_review || 0
    },
    // FeedCard 的评论数读的是 moduleStat.comment
    moduleStat: { comment: v.comment || 0 }
  };
}

// 关系状态数 (关注/粉丝/悄悄关注/黑名单)
// 端点: GET /x/relation/stat
export async function getRelationStat(vmid) {
  return get('/x/relation/stat', { query: { vmid }, needCookie: true });
}

// ============ 历史记录 ============
// 端点: GET /x/web-interface/history/cursor
export async function getHistory({ max = null, view_at = null, business = 'archive', ps = 30, type = 'archive' } = {}) {
  const query = { business, ps, type };
  if (max != null) query.max = max;
  if (view_at != null) query.view_at = view_at;
  return get('/x/web-interface/history/cursor', { query, needCookie: true });
}

// 删除单条历史 (kid 格式 archive_avid 或 pgc_ssid)
// 端点: POST /x/v2/history/delete
export async function deleteHistory(kid) {
  const u = getStore(user);
  if (!u.bili_jct) throw new Error('NO_CSRF');
  return import('./bili.js').then(({ post }) =>
    post('/x/v2/history/delete',
      'kid=' + encodeURIComponent(kid) + '&csrf=' + u.bili_jct,
      { needCookie: true }
    )
  );
}

// 清空历史
// 端点: POST /x/v2/history/clear
export async function clearHistory() {
  const u = getStore(user);
  if (!u.bili_jct) throw new Error('NO_CSRF');
  return import('./bili.js').then(({ post }) =>
    post('/x/v2/history/clear',
      'csrf=' + u.bili_jct,
      { needCookie: true }
    )
  );
}

// ============ 稍后再看 ============
// 端点: GET /x/v2/history/toview
export async function getToview() {
  return get('/x/v2/history/toview', { needCookie: true });
}

// 端点: POST /x/v2/history/toview/add
export async function addToview(bvid) {
  const u = getStore(user);
  if (!u.bili_jct) throw new Error('NO_CSRF');
  return import('./bili.js').then(({ post }) =>
    post('/x/v2/history/toview/add',
      'bvid=' + encodeURIComponent(bvid) + '&csrf=' + u.bili_jct,
      { needCookie: true }
    )
  );
}

// 端点: POST /x/v2/history/toview/del
export async function delToview(bvid) {
  const u = getStore(user);
  if (!u.bili_jct) throw new Error('NO_CSRF');
  return import('./bili.js').then(({ post }) =>
    post('/x/v2/history/toview/del',
      'bvid=' + encodeURIComponent(bvid) + '&csrf=' + u.bili_jct,
      { needCookie: true }
    )
  );
}

// ============ 关注列表 + 关系 ============
// 关注列表
// 端点: GET /x/relation/followings
// vmid: 目标 mid (自己的 mid 可看全部, 别人最多 100)
export async function getFollowings(vmid, { pn = 1, ps = 50, order = 'desc' } = {}) {
  return get('/x/relation/followings', {
    query: { vmid, pn, ps, order },
    needCookie: true
  });
}

// 关注 / 取关
// 端点: POST /x/relation/modify
// act: 1=关注 / 2=取关 / 5=拉黑 / 6=取消拉黑
export async function modifyRelation(fid, act, re_src = 11) {
  const u = getStore(user);
  if (!u.bili_jct) throw new Error('NO_CSRF');
  return import('./bili.js').then(({ post }) =>
    post('/x/relation/modify',
      'fid=' + fid + '&act=' + act + '&re_src=' + re_src + '&csrf=' + u.bili_jct,
      { needCookie: true }
    )
  );
}

// 关注分组列表
// 端点: GET /x/relation/tags
export async function getFollowTags(vmid) {
  return get('/x/relation/tags', { query: { vmid }, needCookie: true });
}

// ============ 收藏夹 (v3 标准端点) ============
// 收藏夹列表
// 端点: GET /x/v3/fav/folder/created/list-all
export async function getFavFolders(up_mid, { pn = 1, ps = 20, type = 2 } = {}) {
  return get('/x/v3/fav/folder/created/list-all', {
    query: { up_mid, pn, ps, type },
    needCookie: true
  });
}

// 收藏夹详情 (单个)
// 端点: GET /x/v3/fav/folder/info
export async function getFavInfo(media_id) {
  return get('/x/v3/fav/folder/info', { query: { media_id }, needCookie: true });
}

// 收藏夹内容
// 端点: GET /x/v3/fav/resource/list
export async function getFavResources(media_id, { pn = 1, ps = 20, order = 'mtime', tid = 0, keyword = '' } = {}) {
  const query = { media_id, pn, ps, order, platform: 'web' };
  if (tid) query.tid = tid;
  if (keyword) query.keyword = keyword;
  return get('/x/v3/fav/resource/list', { query, needCookie: true });
}

// 收藏夹内容 id 列表 (轻量)
// 端点: GET /x/v3/fav/resource/ids
export async function getFavResourceIds(media_id) {
  return get('/x/v3/fav/resource/ids', { query: { media_id, platform: 'web' }, needCookie: true });
}

// 批量获取收藏资源
// 端点: GET /x/v3/fav/resource/infos
export async function getFavResourcesInfos(resources) {
  return get('/x/v3/fav/resource/infos', { query: { resources, platform: 'web' } });
}

// ============ 搜索 ============
// 搜索建议 (实时搜索下拉)
// 端点: GET https://s.search.bilibili.com/main/suggest
export async function getSearchSuggest(term) {
  return get('/main/suggest', {
    useSearch: true,
    query: { term, main_ver: 'v1', highlight: '' }
  });
}

// 综合搜索 (wbi 签名)
// 端点: GET /x/web-interface/wbi/search/all/v2
export async function searchAll(keyword, { page = 1 } = {}) {
  return get('/x/web-interface/wbi/search/all/v2', {
    query: { keyword, page },
    wbi: true,
    needCookie: true
  });
}

// 分类搜索视频 (wbi 签名)
// 端点: GET /x/web-interface/wbi/search/type
// order: totalrank / click / pubdate / dm / stow / scores
// duration: 0=全部 / 1=<10min / 2=10-30min / 3=30-60min / 4=>60min
// tids: 分区 tid 列表 (0=全部分区)
export async function searchVideo(keyword, { order = 'totalrank', page = 1, duration = 0, tids = 0 } = {}) {
  const query = { keyword, search_type: 'video', order, page, duration, tids: 0 };
  if (tids) query.tids = tids;
  return get('/x/web-interface/wbi/search/type', {
    query,
    wbi: true,
    needCookie: true
  });
}

// 获取热搜列表 (web端)
// 端点: GET https://s.search.bilibili.com/main/hotword
// 注意: 该接口返回 data 直接是数组, 没有 data.data 嵌套
export async function getHotSearch() {
  return get('/main/hotword', {
    useSearch: true,
    rawData: true
  });
}
