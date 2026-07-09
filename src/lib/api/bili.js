// XHR + systemXHR wrapper for Bilibili API
// 基于 SocialSisterYi/bilibili-API-collect 文档中的 web 端接口
//
// 关键点:
// - KaiOS 2.4 privileged 模式: XMLHttpRequest({mozSystem:true}) 绕过 CORS
// - 桌面 dev 调试: 走 dev server 代理 (/api-proxy, /passport-proxy) 绕过 CORS
// - Web 端请求使用 Cookie 鉴权 (SESSDATA)
// - WBI 鉴权: 2023+ 强制的反爬, 通过 wbi.js 给 query 加 wts + w_rid
//
// 接口来源: https://github.com/SocialSisterYi/bilibili-API-collect

import { get as getStore } from 'svelte/store';
import { user } from '../stores/user.js';
import { signWbi, hasWbiKeys } from './wbi.js';

// ============ 配置 ============

// const UA = 'Mozilla/5.0 (Mobile; KaiOS; rv:48.0) Gecko/48.0 Firefox/48.0 KaiOS/2.4';
const REFERER = 'https://www.bilibili.com/';

// API 基础地址 (对应 bili-apis 文档中的 web 端点)
const BASE = 'https://api.bilibili.com';
const PASSPORT = 'https://passport.bilibili.com';
const VC = 'https://api.vc.bilibili.com';
const APP_BASE = 'https://app.bilibili.com';
const SEARCH = 'https://s.search.bilibili.com';

// dev server 代理前缀 (开发环境用)
const DEV_PROXY_API = '/api-proxy';
const DEV_PROXY_PASSPORT = '/passport-proxy';
const DEV_PROXY_VC = '/vc-proxy';
const DEV_PROXY_APP = '/app-proxy';
const DEV_PROXY_SEARCH = '/search-proxy';

// Rollup 构建时静态替换
export const isDev = process.env.NODE_ENV !== 'production';

// ============ buvid 设备标识 ============
// B站风控要求 buvid3/buvid4/b_nut, 缺失会 -412
// Dev 模式由 dev server 代理注入; KaiOS 设备端手动生成

let _buvid = null;

function getBuvid() {
  if (_buvid) return _buvid;
  // 简单生成 buvid3 (32位hex) + buvid4 (UUID+时间戳) + b_nut (时间戳)
  const ts = Date.now();
  const hex32 = _randomHex(32);
  const buvid3 = hex32 + _randomHex(8);
  const buvid4 = _randomUUID() + ts;
  const b_nut = ts;
  _buvid = { buvid3, buvid4, b_nut };
  return _buvid;
}

function _randomHex(len) {
  const chars = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

function _randomUUID() {
  // 简单 UUID v4 (KaiOS 2.4 没有 crypto.randomUUID)
  const h = _randomHex;
  return h(8) + '-' + h(4) + '-4' + h(3) + '-' + h(4) + '-' + h(12);
}

// ============ XHR 工厂 ============

function makeXHR(mozSystem) {
  if (mozSystem && typeof XMLHttpRequest === 'function') {
    try { return new XMLHttpRequest({ mozSystem: true }); } catch (e) {}
  }
  return new XMLHttpRequest();
}

// 浏览器禁止 JS 设置某些头 (Referer / User-Agent / Cookie 等), 静默失败
function safeSetHeader(xhr, name, value) {
  try {
    xhr.setRequestHeader(name, value);
  } catch (e) {
    // 浏览器拒绝设置该头, 忽略
  }
}

function buildUrl(base, path, query) {
  let url = base + path;
  if (query && Object.keys(query).length) {
    const parts = [];
    Object.keys(query).forEach(k => {
      const v = query[k];
      if (v == null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    if (parts.length) url += (url.indexOf('?') >= 0 ? '&' : '?') + parts.join('&');
  }
  return url;
}

function pickBase(opts) {
  const { usePassport = false, useVc = false, useApp = false, useSearch = false } = opts;
  if (isDev) {
    if (usePassport) return DEV_PROXY_PASSPORT;
    if (useVc) return DEV_PROXY_VC;
    if (useApp) return DEV_PROXY_APP;
    if (useSearch) return DEV_PROXY_SEARCH;
    return DEV_PROXY_API;
  }
  if (usePassport) return PASSPORT;
  if (useVc) return VC;
  if (useApp) return APP_BASE;
  if (useSearch) return SEARCH;
  return BASE;
}

// ============ 核心 request ============

export function request(path, opts = {}) {
  const {
    method = 'GET',
    query = {},
    body = null,
    needCookie = false,
    usePassport = false,
    useVc = false,
    useApp = false,
    useSearch = false,
    wbi = false,             // 是否附加 wbi 签名 (wts + w_rid)
    signal = null,
    timeout = 15000
  } = opts;

  // 1. 合并 query 参数
  let finalQuery = Object.assign({}, query);

  // 2. WBI 签名 (需要在 buildUrl 之前完成)
  if (wbi) {
    if (hasWbiKeys()) {
      finalQuery = signWbi(finalQuery);
    }
    // keys 未就绪时, 仍请求但不签名 - 端点会 412, 需在调用方先 refreshWbiKeys
  }

  // 如果 path 是完整 http(s) URL, 直接用, 不加 base
  let base, url;
  if (/^https?:\/\//.test(path)) {
    base = '';
    url = buildUrl('', path, finalQuery);
  } else {
    base = pickBase({ usePassport, useVc, useApp, useSearch });
    url = buildUrl(base, path, finalQuery);
  }

  // 调试日志
  if (isDev) {
    console.log('[BILI_API] request', { method, path: url.split('?')[0], query: finalQuery });
  }

  return new Promise((resolve, reject) => {
    const xhr = makeXHR(!isDev);
    let aborted = false;

    if (signal) {
      if (signal.aborted) { aborted = true; return reject(new Error('ABORTED')); }
      signal.addEventListener('abort', () => {
        aborted = true;
        try { xhr.abort(); } catch (e) {}
        reject(new Error('ABORTED'));
      });
    }

    xhr.open(method, url, true);

    // Dev 模式: 浏览器禁止 JS 设 Referer/UA, 让浏览器走默认
    // (dev server 代理同源, B 站只检查 Referer 而非同源 Referer)
    // 注意: dev server 代理转发时不会改 Referer, B 站后端会拒 Referer != bilibili.com 的请求
    // 解决方案: 在 dev-server.js 代理里用 onProxyReq 钩子改写 Referer
    if (!isDev) {
      // xhr.setRequestHeader('User-Agent', UA);
      xhr.setRequestHeader('Referer', REFERER);
    }
    xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');

    if (body) {
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
    }

    // Cookie 处理:
    // - KaiOS 设备: 手动设置 Cookie header (mozSystem XHR 允许)
    // - Dev 模式: 浏览器禁止设置 Cookie header, 通过 X-Cookie 自定义 header 传递,
    //   dev server 代理会读取 X-Cookie 并转发为 Cookie header
    let cookie = '';
    if (needCookie) {
      const u = getStore(user);
      if (u.sessdata) {
        cookie = 'SESSDATA=' + u.sessdata;
        if (u.bili_jct) cookie += '; bili_jct=' + u.bili_jct;
      }
    }
    // KaiOS 设备端: 始终注入 buvid 设备标识 (B站风控要求, 缺失会 -412)
    // Dev 模式: 也注入 buvid, dev server 代理会读取 X-Cookie 并转发
    if (!isDev) {
      const bv = getBuvid();
      cookie += (cookie ? '; ' : '') + 'buvid3=' + bv.buvid3;
      cookie += '; buvid4=' + bv.buvid4;
      cookie += '; b_nut=' + bv.b_nut;
    } else {
      // Dev 模式: 单独注入 buvid (即使没有登录态)
      const bv = getBuvid();
      cookie += (cookie ? '; ' : '') + 'buvid3=' + bv.buvid3;
      cookie += '; buvid4=' + bv.buvid4;
      cookie += '; b_nut=' + bv.b_nut;
    }
    if (cookie) {
      if (isDev) {
        // Dev 模式: 浏览器禁止设置 Cookie, 通过 X-Cookie 传递
        xhr.setRequestHeader('X-Cookie', cookie);
      } else {
        // KaiOS 设备: mozSystem XHR 允许设置 Cookie
        xhr.setRequestHeader('Cookie', cookie);
      }
    }

    xhr.timeout = timeout;
    xhr.responseType = 'json';

    xhr.onload = () => {
      if (aborted) return;
      let data = xhr.response;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) {}
      }
      if (!data || typeof data !== 'object') {
        const err = Object.assign(new Error('invalid response'), { status: xhr.status, url });
        console.error('[BILI_API] invalid response', { status: xhr.status, url, response: xhr.response });
        return reject(err);
      }
      if (data.code !== 0) {
        const err = Object.assign(new Error(data.message || 'err'), {
          code: data.code, status: xhr.status, data, url
        });
        console.error('[BILI_API] api error', { code: data.code, message: data.message, url, data });
        return reject(err);
      }
      resolve(data.data);
    };

    xhr.onerror = () => {
      if (aborted) return;
      const err = Object.assign(new Error('network error'), { status: xhr.status, url });
      console.error('[BILI_API] network error', { status: xhr.status, url });
      reject(err);
    };
    xhr.ontimeout = () => {
      const err = Object.assign(new Error('timeout'), { status: 0, url });
      console.error('[BILI_API] timeout', { url, timeout });
      reject(err);
    };

    try {
      xhr.send(body || null);
    } catch (e) {
      reject(e);
    }
  });
}

export function get(path, opts = {}) {
  return request(path, { ...opts, method: 'GET' });
}

export function post(path, body, opts = {}) {
  return request(path, { ...opts, method: 'POST', body });
}
