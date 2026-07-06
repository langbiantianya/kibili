// Platform detection helpers for KaiOS 2.4 / Gecko 48

/**
 * 检测是否在 KaiOS 环境中运行
 * KaiOS 2.4 User-Agent 示例: Mozilla/5.0 (Mobile; rv:48.0) Gecko/48.0 Firefox/48.0 KAIOS/2.4
 */
export function isKaiOS() {
  return /KaiOS/i.test(navigator.userAgent || '');
}

/**
 * 检测 KaiOS 版本号
 * @returns {string|null} 版本号如 "2.4"，如果不是 KaiOS 返回 null
 */
export function getKaiOSVersion() {
  const match = (navigator.userAgent || '').match(/KAIOS\/(\d+\.\d+)/i);
  return match ? match[1] : null;
}

/**
 * 检测是否在输入框中（用于按键事件处理）
 * KaiOS 2.4 中，当 T9 输入法激活时，需要让出数字键
 */
export function isInputFocused(e) {
  const el = e.target;
  if (!el) return false;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * 获取设备分辨率信息
 * KaiOS 2.4 设备通常为 240x320
 */
export function getDeviceInfo() {
  return {
    width: window.innerWidth || screen.width,
    height: window.innerHeight || screen.height,
    dpr: window.devicePixelRatio || 1,
    isKaiOS: isKaiOS(),
    version: getKaiOSVersion()
  };
}

/**
 * 安全地执行 mozApps API（仅 KaiOS 可用）
 */
export function getSelf() {
  if (typeof navigator !== 'undefined' && navigator.mozApps) {
    return navigator.mozApps.getSelf();
  }
  return null;
}

/**
 * 请求 KaiOS 权限
 * @param {string} permission - 权限名称，如 'systemXHR'
 */
export function requestPermission(permission) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.mozPermissions) {
      reject(new Error('mozPermissions API not available'));
      return;
    }
    try {
      const req = navigator.mozPermissions.request(permission);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 安全获取地理位置（KaiOS 支持）
 */
export function getCurrentPosition(options) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

// Resize a Bilibili image URL with @ suffix
// e.g. https://i0.hdslb.com/bfs/archive/abc.jpg -> .../abc.jpg@160w_100h.webp
export function biliImg(url, w, h, fmt) {
  if (!url) return '';
  const f = fmt || 'jpg';
  const dim = (w ? w + 'w' : '') + (h ? '_' + h + 'h' : '');
  return url + (dim ? '@' + dim + '.' + f : '');
}

/**
 * 防抖函数（KaiOS 性能优化）
 * 减少高频事件的触发次数
 */
export function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 节流函数（KaiOS 性能优化）
 * 限制函数执行频率
 */
export function throttle(fn, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
