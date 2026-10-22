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
//   视频分辨率 ▸                 ← 三级菜单 (页面传了 onQuality 才有)
//     240P / 360P / 480P / 720P  ← 当前档用 ✓ 标出
//   互动 ▸                      ← 三级菜单
//     一键三连 / 点赞 / 投币 / 收藏
//   分享 ▸                      ← 三级菜单
//     复制链接 / 分享给好友
//   退出应用                    ← 末项 (全局收口, 和主页那套菜单一致)
//
// hint 里写的按键必须和**那个页面**里方向键的实际绑定对得上 (软键文案
// 与行为一致是本项目的硬规矩)。两个页面的方向键布局不一样 (全屏的画面
// 转了 90°, 方向键也跟着转了 90°), 所以提示里的按键也跟着转:
//   视频详情页: 长按 ←/→ 快退/快进, 长按 ↑/↓ 音量
//   全屏播放页: 短按 ↑/↓ 快退/快进, 短按 ←/→ 音量
// 提示由调用方传进来 (hints), 默认是视频详情页那套。

import { showToast } from '../stores/ui.js';
import { buildExitItem } from '../menu/appMenu.js';

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
 * @param {number}  [o.quality]       当前清晰度 (qn), 用于在菜单里标出当前档
 * @param {Array}   [o.qualities]     可选清晰度 [{ label, value }]
 * @param {Function}[o.onQuality]      切清晰度: (qn) => void
 *                                      传了这个才有「视频分辨率」这一项
 * @param {boolean}  [o.exit=true]    末项是否追加「退出应用」
 * @param {boolean}  [o.exitDisabled=false] 追加了但手动禁用 (灰着, 按不动)
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

  const items = [
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
    }
  ];

  // 「视频分辨率」三级菜单: 只有页面传了 onQuality 才有这一项
  //   (视频详情页固定 240P, 全屏页才让用户调)
  //   标题上写当前档位, 三级菜单里用 ✓ 标出当前档 (和设置页的写法一致)
  if (typeof opt.onQuality === 'function' && Array.isArray(opt.qualities) && opt.qualities.length) {
    let cur = null;
    for (let i = 0; i < opt.qualities.length; i++) {
      if (opt.qualities[i].value === opt.quality) { cur = opt.qualities[i]; break; }
    }
    // 放在「播放控制」后面 (都是播放相关的项, 挨在一起好找)
    items.splice(2, 0, {
      label: '视频分辨率' + (cur ? ' ' + cur.label : ''),
      items: opt.qualities.map(q => ({
        label: (q.value === opt.quality ? '✓ ' : '') + q.label,
        action: () => opt.onQuality(q.value)
      }))
    });
  }

  // 末项「退出应用」: 全局收口, 和主页三个 Tab 那套菜单保持一致。
  // 调用方可以关掉 (exit: false) 或手动禁用 (exitDisabled: true → 灰着按不动)。
  if (opt.exit !== false) {
    items.push(buildExitItem({ disabled: !!opt.exitDisabled }));
  }

  return {
    slot: slot,
    label: label,
    title: '更多操作',
    items: items
  };
}
