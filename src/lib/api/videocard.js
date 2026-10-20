// 统一的视频卡片形状
//
// 首页推荐流 / 关注页动态流 / 用户主页投稿列表 —— 三个来源的接口字段完全不一样:
//   推荐流       stat.view / stat.like (嵌套, 数字)
//   动态流       stat.play ("275.7万" 这种字符串), 点赞数在动态的 module_stat 里
//   投稿列表     play / comment / length (全扁平), 而且**根本没有点赞数**
// 在这里统一成同一种形状, 视图层 (FeedCard) 只认这一种, 三个列表显示就一致了。
//
//   {
//     bvid, aid, cid, title, pic, duration,
//     owner: { mid, name } | null,
//     stat: {
//       play: number | string,   // 播放量 (动态流给的是 "275.7万" 这种字符串)
//       like: number | null      // 点赞数; null = 接口没给, 要另外查
//     }
//   }
//
// 点赞数在三个来源里的来路:
//   - 推荐流: stat.like ✓ 直接有
//   - 动态流: archive.stat 里没有, 但动态的 module_stat.like.count 就是该视频的赞
//     (B 站那边"给动态点赞"和"给视频点赞"是联动的, 真机实测两个数只差几十)
//   - 投稿列表 (x/space/arc/search 的 vlist): 没有 → 由列表层按需查
//     (见 components/FeedList.svelte: 焦点落到哪张卡才查哪张)

import { extractArchive, extractAuthor } from './dynamic.js';

/**
 * 推荐流条目 → 视频卡片
 *
 * @param {any} v 推荐接口返回的条目
 * @returns {Object}
 */
export function mapRecommend(v) {
  const stat = (v && v.stat) || {};
  return {
    bvid: v.bvid,
    cid: v.cid,
    aid: v.aid,
    title: v.title,
    pic: v.pic,
    owner: v.owner ? { mid: v.owner.mid, name: v.owner.name } : null,
    duration: v.duration,
    stat: {
      play: stat.view || 0,
      like: stat.like != null ? stat.like : null
    }
  };
}

/**
 * 动态流里的视频 → 视频卡片
 *
 * @param {any} it 动态条目
 * @returns {Object|null} 不是视频动态就返回 null
 */
export function mapDynamicVideo(it) {
  const v = extractArchive(it);
  if (!v) return null;
  const author = extractAuthor(it);
  const moduleStat = it.modules && it.modules.module_stat;
  const stat = v.stat || {};
  return {
    bvid: v.bvid,
    cid: v.cid,
    aid: v.aid,
    title: v.title,
    pic: v.pic,
    owner: author,
    duration: v.duration,
    stat: {
      play: stat.play || stat.view || 0,
      like: moduleStat && moduleStat.like ? moduleStat.like.count : null
    }
  };
}

/**
 * 投稿列表条目 → 视频卡片
 *
 * @param {any} v x/space/arc/search 的 vlist 条目
 * @returns {Object}
 */
export function mapUserVideo(v) {
  return {
    bvid: v.bvid,
    aid: v.aid,
    title: v.title,
    pic: v.pic,
    duration: v.length || '',
    owner: { mid: v.mid, name: v.author || '' },
    stat: {
      play: v.play || 0,
      like: null    // 投稿接口不给点赞数, 由列表层按需查
    }
  };
}
