// 整段音频缓存 (为了能快进)
//
// ── 为什么存 IndexedDB (而不是内存) ───────────────────────────────────
//
// 以前缓存是内存里的 blob: URL: 应用一关就没了, 下次想快进又得把整段
// (真机实测 4 分钟音频 m4s 约 1.85MB) 重下一遍, 手机流量白花。
// 现在音频落在 IndexedDB 里 —— 在磁盘上, 关掉应用还在, 下次直接读出来播。
//
// ── Gecko 48 (KaiOS 2.4) 的 IndexedDB 支持 ─────────────────────────────
//
// 真机 (Nokia 6300 4G / Gecko 48) 实测:
//   · IndexedDB **1.0** 的方法全都有 (put/get/delete/clear/count/
//     openCursor/createIndex/transaction) ✓
//   · 2.0 的只有一部分: store.getAll / store.getAllKeys / index.getAll 有,
//     store.getKey 没有 —— 各版本之间还会飘, 所以这个文件**一律只用 1.0 的写法**。
//   · Blob 能存进去: 2MB 存进去读出来, 字节数一模一样 ✓
//   · 应用重载之后数据还在 ✓ (换 IndexedDB 就是为了这个)
//   · navigator.storage.estimate() 没有 → 浏览器给的配额问不到,
//     只能用应用自己的上限 (设置里的「听视频缓存限制」) 管着。
//
// ⚠️ **事务里不能 await**: IndexedDB 的事务在"没有待处理请求"时会自动提交,
// 中间 await 一下 (哪怕只是等一个 Promise.resolve) 这条事务就废了
// (TransactionInactiveError)。所以下面每个事务里的请求都是**同步发出去**的,
// 结果靠 oncomplete / onsuccess 收。
//
// ── IndexedDB 打不开怎么办 ─────────────────────────────────────────────
//
// 打不开 (配额没了 / 被别的窗口占着 / 老浏览器压根没有) → 退回内存缓存:
// 少个缓存不要紧, 不能把播放搞坏。真机上没发生过, 但这条兜底必须有。
//
// ── 缓存不是无限的 ────────────────────────────────────────────────────
//
// 缓存是**多首一起存**的 (切回之前那首不用重新下), 但手机存储有限,
// 所以有个上限 (默认 50MB, 设置里的「听视频缓存限制」可以改):
//   · 缓存好新的一首之后, 占用超过上限 → 从**最早缓存的开始**删, 删到小于上限
//   · 正在播的那首**不删** (revoke 掉正在播的 blob: URL, 声音会断)
//   · 单首就超过上限 → 先留着 (它正在播), 等下一首缓存好的时候再回收它

import { writable } from 'svelte/store';

/** 默认上限: 50MB */
export const DEFAULT_CACHE_LIMIT = 50 * 1024 * 1024;

/** IndexedDB 的库名 (换名字 = 换了个空库, 旧缓存自然作废) */
const DB_NAME = 'bili-audio-cache';
/** IndexedDB 的版本 (只用到 1.0 的 API, 版本号不用乱加) */
const DB_VERSION = 1;

/**
 * 缓存的实时状态 (给设置页显示"现在占了多少")
 *
 * @type {import('svelte/store').Writable<{count: number, size: number, limit: number, active: string}>}
 */
export const cacheInfo = writable({ count: 0, size: 0, limit: DEFAULT_CACHE_LIMIT, active: '' });

// ── 状态 ────────────────────────────────────────────────────────────────

/** 用哪个后端 (IndexedDB / 内存) —— 取一次就不换了 */
let backendPromise = null;
/** 实际用的哪个后端 ('idb' / 'memory') —— 真机自动化要看这个 */
let backendKind = '';
/** 后端起不来时的错 (真机调试用) */
let initError = null;

/** 已经变成 blob: URL 的那些 (key → url) */
const urls = new Map();

/** 正在下的: key → Promise (同一首别下两遍) */
const inflight = new Map();

/** 现在的总占用 (字节) / 几首 */
let totalSize = 0;
let totalCount = 0;
/** 上限 (字节) */
let limitBytes = DEFAULT_CACHE_LIMIT;
/** 正在播的那首 (别删) */
let activeKey = '';
/** ts 计数 (给"最早缓存的"排序用) */
let tsSeq = 0;

// ── 后端: IndexedDB ─────────────────────────────────────────────────────
//
// 两个仓:
//   tracks {key, blob}      音频本体 (重)
//   meta   {key, size, ts}  大小和时间 (轻)
//
// 分成两个是因为算占用 / 回收的时候只想碰轻的那个 ——
// 一次游标扫过几十兆的音频记录太浪费, 而元数据一条才几十字节。

/**
 * @returns {Object} IndexedDB 后端
 */
function idbBackend() {
  let db = null;
  let opening = null;

  /**
   * 打开 (打不开就 reject, 上层退回内存缓存)
   *
   * ⚠️ 打开之后**要检查仓在不在**: 真机踩过一种情况 ——
   * 应用重装/重启的时候版本升级的事务被掐了, 留下一个**建好了但一个仓都没有**
   * 的空库 (IndexedDB.open 照样成功, 但里面啥都没有)。
   * 这种库必须删掉重建, 不然以后每次打开都是它, 缓存永远用不上。
   */
  function open() {
    if (db) return Promise.resolve(db);
    if (!opening) {
      opening = openOnce().catch(e => {
        // 打不开 / 是个半拉子库 → 删了重建 (只试一次)
        return deleteDb().then(() => openOnce());
      });
      // 失败了下次重试 (别把一次性的失败记一辈子)
      opening.catch(() => { opening = null; });
    }
    return opening;
  }

  /** 开一次, 仓没建上就算失败 */
  function openOnce() {
    return new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('tracks')) {
          d.createObjectStore('tracks', { keyPath: 'key' });
        }
        if (!d.objectStoreNames.contains('meta')) {
          const st = d.createObjectStore('meta', { keyPath: 'key' });
          // 按缓存时间排序 → 回收的时候从最早的开始删
          st.createIndex('ts', 'ts', { unique: false });
        }
      };
      req.onsuccess = () => {
        const d = req.result;
        // 别的窗口要升级版本 → 让路 (不然它会一直 blocked)
        d.onversionchange = () => {
          try { d.close(); } catch (err) { /* ignore */ }
          db = null;
        };
        // 仓没建上 → 当成失败, 上面会把这个库删了重建
        if (!d.objectStoreNames.contains('tracks') || !d.objectStoreNames.contains('meta')) {
          try { d.close(); } catch (err) { /* ignore */ }
          reject(new Error('IndexedDB 库里没有缓存仓 (半拉子库)'));
          return;
        }
        db = d;
        resolve(d);
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB 打不开'));
      req.onblocked = () => reject(new Error('IndexedDB 被别的窗口占着'));
    });
  }

  /** 把库删掉 (重建之前用) */
  function deleteDb() {
    return new Promise(resolve => {
      let req;
      try {
        req = indexedDB.deleteDatabase(DB_NAME);
      } catch (e) {
        resolve();
        return;
      }
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      // 被别的连接占着 → 删不掉, 下面重开还是失败 → 退回内存缓存
      req.onblocked = () => resolve();
    });
  }

  /**
   * 开一个事务, 把 fn 发出的请求跑完
   *
   * ⚠️ fn 里**只能同步发请求**, 不能 await。
   *
   * @param {string[]} stores
   * @param {string} mode
   * @param {(tx: IDBTransaction) => void} fn
   * @returns {Promise<void>}
   */
  function run(stores, mode, fn) {
    return open().then(d => new Promise((resolve, reject) => {
      let t;
      try {
        t = d.transaction(stores, mode);
      } catch (e) {
        reject(e);
        return;
      }
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error || new Error('IndexedDB 事务失败'));
      t.onabort = () => reject(t.error || new Error('IndexedDB 事务被中止'));
      try {
        fn(t);
      } catch (e) {
        try { t.abort(); } catch (err) { /* ignore */ }
        reject(e);
      }
    }));
  }

  return {
    kind: 'idb',

    /** 存一首 (音频 + 元数据, 同一个事务 → 要么都在要么都不在) */
    put(key, blob, size, ts) {
      return run(['tracks', 'meta'], 'readwrite', t => {
        t.objectStore('tracks').put({ key: key, blob: blob });
        t.objectStore('meta').put({ key: key, size: size, ts: ts });
      });
    },

    /** 取一首 (没有返回 null) */
    get(key) {
      return open().then(d => new Promise((resolve, reject) => {
        let t;
        try {
          t = d.transaction(['tracks'], 'readonly');
        } catch (e) {
          reject(e);
          return;
        }
        let out = null;
        const req = t.objectStore('tracks').get(key);
        req.onsuccess = () => { out = req.result || null; };
        req.onerror = () => reject(req.error || new Error('IndexedDB 读失败'));
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error || new Error('IndexedDB 读失败'));
      }));
    },

    /** 只改元数据 (碰到过 → 挪到"最近用过", 最后才被回收) */
    touch(key, ts) {
      return run(['meta'], 'readwrite', t => {
        const st = t.objectStore('meta');
        const req = st.get(key);
        req.onsuccess = () => {
          const rec = req.result;
          if (rec) st.put({ key: key, size: rec.size, ts: ts });
        };
      });
    },

    /** 删一首 (音频 + 元数据) */
    del(key) {
      return run(['tracks', 'meta'], 'readwrite', t => {
        t.objectStore('tracks')['delete'](key);
        t.objectStore('meta')['delete'](key);
      });
    },

    /**
     * 列出所有条目的元数据 (从老到新)
     *
     * 只读 meta 那个仓 —— 不碰音频本体。
     */
    list() {
      return open().then(d => new Promise((resolve, reject) => {
        let t;
        try {
          t = d.transaction(['meta'], 'readonly');
        } catch (e) {
          reject(e);
          return;
        }
        const out = [];
        // index('ts').openCursor() → 按 ts 从小到大 (IndexedDB 1.0 就有)
        const req = t.objectStore('meta').index('ts').openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return;                    // 扫完了
          out.push({ key: c.value.key, size: c.value.size, ts: c.value.ts });
          c['continue']();
        };
        req.onerror = () => reject(req.error || new Error('IndexedDB 扫失败'));
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error || new Error('IndexedDB 扫失败'));
      }));
    },

    /** 清掉除 keepKey 以外的 */
    clear(keepKey) {
      return this.list().then(list => {
        const victims = list.filter(r => !keepKey || r.key !== keepKey);
        if (!victims.length) return { freed: 0, count: 0, keys: [] };
        let freed = 0;
        victims.forEach(r => { freed += r.size || 0; });
        return run(['tracks', 'meta'], 'readwrite', t => {
          const ts = t.objectStore('tracks');
          const ms = t.objectStore('meta');
          victims.forEach(r => {
            ts['delete'](r.key);
            ms['delete'](r.key);
          });
        }).then(() => ({
          freed: freed,
          count: victims.length,
          keys: victims.map(r => r.key)
        }));
      });
    }
  };
}

// ── 后端: 内存 (IndexedDB 用不了时的兜底) ───────────────────────────────
//
// 接口和 IndexedDB 后端一模一样, 只是数据活不过这次运行。

function memBackend() {
  const map = new Map();   // key → {blob, size, ts}
  let seq = 0;
  return {
    kind: 'memory',

    put(key, blob, size, ts) {
      map.set(key, { blob: blob, size: size || 0, ts: ts || ++seq });
      return Promise.resolve();
    },

    get(key) {
      const r = map.get(key);
      if (!r) return Promise.resolve(null);
      return Promise.resolve({ blob: r.blob, size: r.size, ts: r.ts });
    },

    touch(key, ts) {
      const r = map.get(key);
      if (r) { r.ts = ts || ++seq; }
      return Promise.resolve();
    },

    del(key) {
      map.delete(key);
      return Promise.resolve();
    },

    list() {
      const out = [];
      map.forEach((v, k) => out.push({ key: k, size: v.size, ts: v.ts }));
      out.sort((a, b) => a.ts - b.ts);
      return Promise.resolve(out);
    },

    clear(keepKey) {
      const keys = [];
      map.forEach((v, k) => keys.push(k));
      let freed = 0;
      const cleared = [];
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (keepKey && k === keepKey) continue;
        freed += map.get(k).size || 0;
        cleared.push(k);
        map.delete(k);
      }
      return Promise.resolve({ freed: freed, count: cleared.length, keys: cleared });
    }
  };
}

// ── 后端的选择与初始化 ──────────────────────────────────────────────────

/**
 * 拿后端 (第一次调用时才真的去开 IndexedDB)
 *
 * @returns {Promise<Object>}
 */
function getBackend() {
  if (!backendPromise) {
    backendPromise = (async () => {
      let b = memBackend();
      if (typeof indexedDB !== 'undefined' && indexedDB) {
        try {
          const idb = idbBackend();
          await idb.list();          // 试一下: 打不开就在这里抛
          b = idb;
        } catch (e) {
          console.warn('[cache] IndexedDB 用不了, 退回内存缓存:', e);
          initError = { name: e && e.name, msg: String((e && (e.message || e)) || '') };
        }
      }
      backendKind = b.kind;
      // 启动时把已有的缓存算一遍 (关过应用再进来, 占用得对得上)
      const list = await b.list();
      totalCount = list.length;
      totalSize = list.reduce((s, r) => s + (r.size || 0), 0);
      tsSeq = list.reduce((m, r) => Math.max(m, r.ts || 0), 0);
      syncInfo();
      return b;
    })().catch(e => {
      console.warn('[cache] 缓存后端起不来:', e);
      backendKind = 'memory';
      initError = { name: e && e.name, msg: String((e && (e.message || e)) || '') };
      return memBackend();
    });
  }
  return backendPromise;
}

/** 把状态同步给订阅者 (设置页显示用) */
function syncInfo() {
  cacheInfo.set({
    count: totalCount,
    size: totalSize,
    limit: limitBytes,
    active: activeKey
  });
}

/**
 * 改缓存上限 (设置里改完立刻调这个)
 *
 * 改小了的话立刻回收 —— 免得用户改完 setting 缓存还占着一大块。
 *
 * @param {number} bytes 字节
 * @returns {Promise<void>} 回收完了 resolve (调用方可以不等)
 */
export function setCacheLimit(bytes) {
  const n = Number(bytes);
  limitBytes = isFinite(n) && n > 0 ? n : DEFAULT_CACHE_LIMIT;
  syncInfo();
  return evict('').catch(() => {});
}

/**
 * 现在的上限 (字节)
 */
export function getCacheLimit() {
  return limitBytes;
}

/**
 * 缓存现在什么状况 (设置页/调试用)
 *
 * @returns {{count: number, size: number, limit: number, active: string}}
 */
export function cacheStats() {
  return {
    count: totalCount,
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
 * ⚠️ 现在是**异步**的: 数据在 IndexedDB 里, 得从磁盘读出来。
 *
 * @param {string} key
 * @returns {Promise<string>} 没有缓存返回空串
 */
export function cacheGet(key) {
  if (!key) return Promise.resolve('');
  return getBackend()
    .then(b => b.get(key).then(rec => {
      if (!rec || !rec.blob) return '';
      // 碰到过 → 挪到最后 (最近用过的, 最后被回收)
      return b.touch(key, ++tsSeq).then(() => {
        const u = urls.get(key);
        if (u) return u;
        const url = makeBlobUrl(rec.blob);
        if (!url) return '';
        urls.set(key, url);
        return url;
      });
    }))
    .catch(e => {
      console.warn('[cache] 读缓存失败:', e);
      return '';
    });
}

/**
 * 整段缓存一条音频
 *
 * @param {string} key 这一首的标识 (bvid#cid)
 * @param {string} url 流地址
 * @param {(ratio: number) => void} [onProgress] 下载进度 (0~1)
 * @returns {Promise<string>} blob: URL; 失败返回空串
 */
export function cacheTrack(key, url, onProgress) {
  if (!key || !url) return Promise.resolve('');
  return getBackend().then(b => {
    // 已经缓存好了 → 直接给
    return cacheGet(key).then(hit => {
      if (hit) return hit;
      // 正在下 → 等它下完, 别下两遍
      const running = inflight.get(key);
      if (running) return running;

      const p = fetchBlob(url, onProgress)
        .then(blob => {
          if (!blob) return '';
          const size = blob.size || 0;
          return b.put(key, blob, size, ++tsSeq)
            .then(() => {
              totalSize += size;
              totalCount++;
              syncInfo();
              const u = makeBlobUrl(blob);
              if (!u) return '';
              urls.set(key, u);
              // 超了 → 从最早缓存的开始回收
              return evict(key).then(() => u);
            })
            .catch(e => {
              // 存不进去 (配额满了 / 磁盘满了) → 当缓存失败
              console.warn('[cache] 存不进 IndexedDB:', e);
              return '';
            });
        })
        .catch(() => '')
        .then(u => {
          inflight.delete(key);
          return u;
        });

      inflight.set(key, p);
      return p;
    });
  });
}

/**
 * 回收: 占用超过上限 → 从最早缓存的开始删, 删到小于上限
 *
 * 正在播的那首 / 刚缓存好的那首都不删。
 *
 * @param {string} [keepKey] 这首刚缓存好, 先留着
 * @returns {Promise<void>}
 */
function evict(keepKey) {
  if (totalSize <= limitBytes) return Promise.resolve();
  return getBackend()
    .then(b => b.list().then(list => {
      if (totalSize <= limitBytes) return;
      const victims = [];
      let size = totalSize;
      for (let i = 0; i < list.length; i++) {
        if (size <= limitBytes) break;
        const r = list[i];
        // 正在播的、刚缓存好的, 都先留着
        if (r.key === keepKey || r.key === activeKey) continue;
        victims.push(r);
        size -= r.size || 0;
      }
      if (!victims.length) return;
      return Promise.all(victims.map(r => b.del(r.key))).then(() => {
        victims.forEach(r => {
          totalSize -= r.size || 0;
          totalCount--;
          releaseUrl(r.key);
        });
        if (totalSize < 0) totalSize = 0;
        if (totalCount < 0) totalCount = 0;
        syncInfo();
      });
    }))
    .catch(e => {
      console.warn('[cache] 回收失败:', e);
    });
}

/**
 * 清缓存
 *
 * 正在播的那首**不清**: 它正被媒体元素用着, revoke 掉那个 blob: URL 声音会断。
 * 想连它一起清, 先「退出播放」。
 *
 * @param {boolean} [keepActive] true = 正在播的那首不清
 * @returns {Promise<{freed: number, count: number}>} 清掉了多少字节 / 几首
 */
export function clearCache(keepActive) {
  // ⚠️ keepActive 只是"要不要留着正在播的那首"这个意思, 真正要留的是哪一首
  // 由 activeKey 决定 (后端的 clear 收的是 key)
  const keepKey = keepActive ? activeKey : '';
  return getBackend()
    .then(b => b.clear(keepKey))
    .then(res => {
      totalSize -= res.freed;
      totalCount -= res.count;
      if (totalSize < 0) totalSize = 0;
      if (totalCount < 0) totalCount = 0;
      (res.keys || []).forEach(releaseUrl);
      syncInfo();
      return { freed: res.freed, count: res.count };
    })
    .catch(e => {
      console.warn('[cache] 清缓存失败:', e);
      return { freed: 0, count: 0 };
    });
}

/**
 * 放掉某个 key 的 blob: URL (那首被回收了)
 *
 * @param {string} key
 */
function releaseUrl(key) {
  const u = urls.get(key);
  if (!u) return;
  urls.delete(key);
  revokeBlobUrl(u);
}

/**
 * 把一个 URL 整个下载成 Blob
 *
 * @param {string} url
 * @param {(ratio: number) => void} [onProgress]
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

// ── 真机自动化用的探针 ───────────────────────────────────────────────────
//
// 跟 stores/keytest.js 一个路子: 把状态挂到 window.__audioCache 上,
// 不用人眼看屏幕, 直接
//   node scripts/device-console.js --eval 'JSON.stringify(window.__audioCache.stats())'
// 就能把实测结果拉回机器上比对 (真机上没法直接跑 node 的自测)。
if (typeof window !== 'undefined') {
  window.__audioCache = {
    /** 现在用的哪个后端: 'idb' (IndexedDB) / 'memory' (兜底) */
    backend: () => backendKind,
    /** 后端起不来的错 (null = 没问题) */
    error: () => initError,
    /** {count, size, limit, active} */
    stats: () => cacheStats(),
    /** 取一首的 blob: URL (异步) */
    get: key => cacheGet(key),
    /** 缓存一首 (异步) —— 走的是快进时那条路 */
    track: (key, url) => cacheTrack(key, url),
    /** 清缓存 (异步) */
    clear: keepActive => clearCache(keepActive)
  };

  // 模块一加载就把后端开起来 (顺便把上次留下的缓存算一遍)。
  //
  // ⚠️ 不能等到第一次用到缓存才开: 设置页那个「1.8MB / 50MB」是直接读
  // cacheInfo 的, 晚一步开的话, 刚进设置页显示的是 0 —— 跟"其实缓存还在"
  // 对不上 (上次关掉应用再进来, 占用得算得出来)。
  getBackend();
}
