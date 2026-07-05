// 推荐 / 排行榜
// 端点参考: SocialSisterYi/bilibili-API-collect/docs/video/recommend.md

import { get } from './bili.js';

// 推荐 feed (web 端)
// 端点: GET /x/web-interface/index/top/rcmd
// 认证方式: Cookie(SESSDATA + buvid) — 缺失会 -412
// 注意: 该接口不需要 WBI 签名 (加了 w_rid/wts 反而 -400)
// fresh_type: 3 默认 (0 可能不被接受)
// version: 1 新版本, 0 旧版本
// ps: 每页条数 (version=1 时默认 8)
// fresh_idx / fresh_idx_1h: 翻页相关, 默认1
export async function getRecommend({ ps = 8, fresh_type = 3, version = 1, fresh_idx = 1, fresh_idx_1h = 1 } = {}) {
  return get('/x/web-interface/index/top/rcmd', {
    query: { fresh_type, version, ps, fresh_idx, fresh_idx_1h },
    needCookie: true
  });
}

// 单视频相关推荐
// 端点: GET /x/web-interface/archive/related
export async function getRelated(bvid) {
  return get('/x/web-interface/archive/related', { query: { bvid } });
}

// 全站排行榜 (默认日榜, 全部分区)
// 端点: GET /x/web-interface/ranking
export async function getRanking({ type = 'all', rid = 0, day = 3 } = {}) {
  return get('/x/web-interface/ranking', {
    query: { type, rid, day }
  });
}

// 热门视频
// 端点: GET /x/web-interface/popular
export async function getPopular({ ps = 20, pn = 1 } = {}) {
  return get('/x/web-interface/popular', { query: { ps, pn } });
}
