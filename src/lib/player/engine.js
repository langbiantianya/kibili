// 听视频 (纯音频) 的播放引擎
//
// ── 为什么媒体元素要常驻 ──────────────────────────────────────────────
// 听视频页可以被"最小化": 收起页面, 底部浮一条迷你条, **音频继续放**。
// 所以媒体元素不能属于那个页面 —— 页面一卸载, 声音就断了。
// 它挂在根组件 (App.svelte) 里, 跨路由不销毁; 引擎通过 setAudioElement()
// 拿到引用。
//
// ⚠️ 这个元素是 **<video>** 而不是 <audio>: 真机 (Gecko 48) 实测, 同一条
// DASH 纯音频 (m4s) 装进 <audio> 会被当成直播流 (快不了), 装进 <video>
// 才是一正常的可跳媒体。详见 App.svelte 里 mediaEl 的注释。
//
// ── 流地址每次重新拉 ──────────────────────────────────────────────────
// B 站的音频地址带有效期 (deadline 参数), 存进播放列表过阵子就失效。
// 播放列表里只存视频信息 (bvid/cid/标题/封面), 每次真正播的时候才去拉地址。

import { get } from 'svelte/store';
import { getVideoInfo, getAudioUrl } from '../api/video.js';
import { safePlay, safeSeek, seekableEnd, waitLoaded } from './media.js';
import { cacheTrack, cacheGet, cacheSetActive } from './cache.js';
import { nextAction, prevAction } from './playmode.js';
import { showToast } from '../stores/ui.js';
import {
  playlist, nowPlaying, playState, currentIndex, miniVisible, miniProgress,
  moveToPlaylistTop, playMode
} from '../stores/player.js';

/** @type {HTMLVideoElement|null} */
let el = null;
let bound = false;
/** 拉流时的请求序号 (用户连点换歌时, 只认最后一次) */
let loadSeq = 0;

/**
 * 当前这一首的时长 (秒)
 *
 * ⚠️ **用 API 给的值, 不用元素报的 duration**: 老 Gecko (Gecko 48) 对这条
 * DASH 纯音频 (m4s) 的 duration 报得没准过 —— 装在 <audio> 元素里时它跟着
 * 播放头走 (播到 40 秒就报 40 秒), 快进之后还会缩水 (236 秒能缩成 87 秒)。
 * 播放列表项里存着 API 给的 duration, 最稳。
 */
let trackDuration = 0;

/** 本首已经推进到下一首了 (防止 'ended' 事件和进度兜底 重复推进) */
let advanced = false;

/** 正在换源 (换成整段缓存的音频) */
let switching = false;

/** 当前在播的流地址 (要整段缓存时用) */
let streamUrl = '';

/**
 * 这一首的缓存标识
 *
 * bvid + cid: 同一个视频的不同分 P (cid) 音频是不一样的, 得分开存。
 *
 * @param {any} item
 * @returns {string}
 */
function trackKey(item) {
  if (!item || !item.bvid) return '';
  return item.bvid + '#' + (item.cid || '');
}

/**
 * 时长归一化成秒
 *
 * 播放列表里的 duration 有两种: 推荐流给的是数字 (236),
 * 投稿列表给的是 "4:32" 这种字符串 —— 后者直接用会算成 NaN。
 *
 * @param {any} d
 * @returns {number} 秒; 认不出来返回 0
 */
function toSeconds(d) {
  const n = Number(d);
  if (isFinite(n) && n > 0) return n;
  if (typeof d === 'string' && d.indexOf(':') > 0) {
    const parts = d.split(':');
    let s = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = Number(parts[i]);
      if (!isFinite(p)) return 0;
      s = s * 60 + p;
    }
    return s > 0 ? s : 0;
  }
  return 0;
}

/**
 * 把根组件里的媒体元素交给引擎
 *
 * @param {HTMLVideoElement|null} e
 */
export function setAudioElement(e) {
  el = e;
  if (el && !bound) {
    bound = true;
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('play', () => patchState({ playing: true }));
    el.addEventListener('pause', () => patchState({ playing: false }));
    el.addEventListener('ended', () => {
      if (advanced) return;
      // 只认"当前这一首的结尾": 换歌之后元素会归零, 这时补过来的旧 'ended'
      // 不该再推一次 (不然会**跳过一首歌**)。
      if (trackDuration > 0 && el.currentTime < trackDuration - 3) return;
      advanced = true;
      nextTrack(true);
    });
    el.addEventListener('error', () => { patchState({ playing: false, loading: false }); });
  }
}

function patchState(patch) {
  playState.update(s => ({ ...s, ...patch }));
}

// ── 事件处理 ──────────────────────────────────────────────────────────

function onTimeUpdate() {
  if (!el) return;
  const time = el.currentTime || 0;
  // 时长用 API 的值 (元素报的 duration 在 m4s 上不可信, 见 trackDuration)
  const duration = trackDuration > 0
    ? trackDuration
    : (el.duration && isFinite(el.duration) ? el.duration : 0);
  patchState({ time, duration, playing: !el.paused });
  miniProgress.set(duration > 0 ? Math.min(1, time / duration) : 0);
}

function onDurationChange() {
  if (!el) return;
  // 已经有 API 的时长了就不听元素的 (老 Gecko 对这条 m4s 的 duration 报得没准过)
  if (trackDuration > 0) return;
  const duration = el.duration && isFinite(el.duration) ? el.duration : 0;
  patchState({ duration });
}

// ── 播放 ──────────────────────────────────────────────────────────────

/**
 * 播列表里的第 index 项
 *
 * @param {number} index
 */
export async function playIndex(index) {
  const items = get(playlist).items;
  if (index < 0 || index >= items.length) return;
  const item = items[index];
  currentIndex.set(index);
  nowPlaying.set(item);
  await loadAndPlay(item);
}

/**
 * 直接播某一个视频 (不在播放列表里也能播, 比如从详情页跳过来)
 *
 * @param {Object} item { bvid, cid, title, pic, owner, duration }
 */
export async function playItem(item) {
  if (!item || !item.bvid) return;
  const items = get(playlist).items;
  const at = items.findIndex(v => v.bvid === item.bvid);
  if (at >= 0) {
    currentIndex.set(at);
  } else {
    currentIndex.set(-1);
  }
  nowPlaying.set(item);
  await loadAndPlay(item);
}

/**
 * 把这个视频**放到播放列表最顶上**并立刻播它
 *
 * 详情页点「听视频」走这条: 想听的那首就该排在第一个,
 * 后面的歌顺着往后排, 播完接着往下走。
 *
 * @param {Object} item { bvid, cid, title, pic, owner, duration }
 */
export async function playItemOnTop(item) {
  if (!item || !item.bvid) return;
  const it = {
    bvid: item.bvid,
    cid: item.cid || 0,
    title: item.title || '',
    pic: item.pic || '',
    owner: item.owner || null,
    duration: item.duration || 0
  };
  moveToPlaylistTop(it);
  currentIndex.set(0);
  nowPlaying.set(it);
  await loadAndPlay(it);
}

/**
 * 拉地址 + 起播
 *
 * @param {any} item
 */
async function loadAndPlay(item) {
  if (!el) return;
  const seq = ++loadSeq;
  patchState({ loading: true });
  advanced = false;
  try {
    let cid = item.cid;
    if (!cid) {
      const info = await getVideoInfo(item.bvid);
      if (seq !== loadSeq) return;
      cid = info && info.cid;
    }
    if (!cid) throw new Error('拿不到 cid');

    // 时长用 API 的 (元素报的 duration 在 m4s 上不可信)
    trackDuration = toSeconds(item.duration);

    // 听视频只要音频: DASH 的 **纯音频流** (m4s)。
    // 同样的时长只要 1/6 的流量 (真机实测: 4 分钟音频 m4s 约 1.85MB,
    // 音视频合一的 mp4 要 10.7MB)。
    const url = await getAudioUrl(item.bvid, cid);
    if (seq !== loadSeq) return;
    if (!url) throw new Error('拿不到音频地址');
    streamUrl = url;

    // 换歌了 → 正在用的缓存换成这一首 (上一首的 blob: URL 没人用了, 可以回收)
    const key = trackKey(item);
    cacheSetActive(key);

    // 这一首之前缓存过 → 直接播整段 (省一次拉流, 而且整段能精确快进)
    const cached = cacheGet(key);
    el.src = cached || url;
    el.playbackRate = 1;
    safeSeek(el, 0);
    patchState({ rate: 1, duration: trackDuration, cacheRatio: cached ? 1 : 0 });
    // play() 走 safePlay: 老 Gecko 的 play() 不返回 Promise, 而且可能同步抛。
    // 这里不自己判"播没播起来" —— 那是 'play' / 'pause' / 'error' 事件的事
    // (见 setAudioElement): 新设的 src 还在加载时, play() 返回了媒体也还没开始播。
    const ok = await safePlay(el);
    if (seq !== loadSeq) return;
    if (!ok) throw new Error('播不起来');
    patchState({ loading: false, time: el.currentTime || 0 });
  } catch (e) {
    if (seq !== loadSeq) return;
    // 换歌失败 → **把上一首停掉**。
    // 不停的话: 界面上已经是新歌 (标题/封面都换了), 耳朵里还是上一首 ——
    // 用户只会觉得"切歌没反应", 还以为菜单没点上。
    stopCurrentAudio();
    patchState({ playing: false, loading: false });
    showToast('这首播不了: ' + (e.message || '加载失败'));
  }
}

/** 停掉当前这一首 (换歌失败 / 退出播放时用) */
function stopCurrentAudio() {
  if (!el) return;
  try { el.pause(); } catch (e) {}
  try { el.src = ''; } catch (e) {}
  streamUrl = '';
}

/** 播放 / 暂停切换 */
export function togglePlay() {
  if (!el) return;
  if (!el.src) {
    // 还没开始播: 从当前项开始
    const idx = get(currentIndex);
    if (idx >= 0) playIndex(idx);
    else {
      const items = get(playlist).items;
      if (items.length) playIndex(0);
    }
    return;
  }
  if (el.paused) {
    // 元素已经加载好了, 这会儿 el.paused 是准的
    safePlay(el).then(ok => patchState({ playing: ok && !el.paused }));
  } else {
    el.pause();
    patchState({ playing: false });
  }
}

/**
 * 下一首 (播完自动切下一首也走这里)
 *
 * 走哪一首由**播放模式**决定 (顺序 / 列表循环 / 单曲循环 / 随机),
 * 规则写在 player/playmode.js 里 (纯逻辑, 有自测)。
 *
 * @param {boolean} [auto] true = 播完自动接的; false = 用户手动点的
 */
export function nextTrack(auto) {
  const items = get(playlist).items;
  if (!items.length) return;
  const act = nextAction(get(playMode), get(currentIndex), items.length, !!auto);
  if (act.type === 'stop') {
    // 顺序播放: 播到最后一首就停在这儿
    patchState({ playing: false });
    return;
  }
  if (act.type === 'replay') {
    // 单曲循环: 这首从头再放一遍 (不重新拉流, 直接跳回 0)
    replayCurrent();
    return;
  }
  playIndex(act.index);
}

/** 上一首 */
export function prevTrack() {
  const items = get(playlist).items;
  if (!items.length) return;
  const act = prevAction(get(playMode), get(currentIndex), items.length);
  if (act.type === 'stop') return;
  if (act.type === 'replay') {
    replayCurrent();
    return;
  }
  playIndex(act.index);
}

/**
 * 把当前这首从头再放一遍
 *
 * 单曲循环用得到: 不重新拉流 (省一次请求, 也快), 直接跳回 0 接着播。
 */
function replayCurrent() {
  const idx = get(currentIndex);
  if (!el || !el.src) {
    // 元素上什么都没有 → 只能重新拉一遍
    if (idx >= 0) playIndex(idx);
    return;
  }
  advanced = false;
  safeSeek(el, 0);
  safePlay(el).then(ok => {
    patchState({ playing: ok && !el.paused, time: 0 });
  });
}

/**
 * 引擎里"这一首"现在是什么状态
 *
 * 进入听视频页时要知道该怎么办:
 *   'playing'  正在放   → 什么都不用做 (别打断)
 *   'loading'  正在拉流 → 等着就行 (别重复拉一次)
 *   'paused'   暂停着 → 接着放 (从当前位置, 不回到开头)
 *   'none'     不是这首/还没开始 → 从头起播
 *
 * ⚠️ 不能只看 nowPlaying: 那只是"当前选中的是哪首", 暂停着的时候它也有值。
 * 真机上就踩过这个坑: 同一个 bvid 再进听视频页, 因为 nowPlaying 还指着它,
 * 页面以为"已经在放了"就跳过了起播 → 进去是个哑巴播放器。
 *
 * @param {string} bvid
 * @returns {'playing'|'loading'|'paused'|'none'}
 */
export function currentTrackState(bvid) {
  const cur = get(nowPlaying);
  if (!cur || cur.bvid !== bvid) return 'none';
  if (get(playState).loading) return 'loading';
  if (!el || !el.src) return 'none';
  return el.paused ? 'paused' : 'playing';
}

/**
 * 接着放引擎里这一首 (还在, 只是暂停了) —— 不重新拉流, 也不回到开头
 *
 * @param {string} bvid
 * @returns {boolean} 有没有可接着放的
 */
export function resumeTrack(bvid) {
  if (!el || !el.src) return false;
  const cur = get(nowPlaying);
  if (!cur || cur.bvid !== bvid) return false;
  const restart = () => {
    patchState({ playing: false });
    const again = get(nowPlaying);
    if (again && again.bvid === bvid) loadAndPlay(again);
  };
  // 播不起来 (地址过期 / 老 Gecko 抽风) → 重新拉一遍接着放
  safePlay(el, restart).then(ok => {
    // 元素是加载好的, 这会儿 el.paused 是准的
    if (ok) patchState({ playing: !el.paused });
  });
  return true;
}

/**
 * 跳一段 (快进/快退)
 *
 * @param {number} sec 正数快进, 负数快退
 */
export function seekBy(sec) {
  if (!el || !el.src) return;
  let t = (el.currentTime || 0) + sec;
  if (t < 0) t = 0;
  // 总时长用 API 的值 (元素报的 duration 在 m4s 上不可信, 见 trackDuration)
  const dur = trackDuration > 0
    ? trackDuration
    : (el.duration && isFinite(el.duration) ? el.duration : 0);
  if (dur > 0 && t > dur) t = dur;
  // 能不能直接跳过去? 看 **seekable** (不是 buffered):
  //   seekable = 媒体允许跳到的范围。
  //   边下边播的 m4s 被老 Gecko 当直播流 → seekable 末端就是"已经播到的位置",
  //   往后快进根本去不了 (真机实测: 播到 41 秒, 快进 60 秒 → 位置纹丝不动)。
  const sEnd = seekableEnd(el);
  if (sEnd > 0 && t > sEnd + 0.5) {
    // 去不了 → 把整段缓存下来, 换成整段播, 再精确跳过去
    seekBeyond(t).catch(() => {});
    return;
  }
  safeSeek(el, t);
}

/**
 * 快进到当前流去不了的位置 → 整段缓存 → 换成整段播 → 精确跳
 *
 * @param {number} t 目标位置 (秒)
 */
async function seekBeyond(t) {
  if (switching) return;
  const item = get(nowPlaying);
  if (!item || !item.bvid) return;
  switching = true;
  const rate = get(playState).rate || 1;
  patchState({ loading: true });
  try {
    const key = trackKey(item);
    // 已经缓存过这一首 → 直接拿 (不用重新下)
    let u = cacheGet(key);
    if (!u) {
      // 整段下下来 (要下完才能精确跳) —— 进度摆在听视频页上
      u = await cacheWholeTrack(key, streamUrl);
    }
    if (!u) {
      // 缓存失败 → 这条流只能往回跳 (不硬来)
      // 说一声, 不然用户按了快进没反应, 只当是坏了
      showToast('这条音频暂时没法快进');
      return;
    }
    // 换成整段音频: 时长和"能跳到的范围"这时才算得对
    el.src = u;
    await waitLoaded(el, 15000);
    safeSeek(el, t);
    await safePlay(el);
    try { if (el) el.playbackRate = rate; } catch (e) {}
    patchState({ rate });
  } finally {
    switching = false;
    patchState({ loading: false });
  }
}

/**
 * 整段缓存当前这条流 (为了能精确快进)
 *
 * 缓存由 player/cache.js 管: 有上限 (默认 50MB), 超了就从最早缓存的开始回收,
 * 正在播的那首不删。同一下载不会下两遍。
 *
 * @param {string} key  这一首的缓存标识
 * @param {string} url  流地址
 * @returns {Promise<string>} blob: URL, 失败返回空串
 */
function cacheWholeTrack(key, url) {
  if (!key || !url) return Promise.resolve('');
  patchState({ cacheRatio: 0 });
  return cacheTrack(key, url, r => {
    // 只有正在下的这首还是当前这首, 才更新页面上的进度
    if (key === trackKey(get(nowPlaying))) patchState({ cacheRatio: r });
  }).then(u => {
    patchState({ cacheRatio: u ? 1 : 0 });
    return u;
  });
}

/**
 * 倍速 (长按 → 键 = 2 倍速, 松手恢复 1 倍)
 *
 * @param {number} rate
 */
export function setRate(rate) {
  if (!el) return;
  try {
    el.playbackRate = rate;
  } catch (e) {}
  patchState({ rate });
}

/** 停止播放并清掉"正在播放" */
export function stopPlayback() {
  if (el) {
    try { el.pause(); } catch (e) {}
    try { el.src = ''; } catch (e) {}
  }
  loadSeq++;
  // 缓存**不删** —— 缓存是给"切回之前那首"用的, 由上限管着;
  // 这里只是把"正在播"这个标记放开 (这一首现在没人用了, 可以被回收)。
  cacheSetActive('');
  streamUrl = '';
  trackDuration = 0;
  advanced = false;
  nowPlaying.set(null);
  currentIndex.set(-1);
  miniVisible.set(false);
  patchState({ playing: false, time: 0, duration: 0, rate: 1, loading: false, cacheRatio: 0 });
  miniProgress.set(0);
}
