import { writable, get } from 'svelte/store';
import { persist } from './persist.js';
import { getHistory } from '../api/user.js';
import { isLogin } from './user.js';

const CACHE_KEY = 'history:v1';
const MAX_LOCAL = 200;

const initial = persist.load(CACHE_KEY, { items: [], updatedAt: 0 });

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
      bvid: v.bvid || ('av' + v.aid),
      aid: v.aid,
      cid: v.cid,
      title: v.title,
      pic: v.pic,
      owner: v.owner ? { mid: v.owner.mid, name: v.owner.name } : null,
      duration: v.duration,
      viewAt: v.view_at,
      progress: v.progress
    }));
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
