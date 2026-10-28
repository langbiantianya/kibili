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
