// 媒体元素播放相关的小工具
//
// ── 为什么需要 safePlay ────────────────────────────────────────────────
// KaiOS 2.4 (Gecko 48) 的 HTMLMediaElement.play() 有两个坑:
//
//   1. **它不返回 Promise** (返回 undefined) ——
//      规范里 play() 返回 Promise 是 Firefox 50 才实现的, Gecko 48 上
//      写 `el.play().catch(() => {})` 会直接抛
//      "Cannot read property 'catch' of undefined"。
//   2. 它自己也可能**同步抛异常** (媒体还没准备好的时候)。
//
// 这两个坑都很致命: 抛出去的异常如果正好在 Svelte 的生命周期回调里
// (onMount / 响应式语句), 会把 Svelte 的 flush 打断 —— flush 抛错后
// 内部的 update_scheduled 不会复位, 整个应用从此不再更新:
// 页面冻在"加载中", 连路由都换不了, 而且不报任何错 (Promise 链里的
// 异常在老 Gecko 上既不触发 onerror 也没有 unhandledrejection 事件)。
//
// 真机上就是这么冻过一次 (听视频页 onMount 里调 play() 抛了)。
// 所以: 全项目的 play() 都走 safePlay, 不再直接调。

/**
 * 安全地调 play()
 *
 * 返回值 = play() **被接受了没有** (没抛异常 / Promise 没被拒),
 * **不等于"已经在放了"**:
 * 刚设的 src 还在加载时, 老 Gecko 上 play() 返回后媒体还没真的开始播
 * (el.paused 还是 true)。"到底在不在放"要看元素的 'play' / 'pause' 事件;
 * 元素已经加载好的时候, 直接看 el.paused 也准。
 *
 * @param {HTMLMediaElement|HTMLVideoElement|null} el
 * @param {(err: any) => void} [onFail] 播不起来时回调 (可选)
 * @returns {Promise<boolean>} resolve(true) = play() 被接受了
 */
export function safePlay(el, onFail) {
  if (!el) {
    if (onFail) onFail(new Error('没有媒体元素'));
    return Promise.resolve(false);
  }
  let p;
  try {
    p = el.play();
  } catch (e) {
    if (onFail) onFail(e);
    return Promise.resolve(false);
  }
  // 老 Gecko: play() 是同步的, 没有 Promise 可等, 也就没法知道它到底播没播起来。
  // 不抛异常就算它收下了 —— 真正在不在放, 交给 'play' / 'pause' 事件判断。
  if (!p || typeof p.then !== 'function') return Promise.resolve(true);
  return p.then(
    () => true,
    (e) => { if (onFail) onFail(e); return false; }
  );
}

/**
 * 能 seek 到的最远处 (秒); 不知道返回 0
 *
 * ⚠️ seekable 和 buffered **不是一回事**:
 *   buffered = 已经下载到本地的范围
 *   seekable = 媒体**允许**跳到的范围 (直播流就只有"已经播过的"那段)
 * 快进能不能用, 看的是 seekable。
 *
 * @param {HTMLMediaElement|HTMLVideoElement|null} el
 */
export function seekableEnd(el) {
  if (!el || !el.seekable) return 0;
  try {
    const n = el.seekable.length;
    if (!n) return 0;
    const end = el.seekable.end(n - 1);
    return isFinite(end) ? end : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * 安全地设播放位置 (媒体还没准备好时会抛 InvalidStateError)
 *
 * @param {HTMLMediaElement|HTMLVideoElement|null} el
 * @param {number} t
 */
export function safeSeek(el, t) {
  if (!el) return false;
  try {
    el.currentTime = t;
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 等媒体准备好 (loadedmetadata)
 *
 * 换源之后要跳到指定位置, **必须先等它 loadedmetadata**:
 * 媒体还没准备好时赋 currentTime 会抛 InvalidStateError,
 * 位置就停在 0 (听着像"快进没反应")。
 *
 * @param {HTMLMediaElement|HTMLVideoElement|null} el
 * @param {number} [timeoutMs] 超时 (默认 15 秒)
 * @returns {Promise<boolean>} ready 了返回 true
 */
export function waitLoaded(el, timeoutMs) {
  return new Promise(resolve => {
    if (!el) return resolve(false);
    // HAVE_METADATA = 1
    if (el.readyState >= 1) return resolve(true);
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        el.removeEventListener('loadedmetadata', onOk);
        el.removeEventListener('error', onErr);
      } catch (e) { /* ignore */ }
      resolve(ok);
    };
    const onOk = () => finish(true);
    const onErr = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs || 15000);
    try {
      el.addEventListener('loadedmetadata', onOk);
      el.addEventListener('error', onErr);
    } catch (e) {
      finish(false);
    }
  });
}
