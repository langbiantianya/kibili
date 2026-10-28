import { writable, get } from 'svelte/store';
import { persist } from './persist.js';
import { setCacheLimit } from '../player/cache.js';

/** 听视频的整段音频缓存上限, 默认 50MB */
export const DEFAULT_CACHE_LIMIT_MB = 50;

const initial = persist.load('settings:v1', {
  quality: 16,            // 320p-ish cap
  muted: false,
  listenOnlyDefault: false,
  // 打开视频是否立刻播放:
  //   true  = 保持原样, 打开就拉流并播放
  //   false = 不拉流不播, 只显示封面, 按中键(播放)才去加载
  autoPlay: true,
  // 全屏播放要不要显示**软键栏** (沉浸模式):
  //   true  = 全屏照常显示那一行软键提示
  //   false = 全屏把整条软键栏藏起来 (但二级菜单照常能按右软键打开)
  //
  // 存储键名还叫 fullscreenMenu (沿用旧版, 别把老用户存的选择弄丢了),
  // 现在的含义是"全屏显示软键栏"。
  fullscreenMenu: true,
  // 听视频的整段音频缓存上限 (MB):
  //   缓存多了手机存储/内存吃不消, 所以有个上限。缓存里存的是
  //   "为了能精确快进而整段下下来的音频", 不是视频。
  cacheLimit: DEFAULT_CACHE_LIMIT_MB
});

// 旧版本存过的"应用内音量"(settings.volume), 现在音量只走系统 (KaiOS 2.4 读不到系统音量,
// 应用再叠一层增益只会和系统对不上), 这个字段已经没有意义, 读出来时顺手丢掉
if (initial && typeof initial === 'object' && 'volume' in initial) {
  delete initial.volume;
}

// 老版本存过的设置里没有 autoPlay 这个字段 —— 缺省按"立刻播放"处理,
// 不然老用户升级后打开视频会突然变成不播 (行为变了)
if (initial && typeof initial === 'object' && typeof initial.autoPlay !== 'boolean') {
  initial.autoPlay = true;
}

// 老版本存过的设置里没有 fullscreenMenu 这个字段 —— 缺省按"显示菜单"处理
if (initial && typeof initial === 'object' && typeof initial.fullscreenMenu !== 'boolean') {
  initial.fullscreenMenu = true;
}

// 老版本存过的设置里没有 cacheLimit —— 缺省 50MB (别让老用户升级后缓存上限变成 0)
if (initial && typeof initial === 'object') {
  const mb = Number(initial.cacheLimit);
  if (!isFinite(mb) || mb <= 0) initial.cacheLimit = DEFAULT_CACHE_LIMIT_MB;
}

export const settings = writable(initial);

settings.subscribe(v => {
  persist.save('settings:v1', v);
  // 缓存上限 → 缓存管理器。设置里改完**立刻生效**;
  // 改小了的话, 缓存管理器会马上把超出的那些回收掉。
  const mb = Number(v && v.cacheLimit);
  setCacheLimit((isFinite(mb) && mb > 0 ? mb : DEFAULT_CACHE_LIMIT_MB) * 1024 * 1024);
});
