// 用户信息 / 历史记录 / 关注 / 收藏夹 / 关系 / 搜索建议
// 端点参考: SocialSisterYi/bilibili-API-collect/docs/user/

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
  const query = { keyword, order, page, duration };
  if (tids) query.tids = tids;
  return get('/x/web-interface/wbi/search/type', {
    query,
    wbi: true,
    needCookie: true
  });
}

// 获取热搜列表 (web端)
// 端点: GET https://s.search.bilibili.com/main/hotword
export async function getHotSearch() {
  return get('/main/hotword', {
    useSearch: true
  });
}
