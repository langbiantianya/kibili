// 听视频页的二级菜单
//
// 布局参照视频详情页那套 (UP 主页 / 播放控制 / 互动 / 分享), 但听视频只听声音,
// 没有画面可调, 所以换成:
//   UP 主页          ← 进作者主页
//   播放列表 ▸       ← 三级菜单: 当前播放列表, 选中即切过去播
//   播放模式 ▸       ← 三级菜单: 单曲循环/列表循环/顺序播放/随机播放
//                     当前那个用 ✓ 标出 (和播放列表、清晰度一个写法)
//   上一首 / 下一首   ← 切歌 (页面上那排播放控制按钮也是它们)
//   点赞 / 投币 / 收藏 / 一键三连
//   查看评论         ← 单独打开一个评论页
//   退出播放         ← 停止播放, 收起听视频页
//
// 菜单挂在**右软键**上: 页面不要自己绑 SoftRight ——
// 软键栏的兜底作用域 (优先级 50) 接管这个键, 优先级高于页面 (10),
// 免得软键栏写着「更多」按下去却是页面自己的动作 (文案和行为必须对得上)。

import { PLAY_MODES, DEFAULT_PLAY_MODE, playModeLabel } from '../player/playmode.js';

/**
 * 构造听视频页的二级菜单
 *
 * @param {Object} o
 * @param {number} [o.ownerMid]        当前视频作者 mid (没有就「UP 主页」置灰)
 * @param {Array}  [o.playlist]         当前播放列表的曲目
 * @param {number} [o.currentIndex]     正在播的是列表里的第几项 (用来标 ✓)
 * @param {string} [o.playMode]         当前播放模式 id (用来标 ✓)
 * @param {boolean}[o.liked]            已点赞
 * @param {boolean}[o.coined]           已投币
 * @param {boolean}[o.faved]            已收藏
 * @param {Function}[o.onAuthor]        进 UP 主页: (mid) => void
 * @param {Function}[o.onPick]          选播放列表里的一项: (index) => void
 * @param {Function}[o.onPlayMode]      切播放模式: (id) => void
 * @param {Function}[o.onPrev]          上一首: () => void
 * @param {Function}[o.onNext]          下一首: () => void
 * @param {Function}[o.onLike]          点赞/取消: () => void
 * @param {Function}[o.onCoin]          投币: () => void
 * @param {Function}[o.onFav]           收藏/取消: () => void
 * @param {Function}[o.onTriple]        一键三连: () => void
 * @param {Function}[o.onComments]      查看评论: () => void
 * @param {Function}[o.onExit]          退出播放: () => void
 * @returns {Object} 菜单树 (给 onKey 的 opts.menu 用)
 */
export function buildListenMenu(o) {
  const opt = o || {};
  const run = fn => () => { if (typeof fn === 'function') fn(); };
  const list = Array.isArray(opt.playlist) ? opt.playlist : [];
  const mode = opt.playMode || DEFAULT_PLAY_MODE;

  const items = [
    {
      label: 'UP 主页',
      // 作者信息没到时就是灰的, 按了没反应
      disabled: !opt.ownerMid,
      action: run(opt.onAuthor)
    },
    {
      label: '播放列表',
      // 播放列表是空的 → 置灰 (没什么可选的)
      disabled: !list.length,
      items: list.map((v, i) => ({
        label: (i === opt.currentIndex ? '✓ ' : '') + (v.title || '未命名'),
        action: () => { if (typeof opt.onPick === 'function') opt.onPick(i); }
      }))
    },
    {
      // 右边挂一行小字 = 当前是哪种模式 (和视频页「视频分辨率」一个写法)
      label: '播放模式',
      hint: playModeLabel(mode),
      items: PLAY_MODES.map(m => ({
        label: (m.id === mode ? '✓ ' : '') + m.label,
        action: () => { if (typeof opt.onPlayMode === 'function') opt.onPlayMode(m.id); }
      }))
    },
    {
      // 列表空着 → 置灰 (没歌可切)
      label: '上一首',
      disabled: !list.length,
      action: run(opt.onPrev)
    },
    {
      label: '下一首',
      disabled: !list.length,
      action: run(opt.onNext)
    },
    { label: '点赞', action: run(opt.onLike) },
    { label: '投币', action: run(opt.onCoin) },
    { label: '收藏', action: run(opt.onFav) },
    { label: '一键三连', action: run(opt.onTriple) },
    { label: '查看评论', action: run(opt.onComments) },
    { label: '退出播放', action: run(opt.onExit) }
  ];

  return {
    slot: 'right',
    label: '更多',
    title: '更多操作',
    items: items
  };
}
