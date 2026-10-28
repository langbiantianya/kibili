// 整段音频缓存 (为了能快进)
//
// ── 为什么需要它 ──────────────────────────────────────────────────────
// 听视频走的是 DASH 的**纯音频流** (m4s): 同样的时长只要 1/6 的流量
// (真机实测: 4 分钟音频 m4s 约 1.85MB, 音视频合一的 mp4 要 10.7MB)。
//
// 但老 Gecko (KaiOS 2.4 / Gecko 48) 边下边播这条 m4s 时, 会把它当**直播流**:
//   · duration 跟着播放头走 (播到 135 秒就报 135 秒)
//   · seekable = [[0, 已经播到的位置]] → 往后快进根本去不了
//   (m4s 是碎片 MP4, 边下边解析, 解析到哪算哪 → 看起来像直播)
//
// 把整段**先下下来**再播就不一样了: 解封装器一次拿到整个文件,
// 时长和"能跳到的范围"都算得对 → 快进就能精确落点。
//
// 真机实测 (Gecko 48):
//   直连 m4s      → dur=135.8, seekable=[[0,135.8]]  (直播流, 快不进去)
//   整段存成 Blob → dur=236,   seekable=[[0,236]]    (快进到 100 落点准确)
//
// ⚠️ 跨域: B 站的 CDN 允许跨域读这个音频地址 (实测 XHR 能拿到整段 1.85MB)。
//
// ── 缓存不是无限的 ────────────────────────────────────────────────────
// 缓存是**多首一起存**的 (切回之前那首不用重新下), 但手机存储和内存都有限,
// 所以有个上限 (默认 50MB, 设置里的「听视频缓存限制」可以改):
//   · 缓存好新的一首之后, 占用超过上限 → 从**最早缓存的开始**删, 删到小于上限
//   · 单首就超过上限 → 先留着 (它正在播, 删了就没声音了),
//     等下一首缓存好的时候再回收它
//   · 正在播的那首**不删** (revoke 掉正在播的 blob: URL, 声音会断)
//
// 缓存里的东西只在**这一次运行**里有效 (blob: URL 关掉应用就没了),
// 所以不用管"清缓存"按钮, 应用重启自然就没了。

import { writable } from 'svelte/store';

/** 默认上限: 50MB */
export const DEFAULT_CACHE_LIMIT = 50 * 1024 * 1024;

/**
 * 缓存的实时状态 (给设置页显示"现在占了多少")
 *
 * @type {import('svelte/store').Writable<{count: number, size: number, limit: number, active: string}>}
 */
export const cacheInfo = writable({ count: 0, size: 0, limit: DEFAULT_CACHE_LIMIT, active: '' });

/** 缓存条目: key → { url, size } (Map 保持插入顺序 = 最早缓存的在最前面) */
const entries = new Map();
/** 正在下的: key → Promise (同一首别下两遍) */
const inflight = new Map();

/** 现在的总占用 (字节) */
let totalSize = 0;
/** 上限 (字节) */
let limitBytes = DEFAULT_CACHE_LIMIT;
/** 正在播的那首 (别删) */
let activeKey = '';

/**
 * 改缓存上限 (设置里改完立刻调这个)
 *
 * 改小了的话立刻回收 —— 免得用户改完 setting 缓存还占着一大块。
 *
 * @param {number} bytes 字节
 */
export function setCacheLimit(bytes) {
  const n = Number(bytes);
  limitBytes = isFinite(n) && n > 0 ? n : DEFAULT_CACHE_LIMIT;
  evict(activeKey);
  syncInfo();
}

/**
 * 现在的上限 (字节)
 */
export function getCacheLimit() {
  return limitBytes;
}

/** 把当前状态同步给订阅者 (设置页显示用) */
function syncInfo() {
  cacheInfo.set({
    count: entries.size,
    size: totalSize,
    limit: limitBytes,
    active: activeKey
  });
}

/**
 * 缓存现在什么状况 (设置页/调试用)
 *
 * @returns {{count: number, size: number, limit: number, active: string}}
 */
export function cacheStats() {
  return {
    count: entries.size,
    size: totalSize,
    limit: limitBytes,
    active: activeKey
  };
}

/**
 * 正在播的是哪首 (这一首的缓存不会被回收)
 *
 * 换歌时要调: 换完之后上一首的 blob: URL 就没人用了, 可以回收。
 *
 * @param {string} key
 */
export function cacheSetActive(key) {
  activeKey = key || '';
  syncInfo();
}

/**
 * 这一首之前缓存过吗? 有的话给出它的 blob: URL
 *
 * @param {string} key
 * @returns {string} 没有缓存返回空串
 */
export function cacheGet(key) {
  if (!key) return '';
  const e = entries.get(key);
  if (!e) return '';
  // 命中 → 挪到最后 (最近用过的, 最后被回收)
  entries.delete(key);
  entries.set(key, e);
  return e.url;
}

/**
 * 整段缓存一条音频
 *
 * @param {string} key  这一首的标识 (bvid#cid)
 * @param {string} url  流地址
 * @param {(ratio: number) => void} [onProgress] 下载进度 (0~1)
 * @returns {Promise<string>} blob: URL; 失败返回空串
 */
export function cacheTrack(key, url, onProgress) {
  if (!key || !url) return Promise.resolve('');
  // 已经缓存好了 → 直接给
  const hit = cacheGet(key);
  if (hit) return Promise.resolve(hit);
  // 正在下 → 等它下完, 别下两遍
  const running = inflight.get(key);
  if (running) return running;

  const p = fetchBlob(url, onProgress)
    .then(blob => {
      if (!blob) return '';
      const u = makeBlobUrl(blob);
      if (!u) return '';
      entries.set(key, { url: u, size: blob.size || 0 });
      totalSize += blob.size || 0;
      // 刚缓存好的这首先留着, 别的按"最早缓存的先删"回收
      evict(key);
      syncInfo();
      return u;
    })
    .catch(() => '')
    .then(u => {
      inflight.delete(key);
      return u;
    });

  inflight.set(key, p);
  return p;
}

/**
 * 回收: 占用超过上限 → 从最早缓存的开始删, 删到小于上限
 *
 * @param {string} [keepKey] 这首刚缓存好 / 正在播的, 先留着
 */
function evict(keepKey) {
  if (totalSize <= limitBytes) return;
  const keys = [];
  entries.forEach((v, k) => keys.push(k));
  for (let i = 0; i < keys.length; i++) {
    if (totalSize <= limitBytes) break;
    const k = keys[i];
    // 正在播的、刚缓存好的, 都先留着
    if (k === keepKey || k === activeKey) continue;
    const e = entries.get(k);
    if (!e) continue;
    revokeBlobUrl(e.url);
    totalSize -= e.size || 0;
    entries.delete(k);
  }
}

/**
 * 清缓存
 *
 * @param {boolean} [keepActive] true = 正在播的那首不清
 *   (它正被媒体元素用着, revoke 掉那个 blob: URL 声音会断)
 * @returns {{freed: number, count: number}} 清掉了多少字节 / 几首
 */
export function clearCache(keepActive) {
  let freed = 0;
  let count = 0;
  const keys = [];
  entries.forEach((v, k) => keys.push(k));
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (keepActive && k === activeKey) continue;
    const e = entries.get(k);
    if (!e) continue;
    revokeBlobUrl(e.url);
    freed += e.size || 0;
    count++;
    entries.delete(k);
  }
  totalSize -= freed;
  if (totalSize < 0) totalSize = 0;
  syncInfo();
  return { freed: freed, count: count };
}

/**
 * 把一个 URL 整个下载成 Blob
 *
 * @param {string} url
 * @param {(ratio: number) => void} [onProgress] 进度回调 (0~1)
 * @param {number} [timeoutMs]
 * @returns {Promise<Blob|null>} 失败返回 null
 */
export function fetchBlob(url, onProgress, timeoutMs) {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    let xhr;
    try {
      xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      // responseType='blob' 在 Gecko 48 上可用 (Firefox 42+)
      xhr.responseType = 'blob';
    } catch (e) {
      return resolve(null);
    }
    let settled = false;
    const finish = (blob) => {
      if (settled) return;
      settled = true;
      resolve(blob);
    };
    xhr.onprogress = (e) => {
      if (!onProgress) return;
      try {
        if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
      } catch (err) { /* ignore */ }
    };
    xhr.onload = () => {
      if (xhr.status && xhr.status >= 400) return finish(null);
      try {
        finish(xhr.response || null);
      } catch (e) {
        finish(null);
      }
    };
    xhr.onerror = () => finish(null);
    xhr.ontimeout = () => finish(null);
    xhr.onabort = () => finish(null);
    try {
      xhr.timeout = timeoutMs || 120000;
      xhr.send();
    } catch (e) {
      finish(null);
    }
  });
}

/**
 * 造一个 blob: URL (用完记得 revoke)
 *
 * @param {Blob|null} blob
 * @returns {string} 失败返回空串
 */
export function makeBlobUrl(blob) {
  if (!blob) return '';
  try {
    if (typeof URL !== 'undefined' && URL.createObjectURL) return URL.createObjectURL(blob);
  } catch (e) { /* ignore */ }
  return '';
}

/**
 * 释放一个 blob: URL
 *
 * @param {string} url
 */
export function revokeBlobUrl(url) {
  if (!url) return;
  try {
    if (typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(url);
  } catch (e) { /* ignore */ }
}
