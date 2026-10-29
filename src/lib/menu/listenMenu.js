// 听视频页的二级菜单
//
// 布局参照视频详情页那套 (播放控制 / 互动 / 分享 各归一类, 分类项下面是
// 三级菜单), 听视频只听声音, 所以分类是:
//
//   UP 主页                ← 直接执行
//   播放控制 ▸             ← 三级菜单 (副提示写的就是这一页方向键的实际绑定)
//     快进 / 快退 / 音量加 / 音量减
//   播放列表 ▸             ← 三级菜单: 列表里的每一首
//     └ 每一首再进**四级菜单**: 立刻播放 / 从播放列表删除 / 向上移动 / 向下移动
//   播放模式 ▸             ← 三级菜单 (当前那个用 ✓ 标出)
//   互动 ▸                 ← 三级菜单
//   分享 ▸                 ← 三级菜单
//   退出播放               ← 停止播放, 收起听视频页
//   退出应用               ← 全局收口 (和别的页面一致)
//
// 菜单挂在**右软键**上: 页面不要自己绑 SoftRight ——
// 软键栏的兜底作用域 (优先级 50) 接管这个键, 优先级高于页面 (10),
// 免得软键栏写着「更多」按下去却是页面自己的动作 (文案和行为必须对得上)。

import { PLAY_MODES, DEFAULT_PLAY_MODE, playModeLabel } from '../player/playmode.js';
import { showToast } from '../stores/ui.js';
import { buildExitItem } from './appMenu.js';

/**
 * 歌名太长时截一下 (四级菜单的面包屑就它一个标题, 太长会把面包屑撑爆)
 *
 * @param {string} title
 * @returns {string}
 */
function shortTitle(title) {
  const t = String(title || '未命名');
  return t.length > 10 ? t.slice(0, 10) + '…' : t;
}

/**
 * 构造听视频页的二级菜单
 *
 * @param {Object} o
 * @param {number} [o.ownerMid]        当前视频作者 mid (没有就「UP 主页」置灰)
 * @param {string} [o.bvid]            当前视频 bvid (复制链接用)
 * @param {Array}  [o.playlist]        当前播放列表的曲目
 * @param {number} [o.currentIndex]    正在播的是列表里的第几项 (用来标 ✓)
 * @param {string} [o.playMode]        当前播放模式 id (用来标 ✓)
 * @param {boolean}[o.liked]           已点赞
 * @param {boolean}[o.coined]          已投币
 * @param {boolean}[o.faved]           已收藏
 * @param {Function}[o.onAuthor]       进 UP 主页: (mid) => void
 * @param {Function}[o.onPick]         播放列表里选一首: (index) => void
 * @param {Function}[o.onRemove]       从播放列表删掉: (index) => void
 * @param {Function}[o.onMove]          播放列表里挪一格: (index, delta) => void
 * @param {Function}[o.onPlayMode]     切播放模式: (id) => void
 * @param {Function}[o.onSeek]          快进快退: (秒) => void
 * @param {Function}[o.onVolume]        调音量: (+1 / -1) => void
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
  const bvid = opt.bvid || '';

  const items = [
    {
      label: 'UP 主页',
      // 作者信息没到时就是灰的, 按了没反应
      disabled: !opt.ownerMid,
      action: () => { if (typeof opt.onAuthor === 'function') opt.onAuthor(opt.ownerMid); }
    },
    {
      // 副提示写的是**这一页方向键的实际绑定** (听视频页: ← → 快退快进, ↑↓ 音量)
      label: '播放控制',
      items: [
        { label: '快进', hint: '→ 键', action: () => { if (typeof opt.onSeek === 'function') opt.onSeek(10); } },
        { label: '快退', hint: '← 键', action: () => { if (typeof opt.onSeek === 'function') opt.onSeek(-10); } },
        { label: '音量加', hint: '↑ 键', action: () => { if (typeof opt.onVolume === 'function') opt.onVolume(1); } },
        { label: '音量减', hint: '↓ 键', action: () => { if (typeof opt.onVolume === 'function') opt.onVolume(-1); } },
        { label: '上一首', action: run(opt.onPrev) },
        { label: '下一首', action: run(opt.onNext) }
      ]
    },
    {
      // 三级菜单: 每一首; 再进去是四级菜单 (播放/删除/上移/下移)
      label: '播放列表',
      disabled: !list.length,
      items: list.map((v, i) => ({
        label: (i === opt.currentIndex ? '✓ ' : '') + (v.title || '未命名'),
        // 四级菜单的标题用歌名 (不带 "✓ "), 面包屑好看
        title: shortTitle(v.title),
        items: [
          {
            label: '立刻播放',
            action: () => { if (typeof opt.onPick === 'function') opt.onPick(i); }
          },
          {
            label: '从播放列表删除',
            action: () => { if (typeof opt.onRemove === 'function') opt.onRemove(i); }
          },
          {
            label: '向上移动',
            // 已经在第一首了 → 没得往上挪, 灰着
            disabled: i <= 0,
            action: () => { if (typeof opt.onMove === 'function') opt.onMove(i, -1); }
          },
          {
            label: '向下移动',
            // 已经是最后一首了 → 没得往下挪, 灰着
            disabled: i >= list.length - 1,
            action: () => { if (typeof opt.onMove === 'function') opt.onMove(i, 1); }
          }
        ]
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
      label: '互动',
      items: [
        { label: '一键三连', action: run(opt.onTriple) },
        { label: '点赞', action: run(opt.onLike) },
        { label: '投币', action: run(opt.onCoin) },
        { label: '收藏', action: run(opt.onFav) }
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
    { label: '查看评论', action: run(opt.onComments) },
    { label: '退出播放', action: run(opt.onExit) },
    buildExitItem()
  ];

  return {
    slot: 'right',
    label: '更多',
    title: '更多操作',
    items: items
  };
}
