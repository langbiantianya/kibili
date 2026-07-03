// 关注动态 (web 端)
// 端点参考: SocialSisterYi/bilibili-API-collect/docs/dynamic/

import { get } from './bili.js';

// 关注动态列表 (web 端主端点)
// 端点: GET /x/polymer/web-dynamic/v1/feed/all
// type: all / video / pgc / article
// offset: 翻页游标
// 响应: data.items[] 含 modules.module_dynamic.major.archive (视频)
export async function getDynamicAll({ type = 'all', offset = '', page = 1 } = {}) {
  const query = { type, page };
  if (offset) query.offset = offset;
  return get('/x/polymer/web-dynamic/v1/feed/all', {
    query,
    needCookie: true
  });
}

// 用户空间动态
// 端点: GET /x/polymer/web-dynamic/v1/feed/space
export async function getDynamicSpace(hostMid, { offset = '', features = 'itemOpusStyle' } = {}) {
  const query = { host_mid: hostMid, features };
  if (offset) query.offset = offset;
  return get('/x/polymer/web-dynamic/v1/feed/space', { query });
}

// 动态详情
// 端点: GET /x/polymer/web-dynamic/v1/detail
export async function getDynamicDetail(id) {
  return get('/x/polymer/web-dynamic/v1/detail', {
    query: { id, timezone_offset: -480 }
  });
}

// ============ 旧协议 (api.vc.bilibili.com) - 备用 ============
// 关注的最新动态
// 端点: GET /dynamic_svr/v1/dynamic_svr/dynamic_new
export async function getDynamicNew(uid, { type_list = 268435455 } = {}) {
  return get('/dynamic_svr/v1/dynamic_svr/dynamic_new', {
    useVc: true,
    query: { uid, type_list },
    needCookie: true
  });
}

// 关注动态下一页
// 端点: GET /dynamic_svr/v1/dynamic_svr/dynamic_history
export async function getDynamicHistory(uid, { offset_dynamic_id, type_list = 268435455 } = {}) {
  return get('/dynamic_svr/v1/dynamic_svr/dynamic_history', {
    useVc: true,
    query: { uid, type_list, offset_dynamic_id },
    needCookie: true
  });
}

// ============ 解析辅助 ============
// 解析 web 端 dynamic item, 提取视频 (type 8 = 视频)
export function extractArchive(dynamicItem) {
  if (!dynamicItem) return null;
  // web 端结构: modules.module_dynamic.major.archive
  const m = dynamicItem.modules && dynamicItem.modules.module_dynamic;
  if (!m || !m.major || m.major.type !== 'MAJOR_TYPE_ARCHIVE') return null;
  const a = m.major.archive;
  if (!a) return null;
  return {
    bvid: a.bvid,
    aid: a.aid,
    cid: a.cid,
    title: a.title,
    pic: a.cover,
    desc: a.desc,
    duration: a.duration_text,
    stat: a.stat
  };
}

// 解析 web 端 dynamic item, 提取作者
export function extractAuthor(dynamicItem) {
  const a = dynamicItem.modules && dynamicItem.modules.module_author;
  if (!a) return null;
  return {
    mid: a.mid,
    name: a.name,
    face: a.face
  };
}

// 解析 web 端 dynamic item, 提取发布时间
export function extractPubTime(dynamicItem) {
  const a = dynamicItem.modules && dynamicItem.modules.module_author;
  if (!a || !a.pub_ts) return 0;
  return a.pub_ts;
}

// 解析 web 端 dynamic item, 提取文字内容
export function extractText(dynamicItem) {
  const m = dynamicItem.modules && dynamicItem.modules.module_dynamic;
  if (!m) return '';
  if (m.desc && m.desc.text) return m.desc.text;
  if (m.major && m.major.opus && m.major.opus.summary && m.major.opus.summary.text) {
    return m.major.opus.summary.text;
  }
  return '';
}
