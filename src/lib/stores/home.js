// 首页推荐流的状态
//
// 和关注页一个套路 (见 stores/following.js): 数据、加载状态放**模块**级 store,
// 组件销毁也不丢 —— 从播放器/二级页返回时直接用缓存, 不重新发请求,
// 焦点也回到上次看的那一条。
//
// 之前首页把推荐流寄居在 queue (播放队列) 里, 有两个毛病:
//   1. queue 是"当前播放列表", 关注页/收藏夹/搜索结果都会往里写 ——
//      从关注页点一个视频再回首页, 首页会把"关注的视频"当成推荐流显示
//   2. 加载状态在组件里, 组件一销毁就没了; 焦点位置也没人记
//
// 拉取策略和关注页一致: **只有「手动刷新」(左软键) 或「没有缓存」时才请求**。

import { writable, get } from 'svelte/store';
import { isLogin, user } from './user.js';
import { getRecommend } from '../api/feed.js';
import { mapRecommend } from '../api/videocard.js';
import { refreshWbiKeys } from '../api/wbi.js';

function blank() {
  return {
    items: [],
    loading: false,
    loadingMore: false,
    error: '',
    hasMore: true
  };
}

/**
 * 首页推荐流
 * @type {import('svelte/store').Writable<Object>}
 */
export const homeFeed = writable(blank());

/**
 * 首页记住的焦点位置 (普通对象, **不参与渲染**)
 *
 * 用普通对象而不是 store: 焦点每移动一次就写一次, 走 store 会让整个列表
 * 跟着重算一遍 —— 在这种低配设备上不值当。
 *
 * @type {{index: number}}
 */
export const homeFocus = { index: -1 };

// 推荐流分页状态 (模块级, 组件销毁也不丢)
let feedState = {
  fresh_idx: 1,
  fresh_idx_1h: 1,
  hasMore: true
};

export function getFeedState() {
  return { ...feedState };
}

export function resetFeedState() {
  feedState = { fresh_idx: 1, fresh_idx_1h: 1, hasMore: true };
}

/**
 * 拉首页推荐 (第一页)
 *
 * 已经在拉 → 直接返回 (挡住重复请求)
 *
 * @returns {Promise<void>}
 */
export async function loadHomeFeed() {
  const s = get(homeFeed);
  if (s.loading || s.loadingMore) return;

  if (!get(isLogin)) {
    homeFeed.update(st => ({ ...st, error: '请先登录', loading: false }));
    return;
  }

  homeFeed.update(st => ({ ...st, loading: true, error: '' }));
  try {
    // 先确保 WBI keys 就绪 (其他接口可能需要)
    await refreshWbiKeys();
    // 重置分页状态
    resetFeedState();
    // 使用 feed.js 中的默认参数 (fresh_type=3, version=1, ps=8)
    const d = await getRecommend();
    // 新版推荐接口返回 data.item 数组, 旧版返回 data 数组
    const items = (d && d.item) ? d.item : ((d && Array.isArray(d)) ? d : []);
    // 更新分页状态 (如果有返回)
    if (d && typeof d.fresh_idx === 'number') feedState.fresh_idx = d.fresh_idx;
    if (d && typeof d.fresh_idx_1h === 'number') feedState.fresh_idx_1h = d.fresh_idx_1h;
    homeFeed.update(st => ({
      ...st,
      items: items.map(mapRecommend),
      hasMore: true
    }));
  } catch (e) {
    homeFeed.update(st => ({ ...st, error: e.message || '加载失败' }));
  } finally {
    homeFeed.update(st => ({ ...st, loading: false }));
  }
}

/**
 * 加载更多首页推荐 (往下翻)
 *
 * @returns {Promise<void>}
 */
export async function loadMoreHomeFeed() {
  const s = get(homeFeed);
  if (s.loading || s.loadingMore) return;
  if (!s.hasMore) return;

  homeFeed.update(st => ({ ...st, loadingMore: true }));
  try {
    await refreshWbiKeys();
    // 递增分页索引
    const nextFreshIdx = feedState.fresh_idx + 1;
    const nextFreshIdx1h = feedState.fresh_idx_1h + 1;
    const d = await getRecommend({
      fresh_idx: nextFreshIdx,
      fresh_idx_1h: nextFreshIdx1h
    });
    const items = (d && d.item) ? d.item : ((d && Array.isArray(d)) ? d : []);
    if (items.length === 0) {
      feedState.hasMore = false;
      homeFeed.update(st => ({ ...st, hasMore: false }));
      return;
    }
    // 更新分页状态
    if (d && typeof d.fresh_idx === 'number') {
      feedState.fresh_idx = d.fresh_idx;
    } else {
      feedState.fresh_idx = nextFreshIdx;
    }
    if (d && typeof d.fresh_idx_1h === 'number') {
      feedState.fresh_idx_1h = d.fresh_idx_1h;
    } else {
      feedState.fresh_idx_1h = nextFreshIdx1h;
    }
    // 追加到现有列表
    homeFeed.update(st => ({ ...st, items: st.items.concat(items.map(mapRecommend)) }));
  } catch (e) {
    // 加载更多失败, 静默处理
  } finally {
    homeFeed.update(st => ({ ...st, loadingMore: false }));
  }
}

/**
 * 手动刷新: 清掉缓存重拉
 *
 * 数据和"记住的焦点位置"一起清掉 —— 刷新后回到最上面。
 */
export function resetHomeFeed() {
  homeFeed.update(st => ({ ...st, items: [], hasMore: true, error: '' }));
  homeFocus.index = -1;
  resetFeedState();
}

// 换账号 (登出 / 换号) 时把缓存清掉 ——
// 推荐流是跟着账号走的, 留着上一个账号的推荐不合理。
let lastMid = get(user).mid;
user.subscribe(u => {
  if (lastMid === u.mid) return;
  lastMid = u.mid;
  resetHomeFeed();
});
