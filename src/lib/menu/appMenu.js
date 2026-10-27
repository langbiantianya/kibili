// 全局二级菜单 (主页三个 Tab 用)
//
// ── 为什么单独抽一个 ───────────────────────────────────────────────────
// 软键栏只有三格, 右软键给页面派一个动作就满了。主页三个 Tab 各自的动作
// (搜索 / 切 Tab) 现在收进二级菜单, 右软键统一变成「更多」——
// 和视频详情页、全屏页的菜单是同一套机制 (stores/softkey.js)。
//
// 菜单的最后一项固定是「退出应用」: 退出是全局收口, 放在哪儿都得有,
// 所以由这个构造器统一追加, 页面只管把自己的动作放前面。
//
// 「退出应用」这一项由 buildExitItem() 统一造 (文案 + 行为只有这一份),
// 别的菜单构造器 (比如视频页/全屏页那套) 要加就用它, 别各写一份 ——
// 两边行为不一样的话, 用户按到就会觉得"这软件的退出怎么两副样子"。
//
// 菜单挂在**右软键**上: 页面不要再自己绑 SoftRight ——
// 软键栏的兜底作用域 (优先级 50) 接管这个键, 优先级高于页面 (10),
// 免得软键栏写着「更多」按下去却是页面自己的动作 (文案和行为必须对得上)。

import { get } from 'svelte/store';
import { nowPlaying, playState } from '../stores/player.js';
import { togglePlay, nextTrack, prevTrack } from '../player/engine.js';

/**
 * 退出应用
 *
 * 顺序很重要:
 *   1) 先把路由重置到 '/' (首页) —— 退出前把状态归位,
 *      下次进来落在首页, 不会停在奇怪的位置 (会话会记住这个 hash)
 *   2) 再关掉应用窗口
 *
 * window.close() 在 KaiOS 2.4 (Gecko 48) 上能真的结束应用 ——
 * 实测 (Nokia 6300 4G): 调完之后 console actor 消失, b2g-ps 里也没有这个应用了。
 *
 * 路由重置和关窗之间留一点间隔: 路由是 hashchange 异步处理的,
 * 等它把这一下处理完再关, 免得关得太快、状态没归位。
 */
export function exitApp() {
  try {
    location.hash = '#/';
  } catch (e) {
    // 关窗是最后一步, 前面出错也不能挡住退出
  }
  setTimeout(() => {
    try {
      window.close();
    } catch (e) {}
  }, 150);
}

/**
 * 造「退出应用」这一项 (全局收口, 各菜单共用同一份)
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.disabled=false] 手动禁用这一项:
 *        灰着显示, 按中键没反应 (softkey.js 里 disabled 项会被吞掉按键)
 * @returns {Object} 菜单项
 */
export function buildExitItem(opts) {
  const o = opts || {};
  const item = { label: '退出应用', action: () => exitApp() };
  if (o.disabled) item.disabled = true;
  return item;
}

/**
 * 造「正在播放」这一项 (有在放的东西才有)
 *
 * 放在任意页面的「更多」菜单里: 能跳回听视频页, 也能直接控制播放。
 * 文案写的是**按下之后会做什么** (本项目的硬规矩):
 * 正在播 → 「暂停」, 暂停着 → 「播放」。
 *
 * @returns {Object|null} 菜单项 (没在放东西时返回 null)
 */
export function buildNowPlayingItem() {
  const cur = get(nowPlaying);
  if (!cur || !cur.bvid) return null;
  const playing = get(playState).playing;
  return {
    label: '正在播放',
    items: [
      {
        label: '回到听视频',
        // 直接改 hash (和 exitApp 同一做法): 这个文件不引 router 模块 ——
        // 菜单构造器会被无头自测直接 import, 引了 svelte-spa-router 就跑不起来
        action: () => { location.hash = '#/listen?bvid=' + encodeURIComponent(cur.bvid); }
      },
      {
        label: playing ? '暂停' : '播放',
        action: () => togglePlay()
      },
      { label: '下一个', action: () => nextTrack(false) },
      { label: '上一个', action: () => prevTrack() }
    ]
  };
}

/**
 * 构造全局二级菜单
 *
 * @param {Array} [items] 页面自己的动作 (放前面)
 * @param {Object} [opts]
 * @param {string} [opts.label='更多']   右软键上显示的文案
 * @param {string} [opts.title='更多操作'] 面板标题 / 面包屑第一级
 * @param {boolean} [opts.exit=true]     最后是否追加「退出应用」
 * @param {boolean} [opts.exitDisabled=false] 追加了但手动禁用 (灰着, 按不动)
 * @param {boolean} [opts.nowPlaying=true] 是否追加「正在播放」(有在放的东西时)
 * @returns {Object} 菜单树 (给 onKey 的 opts.menu 用)
 */
export function buildAppMenu(items, opts) {
  const o = opts || {};
  const list = (items || []).slice();
  if (o.nowPlaying !== false) {
    const np = buildNowPlayingItem();
    if (np) list.push(np);
  }
  if (o.exit !== false) {
    list.push(buildExitItem({ disabled: !!o.exitDisabled }));
  }
  return {
    slot: 'right',
    label: o.label || '更多',
    title: o.title || '更多操作',
    items: list
  };
}
