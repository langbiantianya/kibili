// 视频详情 / 播放地址 / DASH / 多分 P
// 端点参考: alittlehuaji/bilibili-api-collect-mirror/docs/video/

import { get } from './bili.js';

// 视频详情 (web 端)
// 端点: GET /x/web-interface/view
// 认证方式: Cookie(SESSDATA)
// 限制游客访问的视频需要登录
export async function getVideoInfo(bvid) {
  return get('/x/web-interface/view', { query: { bvid }, needCookie: true });
}

// 视频统计 (播放量 + 点赞数)
//
// 列表接口基本都不给点赞数 (推荐流除外), 只能一个视频一个视频地查:
//   端点: GET /x/web-interface/view  →  data.stat.view / data.stat.like
//
// 没有批量接口 (B 站的 archive/stats 那种批量端点已经没了), 所以调用方
// 要**按需**查 —— 别一上来就为一整页 30 个视频各发一次请求。
//
// @param {string} bvid
// @returns {Promise<{play: number, like: number}>}
export async function getVideoStat(bvid) {
  const info = await getVideoInfo(bvid);
  const st = (info && info.stat) || {};
  return { play: st.view || 0, like: st.like || 0 };
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
//
// platform=html5 + fnval=1 → 只要 **MP4 单流** (durl):
//   KaiOS 2.4 (Gecko 48) 播普通 mp4 最稳 (DASH 的分片流在老 Gecko 上不稳)。
//   清晰度跟着 qn 走: 6=240P, 16=360P, 32=480P, 64=720P。
//   B 站给什么档就是什么档: 没登录、或视频本身没有的档会被抬到可用档
//   (比如 qn=6 但这视频只有 360P/720P → 给回 360P)。
export async function getPlayUrl(bvid, cid, qn = 16) {
  const query = {
    bvid, cid, qn, type: '', otype: 'json',
    fnval: 1,                // 只要 MP4 单流
    fnver: 0, fourk: 0,
    platform: 'html5'        // 网页端 → 拿得到 mp4
  };
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
//
// 视频流按**请求的清晰度**挑, 不是取 id 最小的那个:
//   DASH 的 id 就是清晰度码 (16=360P, 32=480P, 64=720P, 80=1080P)。
//   · 请求的档 DASH 里没有 (比如 240P 压根没有 DASH 档) → 视频流当没有,
//     由调用方退回 MP4 单流 (只有 MP4 才有 240P)。
//   · 视频本身没有请求的档 (要 720P 但这视频最高 360P) → 取不超过请求值的
//     最大那档, 降级播, 不黑屏。
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
      // 只留不超过请求清晰度的档, 取其中最大的一个
      const fit = vids.filter(v => (v.id || 0) <= qn);
      const pick = fit.length ? fit[fit.length - 1] : null;
      if (pick) {
        result.videoUrl = pick.baseUrl || pick.base_url || (pick.backupUrl && pick.backupUrl[0]) || (pick.backup_url && pick.backup_url[0]) || '';
      }
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
