import { writable, get } from 'svelte/store';
import { persist } from './persist.js';
import { getFavResources } from '../api/user.js';
import { getRecommend } from '../api/feed.js';
import { getDynamicAll, getDynamicNew, extractArchive, extractAuthor } from '../api/dynamic.js';

// queue = current playlist (favorites folder, feed, or dynamic)
// items: VideoItem[] = { bvid, cid, title, pic, owner, duration }
export const queue = writable({ items: [], index: 0, source: '', label: '' });

export function pushContext(item, source) {
  queue.update(q => ({ ...q, items: [item], index: 0, source: source || q.source }));
}

// 加载收藏夹单个文件夹 (v3 标准端点, 返回 data.medias[])
export async function loadFolder(media_id, label = '收藏夹') {
  const all = [];
  let pn = 1;
  while (pn <= 50) {
    try {
      const d = await getFavResources(media_id, { pn, ps: 20, order: 'mtime' });
      if (!d || !d.medias) break;
      all.push(...d.medias);
      if (!d.has_more) break;
      pn++;
    } catch (e) {
      break;
    }
  }
  queue.set({
    items: all.map(m => ({
      bvid: m.bvid || (m.link ? m.link.replace(/^https?:\/\/www\.bilibili\.com\/video\//, '').split(/[/?]/)[0] : ''),
      cid: m.id,             // v3 收藏夹内容的 id 就是 cid
      aid: m.id,
      title: m.title,
      pic: m.cover,
      owner: m.upper ? { mid: m.upper.mid, name: m.upper.name } : null,
      duration: m.duration
    })).filter(v => v.bvid),
    index: 0,
    source: 'folder',
    label
  });
  return all.length;
}

// 加载首页推荐
export async function loadFeed() {
  // 尝试旧版接口 (version=0), 新版可能需要登录
  const d = await getRecommend({ ps: 20, version: 0, fresh_idx: 1, fresh_idx_1h: 1 });
  // 新版推荐接口返回 data.item 数组, 旧版返回 data 数组
  const items = (d && d.item) ? d.item : ((d && Array.isArray(d)) ? d : []);
  queue.set({
    items: items.map(v => ({
      bvid: v.bvid,
      cid: v.cid,
      aid: v.aid,
      title: v.title,
      pic: v.pic,
      owner: v.owner ? { mid: v.owner.mid, name: v.owner.name } : null,
      duration: v.duration,
      stat: v.stat
    })),
    index: 0,
    source: 'feed',
    label: '推荐'
  });
}

// 加载关注动态中的视频 (web 端 /x/polymer/web-dynamic/v1/feed/all)
export async function loadDynamicVideos(uid) {
  // 优先用 web 端 (字段更全)
  try {
    const d = await getDynamicAll({ type: 'video' });
    const items = (d && d.items) ? d.items : [];
    const videos = items
      .map(it => {
        const a = extractArchive(it);
        if (!a) return null;
        const author = extractAuthor(it);
        return {
          bvid: a.bvid,
          cid: a.cid,
          aid: a.aid,
          title: a.title,
          pic: a.pic,
          owner: author,
          duration: a.duration,
          stat: a.stat
        };
      })
      .filter(Boolean);
    queue.set({
      items: videos,
      index: 0,
      source: 'dynamic',
      label: '关注动态·视频'
    });
    return videos.length;
  } catch (e) {
    // 兜底: 旧协议
    const d = await getDynamicNew(uid);
    const items = (d && d.cards) ? d.cards : [];
    const videos = items
      .map(c => extractArchiveFromCard(c))
      .filter(Boolean);
    queue.set({
      items: videos,
      index: 0,
      source: 'dynamic',
      label: '关注动态·视频'
    });
    return videos.length;
  }
}

// 旧协议 card 解析
function extractArchiveFromCard(c) {
  if (!c) return null;
  const card = typeof c.card === 'string' ? JSON.parse(c.card || '{}') : c.card;
  if (!card) return null;
  if (c.desc && c.desc.type === 8) {
    return {
      bvid: c.desc.bvid,
      cid: card.cid,
      aid: card.aid,
      title: card.title,
      pic: card.pic,
      duration: card.duration
    };
  }
  return null;
}

export function next() {
  queue.update(q => ({
    ...q,
    index: Math.min(q.index + 1, Math.max(0, q.items.length - 1))
  }));
}

export function prev() {
  queue.update(q => ({
    ...q,
    index: Math.max(q.index - 1, 0)
  }));
}

export function setIndex(i) {
  queue.update(q => ({ ...q, index: i }));
}
