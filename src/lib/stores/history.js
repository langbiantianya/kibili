import { writable, get } from 'svelte/store';
import { persist } from './persist.js';
import { getHistory } from '../api/user.js';
import { isLogin } from './user.js';

const CACHE_KEY = 'history:v1';
const MAX_LOCAL = 200;

const initial = persist.load(CACHE_KEY, { items: [], updatedAt: 0 });

// 老版本存的历史记录取错了字段 (bvid 成了 "avundefined", 封面也没有),
// 这种数据留着只会显示空卡片, 直接丢掉, 等下次拉接口重新填
if (initial && Array.isArray(initial.items)) {
  initial.items = initial.items.filter(v => v && v.bvid && /^(BV|av\d)/.test(v.bvid));
}

export const history = writable(initial);
history.subscribe(v => persist.save(CACHE_KEY, v));

export async function refreshHistory() {
  if (!get(isLogin)) {
    // 未登录: 仅显示本地缓存
    return;
  }
  try {
    const all = [];
    let cursor = null;
    for (let i = 0; i < 10; i++) {  // 最多翻 10 页
      const d = await getHistory({ max: cursor, business: 'archive', ps: 30 });
      if (!d || !d.list || d.list.length === 0) break;
      all.push(...d.list);
      if (!d.has_more || !d.cursor || !d.cursor.max) break;
      cursor = d.cursor.max;
    }
    const items = all.slice(0, MAX_LOCAL).map(v => ({
      // 历史接口的字段很特别: 视频信息藏在 history 对象里, 顶层没有 bvid/aid/cid
      // (顶层只有 uri / cover / author_mid / author_name 这些)
      bvid: (v.history && v.history.bvid) || (v.bvid || ''),
      aid: (v.history && v.history.oid) || v.aid,
      cid: (v.history && v.history.cid) || v.cid,
      title: v.title,
      pic: v.cover || v.pic,
      owner: v.author_mid ? { mid: v.author_mid, name: v.author_name } : null,
      duration: v.duration,
      viewAt: v.view_at,
      progress: v.progress,
      // 历史记录不给统计 → 播放量/点赞数由列表层按需补 (见 components/FeedList.svelte)
      stat: null
    })).filter(v => v.bvid);
    history.set({ items, updatedAt: Date.now() });
  } catch (e) {
    // network error - keep local cache
  }
}

export function addLocal(item) {
  history.update(h => {
    const items = h.items.filter(x => x.bvid !== item.bvid);
    items.unshift({ ...item, viewAt: Date.now() });
    return { items: items.slice(0, MAX_LOCAL), updatedAt: Date.now() };
  });
}
