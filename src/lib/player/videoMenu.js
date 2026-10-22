// 视频页 / 全屏播放页共用的**二级菜单**
//
// ── 为什么抽出来 ───────────────────────────────────────────────────────
// 用户要求「全屏播放的菜单内容 = 视频详情页的菜单内容」。写成两份的话,
// 改一项就得改两处, 迟早会不一致 —— 所以菜单树只有这一份, 两个页面
// 各自把自己的动作 (seek / 音量 / 互动 / 跳转) 传进来。
//
// ── 菜单结构 ───────────────────────────────────────────────────────────
//   UP 主页                      ← 直接执行
//   播放控制 ▸                  ← 三级菜单
//     快进        长按 → 键      ← 提示里的按键跟着该页面的绑定走
//     快退        长按 ← 键
//     音量加      长按 ↑ 键
//     音量减      长按 ↓ 键
//   互动 ▸                      ← 三级菜单
//     一键三连 / 点赞 / 投币 / 收藏
//   分享 ▸                      ← 三级菜单
//     复制链接 / 分享给好友
//   举报 ▸                      ← 三级菜单
//     不友善 / 垃圾广告 / 其他
//
// hint 里写的按键必须和**那个页面**里方向键的实际绑定对得上 (软键文案
// 与行为一致是本项目的硬规矩)。两个页面的方向键布局不一样 (全屏的画面
// 转了 90°, 方向键也跟着转了 90°), 所以提示里的按键也跟着转:
//   视频详情页: 长按 ←/→ 快退/快进, 长按 ↑/↓ 音量
//   全屏播放页: 短按 ↑/↓ 快退/快进, 短按 ←/→ 音量
// 提示由调用方传进来 (hints), 默认是视频详情页那套。

import { showToast } from '../stores/ui.js';

/**
 * 构造视频页/全屏页共用的二级菜单
 *
 * @param {Object} o
 * @param {string} [o.slot='right']   菜单占哪个软键 (left / right)
 * @param {string} [o.label='更多']   软键上显示的文案
 * @param {string} [o.bvid]           当前视频 bvid (复制链接用)
 * @param {number} [o.ownerMid]       UP 主 mid (没有作者信息时 UP 主页置灰)
 * @param {Function} [o.seek]         快进快退: (delta 秒) => void
 * @param {number} [o.seekStep=5]     一次快进/快退多少秒
 * @param {Function} [o.volume]       调音量: (+1 / -1) => void
 * @param {Function} [o.onAuthor]     进 UP 主页: (mid) => void
 * @param {Object}   [o.hints]        四项的副提示 (写清楚等价的按键)
 *                                      默认是视频详情页那套
 * @param {Object}   [o.interact]     互动动作: { like, coin, fav, triple }
 * @returns {Object} 菜单树 (给 onKey 的 opts.menu 用)
 */
export function buildVideoMenu(o) {
  const opt = o || {};
  const slot = opt.slot || 'right';
  const label = opt.label || '更多';
  const bvid = opt.bvid || '';
  const ownerMid = opt.ownerMid || 0;
  const step = typeof opt.seekStep === 'number' ? opt.seekStep : 5;
  const seek = opt.seek || (() => {});
  const volume = opt.volume || (() => {});
  const onAuthor = opt.onAuthor || (() => {});
  const it = opt.interact || {};
  // 副提示: 写"这个功能还有哪个键能按", 必须和该页面方向键的实际绑定一致
  const hints = opt.hints || {
    forward: '长按 → 键',
    back: '长按 ← 键',
    volUp: '长按 ↑ 键',
    volDown: '长按 ↓ 键'
  };
  const run = fn => () => { if (typeof fn === 'function') fn(); };

  return {
    slot: slot,
    label: label,
    title: '更多操作',
    items: [
      {
        label: 'UP 主页',
        // 作者信息没到时就是灰的, 按了没反应
        disabled: !ownerMid,
        action: () => onAuthor(ownerMid)
      },
      {
        label: '播放控制',
        items: [
          { label: '快进', hint: hints.forward, action: () => seek(step) },
          { label: '快退', hint: hints.back, action: () => seek(-step) },
          { label: '音量加', hint: hints.volUp, action: () => volume(1) },
          { label: '音量减', hint: hints.volDown, action: () => volume(-1) }
        ]
      },
      {
        label: '互动',
        items: [
          { label: '一键三连', action: run(it.triple) },
          { label: '点赞', action: run(it.like) },
          { label: '投币', action: run(it.coin) },
          { label: '收藏', action: run(it.fav) }
        ]
      },
      {
        label: '分享',
        items: [
          {
            label: '复制链接',
            action: () => showToast('https://www.bilibili.com/video/' + bvid)
          },
          { label: '分享给好友', action: () => showToast('分享功能待实现') }
        ]
      },
      {
        label: '举报',
        items: [
          { label: '不友善', action: () => showToast('举报功能待实现') },
          { label: '垃圾广告', action: () => showToast('举报功能待实现') },
          { label: '其他', action: () => showToast('举报功能待实现') }
        ]
      }
    ]
  };
}
