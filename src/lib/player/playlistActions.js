// 播放列表的手势 (各个列表页共用)
//
// ── 怎么知道"用户选中了哪个视频" ──────────────────────────────────────
// 列表项是 <div role="button" data-navable>, DOM 上不带视频信息,
// 所以给它们加一个 data-bvid (见 components/FeedCard.svelte),
// 菜单动作执行时读**最近获得焦点的那个元素**的 data-bvid, 就能知道是哪个。
// (roving.js 的 lastFocusedElement() 记着最后被聚焦的元素)

import { lastFocusedElement } from '../keyboard/roving.js';
import { addToPlaylist, replacePlaylist } from '../stores/player.js';
import { showToast } from '../stores/ui.js';
import { getFavResources } from '../api/user.js';

/**
 * 最近获得焦点的元素上的某个 data-* 属性
 *
 * @param {string} name 属性名 (不带 data-)
 * @returns {string} 没有就返回空串
 */
export function focusedAttr(name) {
  const el = lastFocusedElement();
  if (!el || typeof el.getAttribute !== 'function') return '';
  return el.getAttribute('data-' + name) || '';
}

/**
 * 把当前选中的视频加进听视频播放列表
 *
 * @param {Array} items 页面的视频数组 (拿 bvid 找完整信息)
 * @returns {boolean} 有没有真的加进去
 */
export function addFocusedToPlaylist(items) {
  const bvid = focusedAttr('bvid');
  if (!bvid) {
    showToast('先选中一个视频');
    return false;
  }
  const item = (items || []).find(v => v && v.bvid === bvid);
  if (!item) {
    showToast('先选中一个视频');
    return false;
  }
  const added = addToPlaylist(item);
  showToast(added ? '✓ 已添加到播放列表' : '已经在播放列表里了');
  return added;
}

/**
 * 拉一个收藏夹里的全部视频 (纯函数, 不写任何 store)
 *
 * @param {number|string} media_id 收藏夹 id
 * @returns {Promise<Array>} 视频数组
 */
export async function loadFolderItems(media_id) {
  const all = [];
  for (let pn = 1; pn <= 50; pn++) {
    let d = null;
    try {
      d = await getFavResources(media_id, { pn, ps: 20, order: 'mtime' });
    } catch (e) {
      break;
    }
    if (!d || !d.medias || !d.medias.length) break;
    all.push(...d.medias);
    if (!d.has_more) break;
  }
  return all.map(m => ({
    bvid: m.bvid || (m.link ? m.link.replace(/^https?:\/\/www\.bilibili\.com\/video\//, '').split(/[/?]/)[0] : ''),
    cid: m.id,
    title: m.title,
    pic: m.cover,
    owner: m.upper ? { mid: m.upper.mid, name: m.upper.name } : null,
    duration: m.duration
  })).filter(v => v.bvid);
}

/**
 * 用整个收藏夹**替换**播放列表
 *
 * @param {Object} folder { id, title }
 * @returns {Promise<number>} 放进去几个
 */
export async function replacePlaylistWithFolder(folder) {
  if (!folder || !folder.id) {
    showToast('先选中一个收藏夹');
    return 0;
  }
  showToast('正在添加收藏夹...');
  let items = [];
  try {
    items = await loadFolderItems(folder.id);
  } catch (e) {
    showToast('收藏夹加载失败');
    return 0;
  }
  if (!items.length) {
    showToast('这个收藏夹是空的');
    return 0;
  }
  replacePlaylist(items, folder.title || '收藏夹');
  showToast('✓ 播放列表已换成「' + (folder.title || '收藏夹') + '」(' + items.length + ' 首)');
  return items.length;
}
