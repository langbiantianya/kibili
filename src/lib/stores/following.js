// 关注页的跨页面状态
//
// 关注页会被反复进出 (点一条视频 → 播放器 → 返回), 每次重进都重新拉接口:
//   1. 慢, 而且回来先闪一下 loading
//   2. 丢失"刚才在看第几条"、"刚才在视频还是动态 tab"
//
// 这里把状态放在**模块**里 —— 组件销毁也不丢:
//
//   activeTab              记住是「视频」还是「动态」
//   videos / dynamics      记住已经拉到的数据
//   videoOffset / dynOffset、videoHasMore / dynHasMore
//                          记住分页游标 (回来继续往下翻, 不用从头拉)
//   videoLoading / dynLoading 等
//                          记住"正在拉", 顺便挡住重复请求
//
// 拉取策略: **只有「手动刷新」(左软键 / 数字键 0) 或「没有缓存」时才请求**。
// 从别的页面返回时直接用缓存, 不发请求。
//
// ── 为什么"加载中"也要放在模块里 ──────────────────────────────────────
// 路由切换时 svelte-spa-router 会把路由组件整个换掉 (/home 和 /following
// 都映射到 MainLayout, 换路由 = 换组件)。换的过程中新旧两个实例会短暂共存:
// 旧实例先响应了 location 变化, 挂了一份新的关注页, 紧接着路由把整个组件
// 换掉, 又挂了一份 —— 两个实例各带一份 loading 标志, 就会各发一次请求,
// 同一页数据被追加两遍 (列表里出现重复条目)。
// 状态和请求都放在模块里, 第二个实例就会看到"已经在拉了", 不会重复发。

import { writable, get } from 'svelte/store';
import { isLogin, user } from './user.js';
import { getDynamicAll, extractArchive, extractAuthor } from '../api/dynamic.js';

function blank() {
  return {
    activeTab: 0,
    // 视频流
    videos: [],
    videoOffset: '',
    videoHasMore: true,
    videoLoading: false,
    videoLoadingMore: false,
    videoError: '',
    // 动态流
    dynamics: [],
    dynOffset: '',
    dynHasMore: true,
    dynLoading: false,
    dynLoadingMore: false,
    dynError: ''
  };
}

/**
 * 关注页数据
 * @type {import('svelte/store').Writable<Object>}
 */
export const following = writable(blank());

/**
 * 每个 tab 记住聚焦在第几条 (普通对象, **不参与渲染**)
 *
 * 用普通对象而不是 store: 焦点每移动一次就写一次, 走 store 会让整个列表
 * 跟着重算一遍 —— 在这种低配设备上不值当。
 *
 * @type {{video: number, dynamic: number}}
 */
export const followingFocus = { video: -1, dynamic: -1 };

/**
 * tab 号 → 缓存键
 * @param {number} tab 0 = 视频, 1 = 动态
 * @returns {'video'|'dynamic'}
 */
function tabKey(tab) {
  return tab === 1 ? 'dynamic' : 'video';
}

/**
 * 动态条目 → 视频卡片数据
 * @param {any} it 动态条目
 * @returns {any|null} 不是视频就返回 null
 */
function toVideo(it) {
  const v = extractArchive(it);
  if (!v) return null;
  const author = extractAuthor(it);
  const moduleStat = it.modules && it.modules.module_stat;
  return {
    bvid: v.bvid,
    cid: v.cid,
    aid: v.aid,
    title: v.title,
    pic: v.pic,
    owner: author,
    duration: v.duration,
    stat: v.stat,
    // 动态统计数据: like/forward/comment
    moduleStat: moduleStat ? {
      like: moduleStat.like ? moduleStat.like.count : 0,
      likeStatus: moduleStat.like ? moduleStat.like.status : false,
      forward: moduleStat.forward ? moduleStat.forward.count : 0,
      comment: moduleStat.comment ? moduleStat.comment.count : 0
    } : null
  };
}

/**
 * 拉取某个 tab 的数据
 *
 * - 已经在拉 → 直接返回 (挡住重复请求)
 * - 翻到底了 (hasMore=false) 且是"加载更多" → 不请求
 * - 列表为空时不管 hasMore, 照拉 —— 否则"空列表 + 到底了"会把这一页卡成空白
 *
 * @param {number} tab 0 = 视频, 1 = 动态
 * @param {boolean} [isLoadMore] 是否是"加载更多"(往下翻)
 * @returns {Promise<void>}
 */
export async function loadFollowing(tab, isLoadMore = false) {
  const isVideo = tab === 0;
  const s = get(following);

  if (isVideo) {
    if (s.videoLoading || s.videoLoadingMore) return;
    if (isLoadMore && !s.videoHasMore) return;
  } else {
    if (s.dynLoading || s.dynLoadingMore) return;
    if (isLoadMore && !s.dynHasMore) return;
  }

  if (!get(isLogin)) {
    following.update(st => (isVideo
      ? { ...st, videoError: '请先登录' }
      : { ...st, dynError: '请先登录' }));
    return;
  }

  following.update(st => (isVideo
    ? { ...st, videoLoading: !isLoadMore, videoLoadingMore: isLoadMore, videoError: '' }
    : { ...st, dynLoading: !isLoadMore, dynLoadingMore: isLoadMore, dynError: '' }));

  try {
    const d = await getDynamicAll({
      type: isVideo ? 'video' : 'all',
      offset: isVideo ? s.videoOffset : s.dynOffset
    });
    const items = (d && d.items) ? d.items : [];
    if (items.length) {
      const list = isVideo ? items.map(toVideo).filter(Boolean) : items;
      following.update(st => (isVideo
        ? {
          ...st,
          videos: st.videos.concat(list),
          videoHasMore: d.has_more !== false,
          videoOffset: d.offset || ''
        }
        : {
          ...st,
          dynamics: st.dynamics.concat(list),
          dynHasMore: d.has_more !== false,
          dynOffset: d.offset || ''
        }));
    } else {
      following.update(st => (isVideo
        ? { ...st, videoHasMore: false }
        : { ...st, dynHasMore: false }));
    }
  } catch (e) {
    following.update(st => (isVideo
      ? { ...st, videoError: e.message || '加载失败' }
      : { ...st, dynError: e.message || '加载失败' }));
  } finally {
    following.update(st => (isVideo
      ? { ...st, videoLoading: false, videoLoadingMore: false }
      : { ...st, dynLoading: false, dynLoadingMore: false }));
  }
}

/**
 * 清空某个 tab 的数据缓存 (手动刷新时用)
 *
 * 数据和"记住的焦点位置"一起清掉 —— 手动刷新后回到最上面。
 *
 * @param {number} tab 0 = 视频, 1 = 动态
 */
export function resetFollowingData(tab) {
  following.update(s => (tab === 1
    ? { ...s, dynamics: [], dynOffset: '', dynHasMore: true }
    : { ...s, videos: [], videoOffset: '', videoHasMore: true }));
  followingFocus[tabKey(tab)] = -1;
}

/**
 * 清空两个 tab 的全部缓存 (换账号时用)
 */
export function resetFollowing() {
  following.update(s => ({
    ...s,
    videos: [],
    videoOffset: '',
    videoHasMore: true,
    dynamics: [],
    dynOffset: '',
    dynHasMore: true
  }));
  followingFocus.video = -1;
  followingFocus.dynamic = -1;
}

// 换账号 (登出 / 换号) 时把缓存清掉 ——
// 关注列表是跟着账号走的, 留着上一个账号的关注不合理。
let lastMid = get(user).mid;
user.subscribe(u => {
  if (lastMid === u.mid) return;
  lastMid = u.mid;
  resetFollowing();
});
