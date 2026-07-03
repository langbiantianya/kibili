// 视频详情 / 播放地址 / DASH / 多分 P
// 端点参考: SocialSisterYi/bilibili-API-collect/docs/video/

import { get } from './bili.js';

// 视频详情 (web 端)
// 端点: GET /x/web-interface/view
// 认证方式: Cookie(SESSDATA)
// 限制游客访问的视频需要登录
export async function getVideoInfo(bvid) {
  return get('/x/web-interface/view', { query: { bvid }, needCookie: true });
}

// 视频超详细信息 (wbi 增强版)
// 端点: GET /x/web-interface/wbi/view/detail
// 鉴权方式: Wbi 签名
// 一次拉取 view + UP + tags + 热评 + 相关
export async function getVideoInfoDetail(bvid) {
  return get('/x/web-interface/wbi/view/detail', {
    query: { bvid },
    wbi: true,
    needCookie: true
  });
}

// 拉取多分 P
// 端点: GET https://app.bilibili.com/x/v2/view
export async function getVideoParts(bvid) {
  return get('/x/v2/view', {
    useApp: true,
    query: { plat: 0, bvid }
  });
}

// 播放地址 (WBI 版)
// 端点: GET /x/player/wbi/playurl
// 注意: 此端点强制要求 wbi 签名, 否则返回 412 风控
// qn 清晰度: 16=360P, 32=480P, 64=720P, 80=1080P
// fnval: 1=MP4, 16=DASH
export async function getPlayUrlWbi(bvid, cid, qn = 16) {
  const query = {
    bvid, cid, qn,
    fnval: 1,                // MP4 单流
    fnver: 0, fourk: 0,
    platform: 'html5',
    high_quality: 0
  };
  return get('/x/player/wbi/playurl', { query, wbi: true, needCookie: true });
}

// 播放地址 (非 wbi 旧版)
// 端点: GET /x/player/playurl
// qn=16 时加 platform=html5 拿到 mp4 单流
export async function getPlayUrl(bvid, cid, qn = 16) {
  const query = { bvid, cid, qn, type: '', otype: 'json' };
  if (qn === 16) query.platform = 'html5';
  const data = await get('/x/player/playurl', {
    query,
    needCookie: true
  });
  if (!data) return '';
  if (data.durl && data.durl[0]) {
    if (data.durl[0].url) return data.durl[0].url;
    if (data.durl[0].durl && data.durl[0].durl[0]) {
      return data.durl[0].durl[0].url || '';
    }
  }
  return '';
}

// DASH 流 (fnval=16) - 听视频模式
// 端点: GET /x/player/wbi/playurl
export async function getDashUrls(bvid, cid, qn = 16) {
  const data = await get('/x/player/wbi/playurl', {
    query: {
      bvid, cid, qn,
      fnval: 16, fnver: 0, fourk: 0, high_quality: 0, fnflag: 0,
      platform: 'html5'
    },
    wbi: true,
    needCookie: true
  });
  if (!data) return null;

  const result = {
    duration: data.timelength ? data.timelength / 1000 : 0,
    acceptQuality: data.accept_quality || [],
    videoUrl: '',
    audioUrl: ''
  };

  // DASH 响应解析 (兼容 base_url / baseUrl / backup_url 多种命名)
  if (data.dash) {
    if (data.dash.video && data.dash.video.length) {
      const vids = data.dash.video.slice().sort((a, b) => (a.id || 0) - (b.id || 0));
      const v0 = vids[0];
      result.videoUrl = v0.baseUrl || v0.base_url || (v0.backupUrl && v0.backupUrl[0]) || (v0.backup_url && v0.backup_url[0]) || '';
    }
    if (data.dash.audio && data.dash.audio.length) {
      const a0 = data.dash.audio[0];
      result.audioUrl = a0.baseUrl || a0.base_url || (a0.backupUrl && a0.backupUrl[0]) || (a0.backup_url && a0.backup_url[0]) || '';
    }
  }
  if (!result.videoUrl && data.durl && data.durl[0]) {
    if (data.durl[0].url) result.videoUrl = data.durl[0].url;
    else if (data.durl[0].durl && data.durl[0].durl[0]) result.videoUrl = data.durl[0].durl[0].url || '';
  }
  return result;
}

// 仅取音频 URL
export async function getAudioUrl(bvid, cid, qn = 16) {
  const dash = await getDashUrls(bvid, cid, qn);
  return dash ? dash.audioUrl : '';
}
