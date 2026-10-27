// 听视频 (纯音频播放) 的全局状态
//
// ── 三块状态 ──────────────────────────────────────────────────────────
// 1) playlist —— **本地持久化**的播放列表 (localStorage)
//    用户攒下来的歌单, 关掉应用还在。下次打开接着听。
// 2) nowPlaying / playState —— 当前在放什么、放得怎么样 (不持久化)
// 3) miniVisible —— 听视频页被"最小化"后, 底部浮一条迷你播放条
//
// 播放列表里存的是**视频信息** (bvid/cid/标题/封面), 不是播放地址 ——
// B 站的流地址带有效期 (deadline), 存下来过阵子就失效了, 每次播都重新拉。

import { writable, get } from 'svelte/store';
import { persist } from './persist.js';

const LIST_KEY = 'player:playlist:v1';

// ── 播放列表 (持久化) ────────────────────────────────────────────────
// items: [{ bvid, cid, title, pic, owner: {mid, name}, duration }]
const saved = persist.load(LIST_KEY, { items: [], label: '' });
export const playlist = writable({
  items: Array.isArray(saved && saved.items) ? saved.items : [],
  label: (saved && saved.label) || ''
});
playlist.subscribe(v => persist.save(LIST_KEY, { items: v.items, label: v.label }));

// ── 当前在放的 ────────────────────────────────────────────────────────
/** @type {import('svelte/store').Writable<any>} */
export const nowPlaying = writable(null);   // { bvid, cid, title, pic, owner, duration }

/** 播放状态: 进度条、播放/暂停、倍速 */
export const playState = writable({
  playing: false,
  time: 0,
  duration: 0,
  rate: 1,
  loading: false
});

/** 听视频页是否被"最小化"(迷你条要不要显示) */
export const miniVisible = writable(false);

/** 当前在播放列表里的第几项 (给播放列表菜单标高亮用) */
export const currentIndex = writable(-1);

/** 迷你条上显示的进度 (不跟 playState 同步更新, 免得整条列表都重渲染) */
export const miniProgress = writable(0);

// ── 播放列表操作 ──────────────────────────────────────────────────────

/**
 * 加一个视频到播放列表 (已经在里面就不重复加)
 *
 * @param {Object} item { bvid, cid, title, pic, owner, duration }
 * @returns {boolean} 是不是新加的
 */
export function addToPlaylist(item) {
  if (!item || !item.bvid) return false;
  let added = false;
  playlist.update(p => {
    if (p.items.some(v => v.bvid === item.bvid)) return p;
    added = true;
    return { ...p, items: p.items.concat([normalize(item)]) };
  });
  return added;
}

/**
 * 用一整个列表**替换**播放列表 (收藏夹 → 播放列表走这条)
 *
 * @param {Array} items
 * @param {string} label 列表名 (显示在播放列表三级菜单的标题上)
 */
export function replacePlaylist(items, label) {
  const list = (items || []).map(normalize).filter(v => v.bvid);
  playlist.set({ items: list, label: label || '播放列表' });
}

/**
 * 播放列表里删掉一项
 *
 * @param {number} index
 */
export function removeFromPlaylist(index) {
  playlist.update(p => ({
    ...p,
    items: p.items.filter((v, i) => i !== index)
  }));
}

/**
 * 清空播放列表
 */
export function clearPlaylist() {
  playlist.set({ items: [], label: '' });
}

/**
 * 统一字段 (别的地方塞进来的对象字段可能不齐)
 *
 * @param {any} v
 */
function normalize(v) {
  return {
    bvid: v.bvid || '',
    cid: v.cid || v.id || 0,
    title: v.title || '',
    pic: v.pic || v.cover || '',
    owner: v.owner ? { mid: v.owner.mid || 0, name: v.owner.name || '' } : null,
    duration: v.duration || 0
  };
}

// ── 派生状态 ──────────────────────────────────────────────────────────

/** 有没有在放东西 (迷你条要不要显示) */
export function hasNowPlaying() {
  return !!get(nowPlaying);
}

/** 播放列表长度 */
export function playlistLength() {
  return get(playlist).items.length;
}
