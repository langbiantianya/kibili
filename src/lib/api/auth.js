// Web 端 QR 登录
// 端点参考: SocialSisterYi/bilibili-API-collect/docs/login/login_action/QR.md

import { get, isDev } from './bili.js';

// 1. 申请二维码 (web 端)
// 端点: GET https://passport.bilibili.com/x/passport-login/web/qrcode/generate
export async function webQrGenerate() {
  const r = await get('/x/passport-login/web/qrcode/generate', {
    usePassport: true
  });
  // 兼容: 有的响应包在 r.data, 有的直接是 { url, qrcode_key }
  if (r && r.url && r.qrcode_key) return { url: r.url, qrcode_key: r.qrcode_key };
  if (r && r.data) return { url: r.data.url, qrcode_key: r.data.qrcode_key };
  throw new Error('申请二维码失败');
}

// 2. 轮询登录态 (web 端)
// 端点: GET https://passport.bilibili.com/x/passport-login/web/qrcode/poll
//
// 返回的 data.code:
//   0     = 扫码登录成功 (data.url 含 SESSDATA/bili_jct/DedeUserID/DedeUserID__ckMd5)
//   86101 = 未扫码
//   86090 = 已扫码, 手机端未确认
//   86038 = 二维码已失效
export async function webQrPoll(qrcode_key) {
  return pollRaw(qrcode_key);
}

// raw 轮询, 返回完整响应 (包括 code=86038 等非 0 情况)
// 注意: 使用独立的 XHR, 不走 request() 的 code 校验
function pollRaw(qrcode_key) {
  return new Promise((resolve, reject) => {
    const url = isDev
      ? '/passport-proxy/x/passport-login/web/qrcode/poll?qrcode_key=' + encodeURIComponent(qrcode_key)
      : 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=' + encodeURIComponent(qrcode_key);

    const xhr = new XMLHttpRequest(!isDev ? { mozSystem: true } : undefined);
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
    // KaiOS 设备手动设 Referer/UA (dev 模式浏览器会拒绝)
    if (!isDev) {
      xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Mobile; KaiOS; rv:48.0) Gecko/48.0 Firefox/48.0 KaiOS/2.4');
      xhr.setRequestHeader('Referer', 'https://www.bilibili.com/');
    }
    xhr.responseType = 'json';
    xhr.timeout = 10000;
    xhr.onload = () => {
      let data = xhr.response;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) {}
      }
      if (data && typeof data === 'object') {
        // poll 成功时 SESSDATA/bili_jct/DedeUserID 由 Set-Cookie 下发 (新版接口 url 里只有 ticket),
        // mozSystem XHR 可以读到该响应头; 内外两层都挂上, 调用方通常只用 data.data
        let sc = '';
        try { sc = xhr.getResponseHeader('Set-Cookie') || ''; } catch (e) { sc = ''; }
        data.__setCookie = sc;
        data.__pollUrl = url;
        if (data.data && typeof data.data === 'object') {
          data.data.__setCookie = sc;
          data.data.__pollUrl = url;
        }
        resolve(data);
      } else {
        reject(new Error('invalid poll response'));
      }
    };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.ontimeout = () => reject(new Error('timeout'));
    xhr.send();
  });
}

// 3. 从登录成功的 data.url 提取 cookie
// data.url 格式: https://passport.biligame.com/crossDomain?DedeUserID=***&DedeUserID__ckMd5=***
//              &Expires=***&SESSDATA=***&bili_jct=***&gourl=...

/** @param {string} s */
function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

// 按名字取参数: 先走 URL.searchParams, 失败或缺失时用正则兜底 (兼容大小写/未规范编码的 url)
/** @param {string} url @param {string} name */
function pickParam(url, name) {
  if (!url) return '';
  try {
    const params = new URL(url).searchParams;
    const direct = params.get(name);
    if (direct) return direct;
    // 大小写不敏感兜底
    const lower = name.toLowerCase();
    for (const [k, v] of params.entries()) {
      if (k.toLowerCase() === lower && v) return v;
    }
  } catch (e) { /* url 非标准时走正则 */ }
  const m = new RegExp('[?&#]' + name + '=([^&#]*)', 'i').exec(url);
  return m ? safeDecode(m[1]) : '';
}

/** @param {string} url */
export function extractCookiesFromUrl(url) {
  const dedeUserId = pickParam(url, 'DedeUserID');
  return {
    sessdata: pickParam(url, 'SESSDATA'),
    bili_jct: pickParam(url, 'bili_jct'),
    dedeUserID: dedeUserId,
    dedeUserIDMd5: pickParam(url, 'DedeUserID__ckMd5'),
    refreshToken: pickParam(url, 'refresh_token'),
    expiresAt: Number(pickParam(url, 'Expires')) || 0
  };
}

// 从响应头 Set-Cookie 里提取 (poll 成功时 4 个 cookie 由 Gecko 合并成一个头, \n 分隔;
// SESSDATA 等值在头里是 URL 编码的, 需要解码后再发给服务端)
/** @param {string} header */
function extractCookiesFromHeader(header) {
  const out = { sessdata: '', bili_jct: '', dedeUserID: '', dedeUserIDMd5: '', refreshToken: '', expiresAt: 0 };
  if (!header) return out;
  const parts = String(header).split(/[\r\n]+|,(?=[^;=\s]+=)/);
  for (const p of parts) {
    const kv = p.split(';')[0];
    const eq = kv.indexOf('=');
    if (eq < 0) continue;
    const k = kv.slice(0, eq).trim();
    const raw = kv.slice(eq + 1).trim();
    if (/^expires$/i.test(k)) { out.expiresAt = Number(raw) || 0; continue; }
    const v = safeDecode(raw);
    if (/^SESSDATA$/i.test(k)) out.sessdata = v;
    else if (/^bili_jct$/i.test(k)) out.bili_jct = v;
    else if (/^DedeUserID$/i.test(k)) out.dedeUserID = v;
    else if (/^DedeUserID__ckMd5$/i.test(k)) out.dedeUserIDMd5 = v;
    else if (/^refresh_token$/i.test(k)) out.refreshToken = v;
  }
  return out;
}

// 综合提取: url 参数 → Set-Cookie 响应头
// 兼容调用方传外层响应 ({data:{...}, __setCookie}) 或内层 data ({url, __setCookie})
/** @param {any} data */
export function extractCookies(data) {
  if (!data) return extractCookiesFromUrl('');
  const inner = data.data && typeof data.data === 'object' ? data.data : null;
  const url = data.url || data.url_cross_domain || (inner && (inner.url || inner.url_cross_domain)) || '';
  const fromUrl = extractCookiesFromUrl(url);
  if (fromUrl.sessdata) return fromUrl;
  const header = data.__setCookie || (inner && inner.__setCookie) || '';
  const fromHeader = extractCookiesFromHeader(header);
  if (fromHeader.sessdata) return fromHeader;
  return fromUrl;   // 仍可能为空, 由调用方决定下一步
}
