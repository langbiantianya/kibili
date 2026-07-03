// WBI 签名 (B 站反爬强制要求)
// 参考: SocialSisterYi/bilibili-API-collect/docs/misc/sign/wbi.md
//
// 用法:
//   import { signWbi, getWbiKeys, refreshWbiKeys } from './wbi.js';
//   await refreshWbiKeys();           // 启动时拉一次
//   const signed = signWbi({ bvid, cid, qn: 16 });
//   // 拿到的 query 包含 wts + w_rid, 可直接传给 get()

// 64 字符置换表的源表 (从 imgKey+subKey 重排得到 mixinKey)
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];

// 缓存 wbi keys (imgKey + subKey)
let wbiKeys = { imgKey: '', subKey: '', updatedAt: 0 };
const WBI_KEYS_TTL = 60 * 60 * 1000; // 1 小时

// 从 /x/web-interface/nav 的响应里更新 keys
export function updateWbiKeysFromNav(navData) {
  if (!navData || !navData.wbi_img) return;
  const imgUrl = navData.wbi_img.img_url || '';
  const subUrl = navData.wbi_img.sub_url || '';
  const imgKey = extractKey(imgUrl);
  const subKey = extractKey(subUrl);
  if (imgKey && subKey) {
    wbiKeys = { imgKey, subKey, updatedAt: Date.now() };
  }
}

function extractKey(url) {
  if (!url) return '';
  // 路径最后一段, 去 .png
  const m = url.match(/\/([^/]+)\.png/);
  return m ? m[1] : '';
}

// 主动从 getNav 拉一次 (用户登录或 app 启动时调用)
export async function refreshWbiKeys() {
  if (wbiKeys.imgKey && wbiKeys.subKey && (Date.now() - wbiKeys.updatedAt) < WBI_KEYS_TTL) {
    return wbiKeys;
  }
  try {
    const { getNav } = await import('./user.js');
    const nav = await getNav();
    if (nav) updateWbiKeysFromNav(nav);
  } catch (e) {
    // ignore - keep existing
  }
  return wbiKeys;
}

export function getWbiKeys() {
  return wbiKeys;
}

// 计算 mixin key (32 字符)
function getMixinKey() {
  const raw = (wbiKeys.imgKey + wbiKeys.subKey).slice(0, 64);
  if (!raw) return '';
  let s = '';
  for (let i = 0; i < 32; i++) {
    s += raw[MIXIN_KEY_ENC_TAB[i]];
  }
  return s;
}

// URL-encode 增强 (RFC 3986): !'()*
function encURI(s) {
  return encodeURIComponent(s).replace(/[!*'()]/g, c =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

// 排序 query 参数, 拼成 k=v&k=v 字符串
// 过滤: 值为 null/空/NaN/'#' 开头; key 包含 'w_rid' 或 'wts'
function buildQueryString(params) {
  const entries = [];
  Object.keys(params).forEach(k => {
    if (k === 'w_rid' || k === 'wts') return;
    const v = params[k];
    if (v == null) return;
    if (typeof v === 'number' && isNaN(v)) return;
    const sv = String(v);
    if (sv === '' || sv.startsWith('#')) return;
    entries.push([k, sv]);
  });
  entries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return entries.map(([k, v]) => encURI(k) + '=' + encURI(v)).join('&');
}

// MD5 简单实现 (与 bili.js 一致)
function md5(str) {
  // 复用 bili.js 的 md5 内部 (它没导出, 这里重新实现)
  function md5cycle(x, k) {
    var a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }
  function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
  function md51(s) {
    var n = s.length, state = [1732584193, -271733879, -1732584194, 271733878], i;
    for (i = 64; i <= s.length; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
    s = s.substring(i - 64);
    var tail = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) {
      md5cycle(state, tail);
      for (i = 0; i < 16; i++) tail[i] = 0;
    }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }
  function md5blk(s) {
    var md5blks = [], i;
    for (i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }
  var hex_chr = '0123456789abcdef'.split('');
  function rhex(n) {
    var s = '', j;
    for (j = 0; j < 4; j++) s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
    return s;
  }
  function hex(x) {
    for (var i = 0; i < x.length; i++) x[i] = rhex(x[i]);
    return x.join('');
  }
  function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
  return hex(md51(str));
}

// 主函数: 给 query 加 wts + w_rid
// 返回新的 query 对象 (不会修改原对象)
export function signWbi(params) {
  if (!wbiKeys.imgKey || !wbiKeys.subKey) {
    // 没有 keys, 返回原 query (不报错, 走 wbi 端点可能被拒)
    return Object.assign({}, params);
  }
  const mixinKey = getMixinKey();
  if (!mixinKey) return Object.assign({}, params);

  const wts = Math.floor(Date.now() / 1000);
  const qs = buildQueryString(Object.assign({}, params, { wts }));
  const hash = md5(qs + mixinKey);

  return Object.assign({}, params, { wts, w_rid: hash });
}

// 异步版 - 拿不到 keys 时尝试刷新一次
export async function signWbiAsync(params) {
  if (!wbiKeys.imgKey) await refreshWbiKeys();
  return signWbi(params);
}

// 状态查询
export function hasWbiKeys() {
  return !!(wbiKeys.imgKey && wbiKeys.subKey);
}
