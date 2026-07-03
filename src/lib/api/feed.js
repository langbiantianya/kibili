// 推荐 / 排行榜
// 端点参考: SocialSisterYi/bilibili-API-collect/docs/video/recommend.md

import { get } from './bili.js';

// 推荐 feed (web 端)
// 端点: GET /x/web-interface/index/top/rcmd
// fresh_type: 0 主页, 3 默认
// version: 0 旧算法, 1 新算法
export async function getRecommend({ ps = 10, fresh_type = 3, version = 1 } = {}) {
  return get('/x/web-interface/index/top/rcmd', {
    query: { fresh_type, version, ps }
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
