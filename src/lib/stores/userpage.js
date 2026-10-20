// 用户主页的跨页面状态
//
// 用户主页会被反复进出 (从关注页的动态作者名点进来 → 看投稿 → 返回),
// 每次重进都重新拉接口的话:
//   1. 慢, 而且回来先闪一下 loading
//   2. 丢失"刚才在看第几条"、"刚才在投稿还是动态 tab"
//
// 和关注页 (stores/following.js) 同一套思路 —— 状态放在**模块**里, 组件销毁也不丢。
// 但用户主页有个额外维度: **会看不同的人**, 所以缓存按 uid 分开存:
//
//   profile / videos / dynamics  记住已经拉到的数据
//   videoPage / videoCount       记住分页游标 (回来继续往下翻)
//   dynOffset / dynHasMore       动态的翻页游标
//   各 xxxLoading                记住"正在拉", 顺便挡住重复请求
//
// 拉取策略: **只有「手动刷新」(左软键) 或「没有缓存」时才请求**。
// 从别的页面返回时直接用缓存, 不发请求。
//
// 焦点位置 (userPageFocus) 用普通对象存, 不走 store —— 焦点每动一次就写一次,
// 走 store 会让整个列表重算一遍, 这种低配设备上不值当。

import { writable, get } from 'svelte/store';
import { getUserProfile, getUserVideos } from '../api/user.js';
import { mapUserVideo } from '../api/videocard.js';
import { getDynamicSpace } from '../api/dynamic.js';

/**
 * 空的用户主页状态
 * @param {number} [uid]
 * @returns {Object}
 */
function blank(uid) {
  return {
    uid: uid || 0,
    activeTab: 0,          // 0 = 资料, 1 = 投稿, 2 = 动态
    // 个人资料 (拍平后的, 字段路径见 api/user.js 的 mapUserProfile)
    profile: null,         // { uid, name, face, sign, level, sex, birthday, official, fans, attention, archive, likeNum }
    profileLoading: false,
    profileError: '',
    // 投稿视频
    videos: [],
    videoPage: 1,
    videoCount: 0,         // 投稿总数 (接口返回)
    videoHasMore: true,
    videoLoading: false,
    videoLoadingMore: false,
    videoError: '',
    // 动态
    dynamics: [],
    dynOffset: '',
    dynHasMore: true,
    dynLoading: false,
    dynLoadingMore: false,
    dynError: ''
  };
}

/**
 * 当前用户主页的数据
 * @type {import('svelte/store').Writable<Object>}
 */
export const userPage = writable(blank(0));

/**
 * 每个 tab 记住聚焦在第几条 (普通对象, **不参与渲染**)
 * @type {{profile: number, video: number, dynamic: number}}
 */
export const userPageFocus = { profile: -1, video: -1, dynamic: -1 };

/**
 * 每个 uid 一份数据快照 + 一份焦点快照
 * @type {Object<number, Object>}
 */
const cache = {};
/** @type {Object<number, Object>} */
const focusCache = {};

/**
 * tab 号 → 缓存键
 * @param {number} tab 0 = 资料, 1 = 投稿, 2 = 动态
 * @returns {'profile'|'video'|'dynamic'}
 */
function tabKey(tab) {
  if (tab === 1) return 'video';
  if (tab === 2) return 'dynamic';
  return 'profile';
}

/**
 * 切到某个用户主页
 *
 * 同一个人 → 什么都不做 (保留已有数据和焦点)
 * 换人 → 当前这份存进缓存, 新用户有缓存就用缓存, 没有就开空白页
 *
 * @param {number} uid
 * @returns {boolean} 是否真的换了人
 */
export function switchUser(uid) {
  const id = Number(uid) || 0;
  const cur = get(userPage);
  if (cur.uid === id) return false;

  // 当前这份先存起来 (下次回来还能用)
  cache[cur.uid] = cur;
  focusCache[cur.uid] = { ...userPageFocus };

  const next = cache[id] || blank(id);
  userPage.set(next);
  const f = focusCache[id] || { profile: -1, video: -1, dynamic: -1 };
  userPageFocus.profile = f.profile;
  userPageFocus.video = f.video;
  userPageFocus.dynamic = f.dynamic;
  return true;
}

/**
 * 当前显示的用户是不是这个 uid (写回 store 前用来挡掉"人已经换了"的过期响应)
 * @param {number} uid
 * @returns {boolean}
 */
function isCurrent(uid) {
  return get(userPage).uid === Number(uid);
}

/**
 * 拉取个人资料
 *
 * @param {number} uid
 * @returns {Promise<void>}
 */
export async function loadUserProfile(uid) {
  const id = Number(uid) || 0;
  if (!id) return;
  const s = get(userPage);
  if (s.profileLoading) return;
  if (s.profile) return;   // 已经有缓存了, 不重复拉

  userPage.update(st => ({ ...st, profileLoading: true, profileError: '' }));
  try {
    const p = await getUserProfile(id);
    if (!isCurrent(id)) return;
    userPage.update(st => ({ ...st, profile: p }));
  } catch (e) {
    if (!isCurrent(id)) return;
    userPage.update(st => ({ ...st, profileError: e.message || '加载失败' }));
  } finally {
    if (isCurrent(id)) {
      userPage.update(st => ({ ...st, profileLoading: false }));
    }
  }
}

/**
 * 拉取投稿视频
 *
 * @param {number} uid
 * @param {boolean} [isLoadMore] 是否是"加载更多"(往下翻)
 * @returns {Promise<void>}
 */
export async function loadUserVideos(uid, isLoadMore = false) {
  const id = Number(uid) || 0;
  if (!id) return;
  const s = get(userPage);
  if (s.videoLoading || s.videoLoadingMore) return;
  if (isLoadMore && !s.videoHasMore) return;

  const page = isLoadMore ? s.videoPage + 1 : 1;
  userPage.update(st => ({
    ...st,
    videoLoading: !isLoadMore,
    videoLoadingMore: isLoadMore,
    videoError: ''
  }));

  try {
    const d = await getUserVideos(id, { pn: page, ps: 30 });
    if (!isCurrent(id)) return;
    const list = (d && d.list && d.list.vlist) ? d.list.vlist : [];
    const count = (d && d.page && d.page.count) ? d.page.count : 0;
    if (list.length) {
      userPage.update(st => ({
        ...st,
        videos: isLoadMore ? st.videos.concat(list.map(mapUserVideo)) : list.map(mapUserVideo),
        videoPage: page,
        videoCount: count,
        videoHasMore: list.length >= 30 && st.videos.length + list.length < count
      }));
    } else {
      userPage.update(st => ({ ...st, videoHasMore: false, videoPage: page }));
    }
  } catch (e) {
    if (!isCurrent(id)) return;
    userPage.update(st => ({ ...st, videoError: e.message || '加载失败' }));
  } finally {
    if (isCurrent(id)) {
      userPage.update(st => ({ ...st, videoLoading: false, videoLoadingMore: false }));
    }
  }
}

/**
 * 拉取动态
 *
 * @param {number} uid
 * @param {boolean} [isLoadMore] 是否是"加载更多"(往下翻)
 * @returns {Promise<void>}
 */
export async function loadUserDynamics(uid, isLoadMore = false) {
  const id = Number(uid) || 0;
  if (!id) return;
  const s = get(userPage);
  if (s.dynLoading || s.dynLoadingMore) return;
  if (isLoadMore && !s.dynHasMore) return;

  userPage.update(st => ({
    ...st,
    dynLoading: !isLoadMore,
    dynLoadingMore: isLoadMore,
    dynError: ''
  }));

  try {
    const d = await getDynamicSpace(id, { offset: isLoadMore ? s.dynOffset : '' });
    if (!isCurrent(id)) return;
    const items = (d && d.items) ? d.items : [];
    if (items.length) {
      userPage.update(st => ({
        ...st,
        dynamics: isLoadMore ? st.dynamics.concat(items) : items,
        dynHasMore: d.has_more !== false,
        dynOffset: d.offset || ''
      }));
    } else {
      userPage.update(st => ({ ...st, dynHasMore: false }));
    }
  } catch (e) {
    if (!isCurrent(id)) return;
    userPage.update(st => ({ ...st, dynError: e.message || '加载失败' }));
  } finally {
    if (isCurrent(id)) {
      userPage.update(st => ({ ...st, dynLoading: false, dynLoadingMore: false }));
    }
  }
}

/**
 * 切 tab
 *
 * @param {number} tab 0 = 资料, 1 = 投稿, 2 = 动态
 * @returns {Promise<void>}
 */
export async function setUserTab(tab) {
  const s = get(userPage);
  if (s.activeTab === tab) return;
  userPage.update(st => ({ ...st, activeTab: tab }));
  await loadUserTab(s.uid, tab);
}

/**
 * 按 tab 拉数据 (没缓存才拉)
 *
 * @param {number} uid
 * @param {number} tab
 * @returns {Promise<void>}
 */
export async function loadUserTab(uid, tab) {
  if (tab === 0) {
    await loadUserProfile(uid);
  } else if (tab === 1) {
    const s = get(userPage);
    if (!s.videos.length) await loadUserVideos(uid);
  } else {
    const s = get(userPage);
    if (!s.dynamics.length) await loadUserDynamics(uid);
  }
}

/**
 * 刷新当前 tab (清缓存重拉, 焦点回到最上面)
 *
 * @param {number} [tab] 不传就是当前 tab
 * @returns {Promise<void>}
 */
export async function refreshUserTab(tab) {
  const s = get(userPage);
  const t = tab == null ? s.activeTab : tab;
  const uid = s.uid;
  if (t === 0) {
    userPage.update(st => ({ ...st, profile: null, profileError: '' }));
    userPageFocus.profile = -1;
    await loadUserProfile(uid);
  } else if (t === 1) {
    userPage.update(st => ({
      ...st, videos: [], videoPage: 1, videoHasMore: true, videoError: ''
    }));
    userPageFocus.video = -1;
    await loadUserVideos(uid);
  } else {
    userPage.update(st => ({
      ...st, dynamics: [], dynOffset: '', dynHasMore: true, dynError: ''
    }));
    userPageFocus.dynamic = -1;
    await loadUserDynamics(uid);
  }
}

/**
 * 清空某个 uid 的全部缓存 (换账号时用)
 * @param {number} [uid] 不传就是当前
 */
export function resetUserPage(uid) {
  const s = get(userPage);
  const id = uid == null ? s.uid : Number(uid);
  if (id === s.uid) {
    userPage.set(blank(id));
  } else {
    delete cache[id];
    delete focusCache[id];
  }
  userPageFocus.profile = -1;
  userPageFocus.video = -1;
  userPageFocus.dynamic = -1;
}
