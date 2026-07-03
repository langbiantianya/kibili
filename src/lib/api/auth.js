// Web 端 QR 登录
// 端点参考: SocialSisterYi/bilibili-API-collect/docs/login/login_action/QR.md

import { get, post } from './bili.js';

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
function pollRaw(qrcode_key) {
  return new Promise((resolve, reject) => {
    import('./bili.js').then(({ request, isDev }) => {
      const path = '/x/passport-login/web/qrcode/poll?qrcode_key=' + encodeURIComponent(qrcode_key);
      const base = isDev ? '/passport-proxy' : 'https://passport.bilibili.com';
      const url = base + path;

      const xhr = new XMLHttpRequest(!isDev ? { mozSystem: true } : undefined);
      xhr.open('GET', url, true);
      xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
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
          resolve(data);
        } else {
          reject(new Error('invalid poll response'));
        }
      };
      xhr.onerror = () => reject(new Error('network error'));
      xhr.ontimeout = () => reject(new Error('timeout'));
      xhr.send();
    });
  });
}

// 3. 从登录成功的 data.url 提取 cookie
// data.url 格式: https://passport.biligame.com/crossDomain?DedeUserID=***&DedeUserID__ckMd5=***
//              &Expires=***&SESSDATA=***&bili_jct=***&gourl=...
export function extractCookiesFromUrl(url) {
  try {
    const u = new URL(url);
    const params = u.searchParams;
    return {
      sessdata: params.get('SESSDATA') || '',
      bili_jct: params.get('bili_jct') || '',
      dedeUserID: params.get('DedeUserID') || '',
      dedeUserIDMd5: params.get('DedeUserID__ckMd5') || '',
      refreshToken: params.get('refresh_token') || '',
      expiresAt: params.get('Expires') ? parseInt(params.get('Expires')) : 0
    };
  } catch (e) {
    return null;
  }
}
