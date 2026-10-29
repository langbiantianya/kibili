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
import { cacheTrack, cacheGet, cacheSetActive, clearCache } from './cache.js';
import { nextAction, prevAction } from './playmode.js';
import { failJumpIndex } from './failjump.js';
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
/** 当前这一轮加载的序号 (给事件回调判断"是不是这次出的错") */
let loadSeqNow = 0;
/** 已经处理过的失败 (同一次加载只跳一次, 别跳两下) */
let failedSeq = -1;
/** 连着几首放不了 (连着失败太多就停, 别一直跳) */
let failStreak = 0;
/** 连着几首放不了就停下来 */
const MAX_FAIL_SKIP = 3;

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
 * 媒体元素上现在挂着的是哪个地址
 *
 * 用来判断"媒体元素报的这个错, 是不是当前这一首的错":
 * 换歌时旧流被取消 (老 Gecko 会报成错, 不是中断)、主动停掉时的空 src ——
 * 这两种都不能当成"这首放不了", 更不能跳歌。
 */
let curSrcUrl = '';

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
    el.addEventListener('error', () => {
      patchState({ playing: false, loading: false });
      // ⚠️ 这条错**不一定**是"当前这一首放不了" —— 分两种, 别搞错了:
      //
      //   1. 换歌时旧流被取消 (老 Gecko 把"中断"报成错) → 不是失败, 忽略
      //   2. 主动停掉时的空 src → 不是失败, 忽略
      //
      // 这两种要是当成失败, 后果是**每次切歌都自己跳到下一首** (听着像坏了)。
      // 真判据: 媒体元素上报的错码 + 现在挂着的地址是不是当前这一首的。
      const err = el.error;
      if (err && err.code === 1) return;              // 1 = MEDIA_ERR_ABORTED (被取消)
      if (!curSrcUrl || el.src !== curSrcUrl) return;  // 不是当前这一首的流
      // 媒体元素报错 (流拉不下来 / 解不开) → 当成"这首放不了", 跳下一首
      handleFailure(loadSeqNow, '播放出错');
    });
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
  // 位置在往前走 → 这首**真的放起来了** → 之前连着失败的计数作废。
  //
  // ⚠️ 只能在这儿清, 不能在"拉流成功"的时候清: 老 Gecko 的 play() 不返回
  // Promise, safePlay 一调用就"成功"了 —— 流根本拉不下来的时候它也返回成功。
  // 在那儿清的话, 连着放不了的歌会一直清成 0, 列表循环里就永远停不下来。
  failStreak = 0;
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
 * @param {boolean} [manual] true = 用户自己点的 (菜单里点歌 / 按播放键)
 *   → 连着失败的计数清零 (用户主动换歌, 是一次新的尝试, 不是自动跳过)
 */
export async function playIndex(index, manual) {
  const items = get(playlist).items;
  if (index < 0 || index >= items.length) return;
  const item = items[index];
  if (manual) failStreak = 0;
  currentIndex.set(index);
  nowPlaying.set(item);
  await loadAndPlay(item);
}

/**
 * 直接播某一个视频 (不在播放列表里也能播, 比如从详情页跳过来)
 *
 * @param {Object} item { bvid, cid, title, pic, owner, duration }
 * @param {boolean} [manual] 见 playIndex
 */
export async function playItem(item, manual) {
  if (!item || !item.bvid) return;
  const items = get(playlist).items;
  const at = items.findIndex(v => v.bvid === item.bvid);
  if (at >= 0) {
    currentIndex.set(at);
  } else {
    currentIndex.set(-1);
  }
  if (manual) failStreak = 0;
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
 * @param {boolean} [manual] 见 playIndex
 */
export async function playItemOnTop(item, manual) {
  if (!item || !item.bvid) return;
  const it = {
    bvid: item.bvid,
    cid: item.cid || 0,
    title: item.title || '',
    pic: item.pic || '',
    owner: item.owner || null,
    duration: item.duration || 0
  };
  if (manual) failStreak = 0;
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
  loadSeqNow = seq;
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
    //
    // ⚠️ **要 await**: 缓存现在存在 IndexedDB 里, 得从磁盘读出来才能用。
    // (以前是内存里的 blob: URL, 现在是异步的了)
    const cached = await cacheGet(key);
    // 读盘要一会儿, 期间用户可能已经换歌了 → 别把上一首挂上去
    if (seq !== loadSeq) return;
    const src = cached || url;
    el.src = src;
    curSrcUrl = src;   // 记下现在挂的是哪条流 (media error 事件要靠它分辨是谁的错)
    el.playbackRate = 1;
    safeSeek(el, 0);
    patchState({ rate: 1, duration: trackDuration, cacheRatio: cached ? 1 : 0 });
    // play() 走 safePlay: 老 Gecko 的 play() 不返回 Promise, 而且可能同步抛。
    // 这里不自己判"播没播起来" —— 那是 'play' / 'pause' / 'error' 事件的事
    // (见 setAudioElement): 新设的 src 还在加载时, play() 返回了媒体也还没开始播。
    const ok = await safePlay(el);
    if (seq !== loadSeq) return;
    if (!ok) throw new Error('播不起来');
    // ⚠️ 这里**不能**清 failStreak: 老 Gecko 的 play() 一调用就返回"成功",
    // 流根本拉不下来的时候它也成功 (真判据是 'error' 事件)。
    // 真正放起来了 (位置在走) 是 onTimeUpdate 里清的。
    patchState({ loading: false, time: el.currentTime || 0 });
  } catch (e) {
    if (seq !== loadSeq) return;
    patchState({ playing: false, loading: false });
    // 这首放不了 → 自动跳到下一首 (别卡在这一首上)
    // (跳不动的时候, handleFailure 自己会把声音停掉)
    handleFailure(seq, '这首播不了');
  }
}

/**
 * 某首放不了 → 自动跳到下一首
 *
 * @param {number} seq  出错的那一轮加载的序号
 * @param {string} reason 提示文案
 * @returns {boolean} 有没有跳走
 */
function handleFailure(seq, reason) {
  if (seq !== loadSeq) return false;   // 不是当前这一轮 (已经被新的加载顶掉了)
  if (failedSeq === seq) return false;  // 同一次失败只处理一次 (别跳两下)
  failedSeq = seq;
  failStreak++;
  if (failStreak > MAX_FAIL_SKIP) {
    // 连着几首都放不了 → 停下来, 别在列表里空转
    patchState({ playing: false, loading: false });
    showToast('连着 ' + failStreak + ' 首放不了, 停了');
    stopCurrentAudio();
    return false;
  }
  // 该跳到哪一首 (规则在 player/failjump.js 里, 有自测):
  //   顺序播放 → 到最后一首就停 (不绕回第一首)
  //   单曲循环 → 也当下一首处理 (反复播一首放不了的歌没意义)
  const items = get(playlist).items;
  const idx = failJumpIndex(get(playMode), get(currentIndex), items.length);
  if (idx < 0) {
    // 没下一首了 (顺序播放到头了 / 列表空着)
    //
    // ⚠️ 提示语要说准: 说"跳到下一首"结果没跳, 用户会以为按错了。
    showToast(reason + ', 没下一首了');
    stopCurrentAudio();
    return false;
  }
  showToast(reason + ', 跳到下一首');
  playIndex(idx);
  return true;
}

/** 停掉当前这一首 (换歌失败 / 退出播放时用) */
function stopCurrentAudio() {
  if (!el) return;
  try { el.pause(); } catch (e) {}
  try { el.src = ''; } catch (e) {}
  curSrcUrl = '';   // src 清了 → 元素随后报的错不算"某首放不了"
  streamUrl = '';
}

/** 播放 / 暂停切换 */
export function togglePlay() {
  if (!el) return;
  // 用户自己按的 → 连着失败的计数清零 (这是一次新的尝试)
  failStreak = 0;
  if (!el.src) {
    // 还没开始播: 从当前项开始
    const idx = get(currentIndex);
    if (idx >= 0) playIndex(idx, true);
    else {
      const items = get(playlist).items;
      if (items.length) playIndex(0, true);
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
  // 用户手动点的「下一首」→ 连着失败的计数清零 (一次新的尝试)
  if (!auto) failStreak = 0;
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
  playIndex(act.index, !auto);
}

/** 上一首 */
export function prevTrack() {
  const items = get(playlist).items;
  if (!items.length) return;
  failStreak = 0;   // 用户手动点的 → 连着失败的计数清零
  const act = prevAction(get(playMode), get(currentIndex), items.length);
  if (act.type === 'stop') return;
  if (act.type === 'replay') {
    replayCurrent();
    return;
  }
  playIndex(act.index, true);
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
    // ⚠️ cacheGet 现在是异步的 (数据在 IndexedDB 里, 得从磁盘读)
    let u = await cacheGet(key);
    if (!u) {
      // 整段下下来 (要下完才能精确跳) —— 进度摆在听视频页上
      u = await cacheWholeTrack(key, streamUrl);
    }
    if (!u) {
      // 整段缓存不下来 → 这首没法精确快进 → 按用户要求跳到下一首
      // (说一声, 不然用户按了快进没反应, 只当是坏了)
      handleFailure(loadSeqNow, '这条音频没法缓存');
      return;
    }
    // 读盘要一会儿, 期间可能已经换歌了 → 别把上一首的音频挂上去
    const now = get(nowPlaying);
    if (!now || now.bvid !== item.bvid) return;
    // 换成整段音频: 时长和"能跳到的范围"这时才算得对
    el.src = u;
    curSrcUrl = u;   // 现在挂的是整段缓存 (换源时旧流被取消的错不算失败)
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
 * 清理整段音频缓存 (设置里那个入口走这条)
 *
 * 正在播的那首**不清**: 它正被媒体元素用着, revoke 掉那个 blob: URL 声音会断。
 * 想连它一起清, 先「退出播放」。
 *
 * ⚠️ 现在是**异步**的: 缓存在 IndexedDB 里, 删除也要走事务。
 *
 * @returns {Promise<{freed: number, count: number}>} 清掉了多少字节 / 几首
 */
export function clearAudioCache() {
  return clearCache(true);
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
  curSrcUrl = '';
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
