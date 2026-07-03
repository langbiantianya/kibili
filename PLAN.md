# KaiOS 2.4 哔哩哔哩第三方客户端 — 实施计划

## Context

`d:/project/other/bilibili/` 是一个空白的 Vite + Svelte 4 项目骨架(vite.config.js、manifest.webapp、index.html、App.svelte 都是模板占位内容,src/lib/Counter.svelte 是 demo)。`node_modules` 已安装(`svelte 4.2.19`、`vite 4.5.3`、`@vitejs/plugin-legacy 4.1.1`、`core-js 3.35.0`)。

需要在此基础上构建一个**面向 KaiOS 2.4(Gecko 48、非触屏 240×320)**的哔哩哔哩第三方客户端,包含 **3 大板块**(首页 / 关注 / 个人中心)、**个人中心 → 历史记录 / 收藏**(收藏夹可作为播放列表)、**关注 → 视频 / 动态 两个子 Tab**、**视频播放器支持 320p 上限、全屏切换、快捷音量调节、听视频模式**。

由于 `api.bilibili.com` 的 CORS 限制(ACAO 仅为 `*.bilibili.com`),在第三方 origin 直接 fetch 会被拦截,但项目已申请 `systemXHR` 权限,可在 KaiOS 2.4 设备上以 XMLHttpRequest 绕过 CORS 直接访问 B 站 API。本计划据此设计,使用 XHR 而非 fetch,无需 CORS 代理。

## 用户决策(已确认)

| 议题 | 决策 |
|---|---|
| 320p 画质 | `qn=16`(B 站 360P 低清,~400kbps,最接近 320p 像素) |
| 强制登录 | 否,未登录即可浏览首页/收藏夹/视频播放 |
| CORS 代理 | 不使用,使用 systemXHR 绕过 |
| 请求方式 | 统一 XMLHttpRequest |
| 请求头 | Referer + User-Agent + Cookie |
| 听视频模式 | 接受屏幕保持微亮(在 KaiOS 2.4 上系统 XHR 休眠后无法真正后台播放) |

## 1. 架构总览

- **框架**: 沿用 Svelte 4 SPA(Vite 构建,无 SvelteKit)
- **路由**: 自写 hash 路由(`#/home`、`#/following`、`#/profile`、`#/history`、`#/favorites`、`#/folder`、`#/player`、`#/login`),按视图动态 import,首屏 ≤ 100KB
- **构建**: `@vitejs/plugin-legacy` target firefox 48,`build.outDir=build`,`cssCodeSplit=false`,`manualChunks` 分离 api/stores,`sourcemap: false`
- **网络**: 全部走 `systemXHR`(XMLHttpRequest)直接访问 `https://api.bilibili.com`,`*.bilivideo.com` 视频 CDN 由 `<video>` 元素直连(其 ACAO 为 `*`)
- **状态**: 6 个 Svelte stores + `persist.js` 封装 localStorage
- **键控**: 全局 keydown 总线 + 按路由分发的处理栈,`[data-navable]` 焦点漫游

## 2. 完整文件目录

```
bilibili/
├── index.html                          # KaiOS 视口/主题色/manifest link
├── vite.config.js                      # 替换为 KaiOS 构建配置
├── package.json                        # 增加 sharp(devDep,生成图标)
├── public/
│   ├── manifest.webapp                 # 替换:增加 audio-channel-content,device-storage:pictures
│   ├── locales/zh-CN.properties        # 新增:app name, softkey 标签
│   └── icons/
│       ├── icon-56.png                 # 新增 (从 B 站 logo 生成,PNG-8 < 3KB)
│       └── icon-112.png                # 新增
├── src/
│   ├── main.js                         # 启动:挂载 App、注册键盘、hydrate user
│   ├── app.css                         # 替换:24px 字体、240×320 reset、focus ring
│   ├── vite-env.d.ts                   # 保留
│   ├── App.svelte                      # 替换:3-tab 底栏 + <main #view-root> + 播放器插槽
│   ├── lib/
│   │   ├── api/
│   │   │   ├── bili.js                 # XHR 封装:UA/Referer/Cookie,Promise 包装
│   │   │   ├── feed.js                 # 首页推荐
│   │   │   ├── video.js                # 视频信息 + 播放地址(强制 qn=16, fnval=1)
│   │   │   ├── user.js                 # nav, history, fav folders, fav resources
│   │   │   ├── dynamic.js              # 关注动态(支持 type=video/all)
│   │   │   ├── followings.js           # 关注列表 + 关注 UP 最新视频
│   │   │   └── auth.js                 # QR 登录:generate / poll
│   │   ├── stores/
│   │   │   ├── user.js                 # SESSDATA/bili_jct/mid/name/face
│   │   │   ├── queue.js                # 当前播放列表(items/index/source)
│   │   │   ├── history.js              # 观看历史(本地缓存 + 远端分页)
│   │   │   ├── settings.js             # 音量/听视频默认/quality(固定 16)
│   │   │   ├── ui.js                   # route / softkeys / toast
│   │   │   └── persist.js              # localStorage try/catch 封装
│   │   ├── components/
│   │   │   ├── BottomNav.svelte        # 3-tab 底栏(Home/Following/Profile)
│   │   │   ├── SoftkeyBar.svelte       # 屏幕底部 L/R 软键标签
│   │   │   ├── FeedList.svelte         # 通用视频列表
│   │   │   ├── FeedCard.svelte         # 缩略图+标题+UP+时长
│   │   │   ├── ListItem.svelte         # 单行可导航项
│   │   │   ├── TabBar.svelte           # 子 Tab(视频/动态,文件夹切换)
│   │   │   ├── EmptyState.svelte       # "未登录/暂无数据"
│   │   │   ├── Loading.svelte          # 1 行 spinner(纯 CSS)
│   │   │   ├── Toast.svelte            # 顶部提示条
│   │   │   └── QRLogin.svelte          # QR 画布 + 轮询
│   │   ├── views/
│   │   │   ├── Home.svelte             # 推荐流
│   │   │   ├── Following.svelte        # TabBar + 视频流/动态流
│   │   │   ├── Profile.svelte          # 菜单:历史/收藏/登录
│   │   │   ├── History.svelte          # 观看历史列表
│   │   │   ├── Favorites.svelte        # 收藏夹文件夹列表
│   │   │   ├── FolderContents.svelte   # 单文件夹(顶置「全部播放」)
│   │   │   ├── Player.svelte           # 挂载 VideoPlayer + 队列推进
│   │   │   └── Login.svelte            # QR 登录页
│   │   ├── player/
│   │   │   ├── VideoPlayer.svelte      # <video> + 全屏 + 音量 + 听视频
│   │   │   ├── volume.js               # clampVol / 自动隐藏定时器
│   │   │   └── wake.js                 # mozWakeLock 包装
│   │   ├── keyboard/
│   │   │   ├── keys.js                 # code→name 映射表
│   │   │   ├── roving.js               # 焦点漫游算法
│   │   │   └── index.js                # 全局 keydown 总线 + 处理栈
│   │   ├── router/
│   │   │   ├── index.js                # hash 路由 + 动态 import
│   │   │   └── routes.js               # 路由 → 动态 import 映射
│   │   └── utils/
│   │       ├── time.js                 # formatDuration / relativeTime
│   │       ├── format.js               # 数字格式化(12345→1.2万)
│   │       └── platform.js             # KaiOS 嗅探
└── (删除) public/vite.svg, src/assets/svelte.svg, src/lib/Counter.svelte
```

## 3. 关键模块接口

### 3.1 `src/lib/api/bili.js` — XHR 基础封装

```js
const UA = 'Mozilla/5.0 (Mobile; KaiOS; rv:48.0) Gecko/48.0 Firefox/48.0 KaiOS/2.4';
const REFERER = 'https://www.bilibili.com/';
const BASE = 'https://api.bilibili.com';

export function request(path, { method = 'GET', query = {}, body, needCookie = false, signal } = {}) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(query).toString();
    const url = `${BASE}${path}${qs ? '?' + qs : ''}`;
    const xhr = new XMLHttpRequest({ mozSystem: true });  // ← 关键:systemXHR
    xhr.open(method, url, true);
    xhr.setRequestHeader('User-Agent', UA);
    xhr.setRequestHeader('Referer', REFERER);
    if (needCookie) {
      const u = get(user);
      if (u.sessdata) xhr.setRequestHeader('Cookie', `SESSDATA=${u.sessdata}`);
    }
    xhr.responseType = 'json';
    xhr.onload = () => {
      const data = xhr.response;
      if (data?.code !== 0) return reject(Object.assign(new Error(data?.message || 'err'), { code: data?.code }));
      resolve(data.data);
    };
    xhr.onerror = () => reject(new Error('network'));
    if (body) xhr.send(typeof body === 'string' ? body : JSON.stringify(body));
    else xhr.send();
  });
}
```

> `mozSystem: true` 是 systemXHR 权限的真正开关,必须与 `manifest.webapp` 的 `systemXHR` 权限共存。

### 3.2 `src/lib/api/video.js` — 强制 320p

```js
export const getVideoInfo = (bvid) => request('/x/web-interface/view', { query: { bvid }, needCookie: true });
export const getPlayUrl = async (bvid, cid) => {
  const data = await request('/x/player/playurl', {
    query: { bvid, cid, qn: 16, fnval: 1, fourk: 0, high_quality: 0, fnver: 0, fnflag: 0 },
    needCookie: true
  });
  return data.durl?.[0]?.url ?? data.durl?.[0]?.durl?.[0]?.url ?? '';
};
```

### 3.3 `src/lib/stores/queue.js` — 收藏夹可作为播放列表

```js
import { writable, get } from 'svelte/store';
import { getFavResources } from '../api/user.js';
import { getHomeFeed } from '../api/feed.js';
import { getDynamicFeed } from '../api/dynamic.js';

export const queue = writable({ items: [], index: 0, source: '' });

export async function loadFolder(media_id) {
  const all = [];
  for (let pn = 1; pn <= 50; pn++) {
    const d = await getFavResources(media_id, { pn, ps: 20 });
    all.push(...d.medias);
    if (!d.has_more) break;
  }
  queue.set({ items: all.map(m => ({ bvid: m.bvid, cid: m.id, title: m.title, pic: m.cover, owner: m.upper, duration: m.duration })), index: 0, source: 'folder' });
}
export async function loadFeed() { /* 类似,从 /x/web-interface/index/top/feed/rcmd */ }
export async function loadDynamic() { /* 从 /x/polymer/web-dynamic/v1/feed/all?type=video */ }
export function next() { queue.update(q => ({ ...q, index: Math.min(q.index + 1, q.items.length - 1) })); }
export function prev() { queue.update(q => ({ ...q, index: Math.max(q.index - 1, 0) })); }
```

### 3.4 `src/lib/player/VideoPlayer.svelte` — 320p + 全屏 + 音量 + 听视频(对齐 YouTube-KaiOS)

Props: `src`, `poster`, `title`, `bvid`, `cid`, `autoplay`

内部状态: `volume`、`showVolSlider`(音量按键时显示 1.5s 后自动隐藏)、`isFullscreen`、`listenOnly`、`error`

- `<video audio-channel="content" bind:this={video} {src} {poster}>`(audio-channel 让音频在系统层面不被立即静音)
- 全屏: `root.mozRequestFullScreen()`(Gecko 48 前缀);按 Back 短按 `mozCancelFullScreen()`(二级返回 → 详情页 mini-player 条);按 `SoftRight` 在全屏状态也退出全屏
- 听视频: `style.opacity='0'` 隐藏视频帧 + `navigator.mozWakeLock('screen')` 保持屏幕微亮(用户接受的折中)。`SoftLeft` 选项菜单或 `*` 键可切换
- 错误: `<video>` 的 `error` 事件显示 Toast "播放失败",并尝试刷新当前 cid(若是 403 过期,重拉一次)
- **数字键 `1`–`9` = decile-jump**:`video.currentTime = video.duration * (n/10)`(`0` = 重头)

> 完整键位表见 §4.4。`VideoPlayer` 内部 `onKey` 处理器只注册播放器专用键(D-pad 方向、`0`–`9`、`*`、`#`、音量);其它键(`1`/`2`/`3` 等)由父级 `Player.svelte` 的详情页处理器接管。

```js
// VideoPlayer 内部 onKey(只接管播放控制)
onKey('video-player', {
  'ArrowLeft':  () => video.currentTime = Math.max(0, video.currentTime - 5),
  'ArrowRight': () => video.currentTime = Math.min(video.duration, video.currentTime + 5),
  'ArrowUp':    () => showVolSlider = true,  // 同时 +0.1
  'ArrowDown':  () => showVolSlider = true,  // 同时 -0.1
  'Enter':      () => video.paused ? video.play() : video.pause(),
  '5':          () => video.paused ? video.play() : video.pause(),
  '1': () => video.currentTime = video.duration * 0.1,
  '2': () => video.currentTime = video.duration * 0.2,
  '3': () => video.currentTime = video.duration * 0.3,
  '4': () => video.currentTime = video.duration * 0.4,
  '6': () => video.currentTime = video.duration * 0.6,
  '7': () => video.currentTime = video.duration * 0.7,
  '8': () => video.currentTime = video.duration * 0.8,
  '9': () => video.currentTime = video.duration * 0.9,
  '0': () => video.currentTime = 0,
  '*': () => toggleListenOnly(),
  'AudioVolumeUp':   () => bumpVol(+0.1),
  'AudioVolumeDown': () => bumpVol(-0.1),
  'AudioVolumeMute': () => video.muted = !video.muted
});
```

### 3.5 `src/lib/keyboard/index.js` — 键控总线

```js
const stack = [];  // [{ name, map }]
let installed = false;

export function onKey(name, map) { stack.push({ name, map }); }
export function offKey(name)     { stack = stack.filter(s => s.name !== name); }
export function moveFocus(delta, root = document) {
  const list = [...root.querySelectorAll('[data-navable]:not([disabled])')];
  const i = list.indexOf(document.activeElement);
  const next = list[Math.max(0, i + delta)] ?? list[0];
  next?.focus(); next?.scrollIntoView({ block: 'center' });
}
function install() {
  window.addEventListener('keydown', e => {
    // 优先匹配栈顶(Player 注册的处理会优先于全局)
    for (let i = stack.length - 1; i >= 0; i--) {
      const handler = stack[i].map[e.key] || stack[i].map[e.keyCode];
      if (handler) { e.preventDefault(); handler(e); return; }
    }
  }, false);
}
```

## 4. 键位总表(对齐 YouTube for KaiOS + Symbian/BlackBerry 惯例)

设计原则(按优先级):
1. **播放器完全对齐 YouTube for KaiOS**: 用户的肌肉记忆来自 YouTube
2. **顶层 Tab 对齐 Facebook/Twitter Lite + BlackBerry World**: `1`–`5` 顶层目的地是 KaiOS 2.4 的成熟范式
3. **永远不绑 Send/End 键**: 系统保留给拨号和 Home
4. **Symbian/BlackBerry 沿用**: SoftLeft = "菜单/选项", SoftRight = "返回/退出"
5. **T9 输入框打开时,自动让出 `0`–`9`/`*`/`#`** 给输入法系统

> **Send/End 永不绑定。Back 是核心导航,作为「二级返回」使用。**

### 4.1 通用 / 全局可用

| 物理键 | keyCode | 行为 |
|---|---|---|
| Send(绿) | — | **禁止绑定**(系统保留给拨号) |
| End(红) | — | **禁止绑定**(系统保留给 Home/退出应用) |
| Back(短按) | 8 / 27 | 弹当前视图 / 关闭弹窗 |
| Back(长按) | — | 退出应用 |
| Volume Up/Down | 174 / 175 | 调系统音量; 全屏播放器中弹出 1.5s 应用内音量条 |
| SoftLeft (F1) | 183 | 上下文"菜单/选项" |
| SoftRight (F2) | 187 | 上下文"返回/更多" |

### 4.2 顶层 Tab 导航(对齐 Facebook Lite / Twitter Lite / BlackBerry World)

5 个顶层目的地用 `1`–`5` 直达:

| 键 | 目的地 | 备注 |
|---|---|---|
| `1` | 首页(推荐) | 数字键 + 底栏 + SoftLeft 三向都支持 |
| `2` | 关注(视频/动态 Tab) | |
| `3` | 个人中心 | |
| `4` | 搜索(后续,本版先做空路由) | 预留 |
| `5` | 设置 | star ★ = "设置/工具" (YouTube-KaiOS) |
| `0` | **跳回首页 Tab**(从任何 Tab 直达) | |
| `*` | 设置 | star 语义 |
| `#` | 关于 / 账号面板(显示 mid/登录状态) | pound 语义 |
| `D-pad Left` | 上一 Tab | |
| `D-pad Right` | 下一 Tab | |

### 4.3 Feed / 列表视图(首页、关注、历史、收藏夹文件夹)

| 键 | 行为 | 依据 |
|---|---|---|
| D-pad Up/Down | 焦点上下移动 | 标准 |
| D-pad Left/Right | 横向翻页(每页 5 条) | 快滚 |
| D-pad Center | 打开焦点视频 | 主操作 |
| `1`–`9` | **跳到第 N 个"页"**(每页 10 个,对应 1-indexed 偏移 (n-1)*10) | WhatsApp / FM Radio: 数字键跳项; YouTube 数字键 = 比例 |
| `0` | 刷新当前 feed | 上下文 0 |
| `*` | 收藏/取消收藏焦点项(快捷) | star 语义 |
| `#` | "更多" — 弹上下文菜单(分享、屏蔽、下载(后续)) | pound 语义 |
| SoftLeft | "选项" — 排序/筛选 | Symbian |
| SoftRight | "搜索" / "返回" | 视图相关 |

> **Bounded list(收藏夹文件夹列表)例外**: 项数 ≤ 30 时,`1`–`9` 直接打开第 N 个文件夹,而不是按页跳。

### 4.4 视频播放器(对齐 YouTube for KaiOS + Symbian mini-player + BlackBerry Music)

**D-pad 行为**: 跟 YouTube-KaiOS — Up/Down 显示/隐藏控件,Left/Right 短跳 ±5s。**不**用 Wynk 的"Up/Down = 音量,Left/Right = 上一首/下一首"那种激进方案(它会破坏 tab 间导航的肌肉记忆)。

| 键 | 行为 | 依据 |
|---|---|---|
| D-pad Center | 播放/暂停 | 标准 |
| D-pad Up | **显示**播放器控件层 | YouTube-KaiOS |
| D-pad Down | **隐藏**播放器控件层 | YouTube-KaiOS |
| D-pad Left | 后退 5 秒 | YouTube-KaiOS |
| D-pad Right | 前进 5 秒 | YouTube-KaiOS |
| `1` | 跳到 10% | **YouTube-KaiOS 金标准** |
| `2` | 跳到 20% | " |
| `3` | 跳到 30% | " |
| `4` | 跳到 40% | " |
| `5` | 播放/暂停(替代绑定) | Symbian mini-player / BlackBerry |
| `6` | 跳到 60% | " |
| `7` | 跳到 70% | " |
| `8` | 跳到 80% | " |
| `9` | 跳到 90% | " |
| `0` | **跳到 0%(从头开始)** | YouTube-KaiOS |
| `*` | 切换「听视频模式」(opacity 隐藏 + WakeLock) | star = "保存/最爱",此处复用为模式切换 |
| `#` | 打开「更多」弹层(弹幕、字幕、倍速 — 后续) | pound 语义 |
| Volume Up/Down | 系统音量 + 应用内音量条(1.5s 自动隐藏) | YouTube-KaiOS |
| Back(短) | **退出全屏 → 详情页 mini-player 条** | KaiOS 二级返回 |
| Back(长) | 暂停并退出播放器 → 返回列表 | YouTube-KaiOS |
| SoftLeft | "选项"(全屏切换 / 听视频 / 循环 / 选集) | Symbian "Options" |
| SoftRight | "听视频"(播放中) / "退出全屏"(已全屏) | 上下文 |

### 4.5 视频详情页(评论 + 互动栏)

详情页用 D-pad Left/Right 在三个区段间切换: **[简介/UP/统计] → [互动栏] → [评论区]**。

| 键 | 行为 | 依据 |
|---|---|---|
| D-pad Up/Down | 区内滚动 | 标准 |
| D-pad Left/Right | 切到上/下一区段 | YouTube-KaiOS |
| D-pad Center | 激活焦点元素 | 标准 |
| `1` | **点赞**(对当前视频,需登录) | B 站 web 顺序: 赞/币/藏 |
| `2` | **投币**(1 枚,需登录) | 顺序 |
| `3` | **收藏**(加入默认收藏夹,需登录) | 顺序 |
| `4` | 打开「收藏到指定文件夹」面板(后续) | 预留 |
| `5` | **进入全屏播放**(详情页最常见意图) | 5 = 主操作 |
| `6` | 关注 UP 主(需登录) | 预留 |
| `7` | 打开「分享」面板(后续) | 预留 |
| `8` | 打开「相关视频」面板(后续) | 预留 |
| `9` | 跳到「UP 主空间」 | 预留 |
| `0` | **「一键三连」(赞+币+藏)**: B 站梗 | 0 = "全部" |
| `*` | 收藏(等于 `3` 的快捷) | star |
| `#` | 「更多」: 举报/反馈/复制链接 | pound |
| SoftLeft | "选项" | Symbian |
| SoftRight | "返回" | 上下文 |

### 4.6 评论区(详情页内第三区段)

| 键 | 行为 |
|---|---|
| D-pad Up/Down | 焦点评论上下 |
| D-pad Left/Right | 翻页 |
| D-pad Center | 激活(展开二级评论 / 点赞) |
| `1` | 点赞焦点评论 |
| `5` | **打开 T9 输入框发新评论**(让出所有数字键给输入法) |
| `*` | 收藏焦点评论(预留) |
| `#` | 回复焦点评论(打开 T9) |
| SoftLeft | "选项" — 切 热门/最新 |
| SoftRight | "返回" |

### 4.7 收藏夹文件夹列表(Profile → Favorites)

**Bounded list**: 项数 ≤ 30,数字键直跳第 N 个。

| 键 | 行为 |
|---|---|
| D-pad Up/Down | 焦点移动 |
| D-pad Center | 打开文件夹 → 详情 → 「全部播放」 |
| `1`–`9` | **直接打开第 N 个文件夹** |
| `0` | "全部收藏" 汇总视图(把全部文件夹内容并到一个虚拟列表) |
| `*` | 新建文件夹(后续) |
| `#` | 重命名/删除/管理焦点文件夹(后续) |
| SoftLeft | "选项" |
| SoftRight | "返回" |

### 4.8 听视频模式(Lite Player / Audio-Only)

| 键 | 行为 |
|---|---|
| D-pad Center | 播放/暂停 |
| D-pad Up/Down | 上一首/下一首(queue 推进/回退) |
| D-pad Left/Right | 音频跳 ±15s(更长步进) |
| `0` | 退出听视频 → 详情页 |
| `*` | 收藏当前 |
| `#` | 显示视频简介 |
| SoftLeft | "选项" |
| SoftRight | "退出听视频" |
| Back | 退出听视频 → 详情页 |

### 4.9 键位实现注意事项

- **T9 输入框**: 数字键 `0`–`9`/`*`/`#` 自动让给输入法;**不**在 `onKey` 栈中处理这些键(用 `e.target` 是 `<input>` 时直接跳过)
- **二级返回(player → detail → feed)**: 在 `Player.svelte` 维护本地 `viewStack = ['player', 'detail', 'feed']`,Back 弹一层;长按 Back 直接回到 feed
- **跨视图的 `0` 多义**: 靠当前激活的视图分发;onKey 注册时绑定到具体视图名
- **`*` / `#` 的语义一致性**: star 一律代表"收藏/设置/最爱",pound 一律代表"更多/选项/信息"

## 5. 构建与配置变更

### 5.1 `vite.config.js`(完整替换)

```js
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  base: '',
  plugins: [
    svelte(),
    legacy({
      targets: ['firefox 48'],
      renderLegacyChunks: true,
      polyfills: ['es.promise', 'es.array.iterator', 'es.object.assign']
    })
  ],
  build: {
    target: 'es2015',
    cssCodeSplit: false,
    outDir: 'build',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          api: [
            './src/lib/api/bili.js',
            './src/lib/api/feed.js',
            './src/lib/api/video.js',
            './src/lib/api/user.js',
            './src/lib/api/dynamic.js',
            './src/lib/api/followings.js',
            './src/lib/api/auth.js'
          ],
          stores: [
            './src/lib/stores/user.js',
            './src/lib/stores/queue.js',
            './src/lib/stores/settings.js',
            './src/lib/stores/ui.js',
            './src/lib/stores/history.js',
            './src/lib/stores/persist.js'
          ]
        }
      }
    }
  }
});
```

### 5.2 `index.html`(完整替换)

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=240,height=320,initial-scale=1,user-scalable=no" />
<meta name="theme-color" content="#fb7299" />
<meta name="format-detection" content="telephone=no" />
<title>哔哩哔哩</title>
<link rel="manifest" type="application/x-web-app-manifest+json" href="/manifest.webapp" />
</head>
<body>
<div id="app"></div>
<script type="module" src="/src/main.js"></script>
</body>
</html>
```

### 5.3 `public/manifest.webapp`(完整替换)

```json
{
  "version": "1.0.0",
  "name": "bilibili",
  "description": "哔哩哔哩 - KaiOS 第三方客户端",
  "launch_path": "/index.html",
  "icons": {
    "56":  "/icons/icon-56.png",
    "112": "/icons/icon-112.png"
  },
  "developer": {
    "name": "Bilibili KaiOS",
    "url": "https://example.com"
  },
  "type": "privileged",
  "permissions": {
    "systemXHR": { "description": "使用系统 XHR 访问 B 站 API" },
    "audio-channel-content": { "description": "听视频模式后台音频" }
  },
  "locales": {
    "zh-CN": { "name": "哔哩哔哩", "description": "KaiOS 哔哩哔哩第三方客户端" }
  },
  "default_locale": "zh-CN",
  "orientation": "portrait"
}
```

### 5.4 图标

`public/icons/icon-56.png`(56×56)与 `icon-112.png`(112×112),PNG-8 调色板 ≤16 色,使用 ImageMagick 从 B 站 logo PNG 生成:`magick logo.png -resize 56x56 public/icons/icon-56.png && magick logo.png -resize 112x112 public/icons/icon-112.png`。

## 6. 视图布局规则(240×320 屏幕)

- **Top bar(24px)**:当前页面标题 + 软键标签占位
- **Main area(264px)**:滚动列表,每行高 48px(卡片 64px),留 2px 焦点边框空间
- **Bottom nav(32px)**:3 个 Tab(Home / Following / Profile),用数字键 1/3/5 切换

## 7. 数据契约(关键 API)

| 接口 | 路径 | 登录 | 用途 |
|---|---|---|---|
| 推荐 | `/x/web-interface/index/top/feed/rcmd?ps=20` | 否 | 首页 |
| 视频信息 | `/x/web-interface/view?bvid=...` | 否 | 取 cid |
| 播放地址 | `/x/player/playurl?bvid=...&cid=...&qn=16&fnval=1&fourk=0&high_quality=0` | 否(<=qn64) | 播放器 |
| 个人信息 | `/x/web-interface/nav` | 是 | mid/face/level |
| 历史 | `/x/web-interface/history/cursor?max=...&view_at=...&business=archive&ps=30` | 是 | 历史记录 |
| 收藏文件夹 | `/x/v3/fav/folder/created/list-all?up_mid={mid}` | 否 | 收藏夹列表 |
| 收藏内容 | `/x/v3/fav/resource/list?media_id=...&pn=...&ps=20&order=mtime` | 否(公开) | 单文件夹视频 |
| 关注列表 | `/x/relation/followings?vmid={mid}&pn=...&ps=50` | 推荐 | 关注 UP |
| 关注 UP 最新视频 | `/x/space/wbi/arc/search?mid=...&pn=1&ps=10&order=pubdate` | 否 | 关注→视频流 |
| 关注动态 | `/x/polymer/web-dynamic/v1/feed/all?type=video&offset=...` | 是 | 关注→动态流 |
| QR 生成 | `/x/passport-login/web/qrcode/generate` | 否 | 登录 |
| QR 轮询 | `/x/passport-login/web/qrcode/poll?qrcode_key=...` | 否 | 登录 |

## 8. 实现阶段(顺序)

1. **清理与基础**:删除 demo 文件;替换 `index.html`、`app.css`、`vite.config.js`、`manifest.webapp`;生成 `public/icons/*.png`
2. **基础设施**:`persist.js` → `stores/*` → `keyboard/keys.js` → `keyboard/roving.js` → `keyboard/index.js` → `router/*`
3. **网络层**:`api/bili.js`(XHR+systemXHR) → `api/feed.js` → `api/video.js` → `api/user.js` → `api/dynamic.js` → `api/followings.js` → `api/auth.js`
4. **公共组件**:`Loading`、`EmptyState`、`Toast`、`SoftkeyBar`、`ListItem`、`FeedCard`、`FeedList`、`TabBar`、`BottomNav`
5. **Home 视图 + 播放器骨架**:`Home.svelte` 拉取推荐 → 点击进 `Player.svelte` → `VideoPlayer.svelte` 播放 qn=16
6. **播放器完善**:全屏、音量条+硬件音量键、听视频(opacity 隐藏 + WakeLock)
7. **收藏夹作为播放列表**:`Favorites.svelte` 列表 → `FolderContents.svelte`(顶置"全部播放")→ 调用 `queue.loadFolder` → `Player.svelte` 队列播放
8. **关注 Tab**:`Following.svelte`(TabBar: 视频/动态)→ `dynamic.js` 的 `type=video` 与 `type=all` 两种模式
9. **个人中心 + 历史**:`Profile.svelte` 菜单 → `History.svelte` 拉 `/x/web-interface/history/cursor`,本地缓存 200 条
10. **登录流**:`Login.svelte` + `QRLogin.svelte` + `auth.js`;成功后写入 `user` store 并 `hydrateFromNav()`
11. **测试与构建验证**

## 9. 关键文件改动清单(优先序)

1. `d:/project/other/bilibili/vite.config.js` — 替换为 KaiOS 构建配置
2. `d:/project/other/bilibili/index.html` — 替换为 KaiOS 视口
3. `d:/project/other/bilibili/public/manifest.webapp` — 替换为带 systemXHR + audio-channel-content 的 privileged manifest
4. `d:/project/other/bilibili/src/App.svelte` — 替换为 3-tab 底栏 + view-root 容器
5. `d:/project/other/bilibili/src/app.css` — 替换为 240×320 reset
6. `d:/project/other/bilibili/src/main.js` — 替换为应用启动入口
7. `d:/project/other/bilibili/src/lib/api/bili.js` — XHR+systemXHR 基础封装(新建)
8. `d:/project/other/bilibili/src/lib/api/video.js` — getVideoInfo + getPlayUrl(qn=16 强制)
9. `d:/project/other/bilibili/src/lib/player/VideoPlayer.svelte` — 全屏+音量+听视频
10. `d:/project/other/bilibili/src/lib/views/Player.svelte` — 队列推进
11. `d:/project/other/bilibili/src/lib/views/FolderContents.svelte` — 收藏夹 → 播放列表
12. `d:/project/other/bilibili/src/lib/views/Following.svelte` — 视频/动态 Tab

## 10. 验证

### 10.1 构建验证
- `npm run build` 成功
- `build/index.html` 引用相对路径 `assets/index-*.js`
- entry chunk gzip 后 < 100KB,每个视图 chunk < 80KB
- `build/manifest.webapp` 存在且 MIME 正确

### 10.2 桌面 Firefox 调试(启用 systemXHR)
- 在 `about:config` 设置 `network.http.enablePrivXHR = true`,在 `dom.xhr_privileged_origin` 添加 `localhost:5173`
- `npm run dev` 启动;访问 `http://localhost:5173`
- 首页加载推荐列表
- 点击视频 → 播放 qn=16 → 全屏切换、音量条、听视频均工作
- Profile → 收藏 → 文件夹 → "全部播放" → 队列播放
- Profile → 历史 → 列表(需登录)
- 关注 → 视频 Tab / 动态 Tab 切换(动态需登录)

### 10.3 KaiOS 2.4 设备验证(若可用)
- 推送至 Nokia 8110 4G / JioPhone 2
- 首次启动接受 systemXHR 权限
- 实测键盘:数字键 1/3/5 切换 Tab,方向键漫游,软键对应 L/R
- 收藏文件夹连续播放
- 听视频模式:屏幕微亮、音频继续

### 10.4 验收清单
- [ ] 3 大板块(Home / Following / Profile)切换正常
- [ ] 关注 → 视频/动态 两个子 Tab 切换正常
- [ ] Profile → 历史记录、收藏 菜单可达
- [ ] 收藏文件夹可作为播放列表连续播放
- [ ] 视频强制 320p(qn=16,可在 Network 面板验证 query)
- [ ] 全屏切换正常(mozRequestFullScreen)
- [ ] 硬件音量键 + 屏幕音量条均可调
- [ ] 听视频模式:画面隐藏、音频继续、屏幕微亮至系统超时

## 11. 后续(范围外,本次先做)

- 搜索
- 弹幕
- 视频详情页(除播放器外) — **本次新增,见 §12**
- 评论区 — **本次新增,见 §12**
- 点赞/投币/收藏 — **本次新增,见 §12**
- WBI 签名(目前关注 UP 最新视频接口如需,再补 `wbi.js`)

---

## 12. 增量需求:视频详情 + 评论 + 点赞/投币/收藏

### 12.1 现状

`Player.svelte` 当前只挂载 `VideoPlayer`、推进队列。需要在播放器**关闭/退出全屏后**进入一个**视频详情页**(沿用 `#/player` 路由或拆为 `#/detail`?),包含:

1. **视频详情区**:标题、UP 主、播放数/弹幕数/时长、发布时间、简介
2. **评论区**:热门评论 + 最新评论(分页)
3. **互动栏**:点赞 👍 / 投币 🪙 / 收藏 ⭐ 三个按钮,登录后可点

### 12.2 设计决定

- **路由**:不增加新 hash 路由,沿用 `#/player`,但 `Player.svelte` 内部用 Tab 切换:
  - Tab 1: **播放** (`<VideoPlayer>` 满屏)
  - Tab 2: **详情** (标题/UP/简介 + 评论区 + 互动栏)
  - 默认进 Tab 1;按数字键 `2` 切到 Tab 2;`SoftLeft` 在 Tab 2 切换"热门评论/最新评论";`SoftRight` 退出回到 `#/folder` 或 `#/home`

  > 备选方案:拆为 `#/player` 和 `#/detail` 两个独立路由,详情页用软键右"详情"跳转。**采用 Tab 方案**,因为 KaiOS 2.4 上跳转全屏后焦点重置成本高,Tab 切换更顺。

- **数据**:复用 `getVideoInfo(bvid)`(已存在),新增 `getVideoInfo` 已经返回 `stat`(播放/弹幕/评论/点赞/投币/收藏/转发)和 `desc`(简介);UP 信息在 `data.owner`。评论用 `/x/v2/reply/main` 或 `/x/v2/reply?type=1&oid=...&pn=...&sort=...`。

- **互动 API**(必须登录,需要 `bili_jct`):
  - 点赞: `POST /x/v3/account/like/video` body `bvid=&like=1&csrf=...`
  - 投币: `POST /x/v2/account/coin/video` body `bvid=&multiply=1&csrf=...`(投 1 枚)
  - 收藏: `POST /x/v3/fav/video/add` body `bvid=&fid=0&csrf=...`(默认收藏夹)
  - 取当前用户对视频的点赞/收藏状态: 复用 `getVideoInfo` 的 `stat.like` 配合 `/x/v2/account/status` 或在 `getVideoInfo` 数据基础上,登录后额外请求 `view/extra` 或从 `data.req_user.demand_attention` 等字段(简单方案:登录后调用 `/x/v2/account/status` 一次性拿点赞/关注状态)

### 12.3 三个接口补充

`src/lib/api/interact.js`(新建):

```js
import { request } from './bili.js';
import { get } from 'svelte/store';
import { user } from '../stores/user.js';

const requireLogin = () => {
  const u = get(user);
  if (!u.sessdata) throw new Error('NOT_LOGIN');
  if (!u.bili_jct)  throw new Error('NO_CSRF');
  return u;
};

export const getReplies = (oid, { pn = 1, ps = 20, sort = 2 } = {}) =>
  request('/x/v2/reply', { query: { type: 1, oid, pn, ps, sort } });
// sort: 0=时间, 1=热度, 2=热门(默认) , 3=回复

export const likeVideo = (bvid, liked = true) => {
  const u = requireLogin();
  return request('/x/v3/account/like/video', { method: 'POST', body: `bvid=${bvid}&like=${liked ? 1 : 2}&csrf=${u.bili_jct}` });
};
export const coinVideo = (bvid, multiply = 1) => {
  const u = requireLogin();
  return request('/x/v2/account/coin/video', { method: 'POST', body: `bvid=${bvid}&multiply=${multiply}&csrf=${u.bili_jct}` });
};
export const favVideo = (bvid, fid = 0) => {
  const u = requireLogin();
  return request('/x/v3/fav/video/add', { method: 'POST', body: `bvid=${bvid}&fid=${fid}&csrf=${u.bili_jct}` });
};
// 取当前用户对视频的"已点赞/已投币/已收藏"状态
export const getStatus = (bvid) => {
  const u = get(user);
  if (!u.sessdata) return Promise.resolve({ like: 0, coin: 0, fav: 0 });
  return request('/x/v2/account/status', { query: { bvid }, needCookie: true });
};
```

### 12.4 XHR POST body 编码注意事项

`bili.js` 当前只接受字符串 body,POST 接口需要 `application/x-www-form-urlencoded`。把 body 直接传字符串(如 `` `bvid=...&like=1&csrf=...` ``),并显式设置 `Content-Type` 头。修改 `request()`:

```js
// bili.js 改动
xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
// body 直接 send 字符串即可
```

### 12.5 详情/评论组件新增

- `src/lib/components/VideoMeta.svelte` — 标题/UP/简介/统计(已通过 `getVideoInfo` 取到)
- `src/lib/components/CommentList.svelte` — 虚拟列表(限 240×320,每条 48px,首屏 5 条,按需 `IntersectionObserver` 不现实,KaiOS 2.4 直接分页拉取)
- `src/lib/components/InteractBar.svelte` — 三按钮 1×3 横排,行高 32px
  - 数据流:`{ liked, likedCount, coined, coinCount, faved, favCount, loading }`
  - 未登录按下后 Toast「请先登录」,跳 `#/login`
  - 已登录按下后:乐观更新 UI → 调接口 → 失败回滚 + Toast 错误
  - 二次点击取消(点赞/收藏支持 toggle,投币一次性)

### 12.6 互动按钮键位(应用 §4.5 详情页表)

| 键 | Tab=详情页 |
|---|---|
| 1 | 点赞(需登录) |
| 2 | 投币(需登录) |
| 3 | 收藏 / 取消收藏(需登录) |
| 4 | 收藏到指定文件夹(后续) |
| 5 | 进入全屏播放 |
| 0 | **一键三连**: 赞 + 币 + 藏(B 站梗) |
| * | 收藏(等于 `3` 快捷) |
| # | 更多: 举报/复制链接(后续) |
| D-pad Left/Right | 切区段: [简介/UP/统计] → [互动栏] → [评论区] |
| SoftLeft | 选项(切评论排序: 热门 ↔ 最新) |
| SoftRight | 返回来源页(`#/folder` 或 `#/home`) |
| Back | 退出详情 → 播放器(若正在播放) / 上一路由 |

未登录时按 `1`/`2`/`3` → Toast「请先登录」+ 跳 `#/login`。

### 12.7 路由 + Player 重构(键位对齐 §4.4 / §4.5)

`Player.svelte` 改为:

```svelte
<script>
  import { onMount, onDestroy } from 'svelte';
  import { queue, next, prev } from '../stores/queue.js';
  import { user, isLogin } from '../stores/user.js';
  import { getVideoInfo } from '../api/video.js';
  import { getReplies, getStatus, likeVideo, coinVideo, favVideo } from '../api/interact.js';
  import VideoPlayer from '../player/VideoPlayer.svelte';
  import VideoMeta from '../components/VideoMeta.svelte';
  import CommentList from '../components/CommentList.svelte';
  import InteractBar from '../components/InteractBar.svelte';

  let tab = 'play';           // 'play' | 'detail'
  let detailSection = 0;      // 0=meta, 1=interact, 2=comments (D-pad L/R 切换)
  let meta = null;
  let replies = [];
  let replySort = 2;          // 2=热门, 0=最新
  let status = { like: 0, coin: 0, fav: 0 };
  let current;
  let viewStack = ['detail']; // 二级返回栈

  $: current = $queue.items[$queue.index];
  $: loadMeta(current?.bvid);
  async function loadMeta(bvid) {
    if (!bvid) return;
    meta = await getVideoInfo(bvid);
    status = await getStatus(bvid);
    const r = await getReplies(meta.aid, { sort: replySort });
    replies = r.replies ?? [];
  }

  const toastLogin = () => { /* ui.toast = '请先登录'; navigate('#/login'); */ };

  onMount(() => {
    onKey('player', {
      // === 跨 Tab 切换 ===
      '5': () => { tab = tab === 'play' ? 'detail' : 'play'; },

      // === 详情页 Tab 内 ===
      '1': async () => { if (!$isLogin) return toastLogin(); await likeVideo(current.bvid, !status.like); status.like = status.like ? 0 : 1; },
      '2': async () => { if (!$isLogin) return toastLogin(); await coinVideo(current.bvid); status.coin = 1; },
      '3': async () => { if (!$isLogin) return toastLogin(); await favVideo(current.bvid); status.fav = status.fav ? 0 : 1; },
      '0': async () => { if (!$isLogin) return toastLogin(); await Promise.all([likeVideo(current.bvid, true), coinVideo(current.bvid), favVideo(current.bvid)]); status = { like: 1, coin: 1, fav: 1 }; },
      '*': async () => { if (!$isLogin) return toastLogin(); await favVideo(current.bvid); status.fav = status.fav ? 0 : 1; },  // star = 收藏快捷
      'ArrowLeft': () => detailSection = Math.max(0, detailSection - 1),
      'ArrowRight': () => detailSection = Math.min(2, detailSection + 1),
      'SoftLeft': () => { replySort = replySort === 2 ? 0 : 2; loadMeta(current.bvid); },
      'SoftRight': () => { viewStack = []; navigate(-1); },
      'Back': () => {
        if (tab === 'detail') { tab = 'play'; return; }
        // 二级返回: detail → feed
        navigate(-1);
      }
    });
  });
  onDestroy(() => offKey('player'));
</script>

{#if tab === 'play'}
  <VideoPlayer {src} {poster} {title} on:ended={next} />
  <!-- VideoPlayer 内部键位: 1-9 = decile-jump, D-pad L/R = ±5s, 0 = 重头, * = 听视频, # = 更多 -->
{:else}
  <section class="meta"     class:active={detailSection === 0}><VideoMeta {meta} /></section>
  <section class="interact" class:active={detailSection === 1}><InteractBar {status} on:like={...} on:coin={...} on:fav={...} /></section>
  <section class="comments" class:active={detailSection === 2}><CommentList {replies} /></section>
{/if}
```

### 12.8 新增/修改文件清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `src/lib/api/interact.js` | 新建 | like/coin/fav/getReplies/getStatus |
| `src/lib/api/bili.js` | 修改 | 增加 POST 字符串 body + Content-Type 头 |
| `src/lib/components/VideoMeta.svelte` | 新建 | 标题/UP/简介/统计 |
| `src/lib/components/CommentList.svelte` | 新建 | 评论列表 + 分页 |
| `src/lib/components/InteractBar.svelte` | 新建 | 点赞/投币/收藏按钮 + 乐观更新 |
| `src/lib/components/TabBar.svelte` | 新建(若未存在) | 「播放 / 详情」Tab 切换 |
| `src/lib/views/Player.svelte` | 重写 | 内嵌 Tab + 详情/评论/互动 |
| `src/lib/stores/user.js` | 扩展 | 确认 `bili_jct` 持久化(QR 登录时已写入) |

### 12.9 验证补充

- 登录后,播放页按 `2` 切到「详情」→ 看到标题/UP/简介/统计
- 按 `1` 点赞 → 接口返回 0 → 计数 +1,按钮状态变「已赞」
- 按 `3` 收藏 → 接口返回 0 → 状态变「已藏」;再次按 `3` 取消
- 按 `4` 投币 → 1 枚 → 计数 +1(不可取消)
- 评论区按 `SoftLeft` 切换「热门/最新」,滚到末自动加载下一页
- 未登录按下任一互动键 → Toast「请先登录」→ 跳 `#/login`
- 离线/网络错 → Toast「操作失败」,回滚乐观更新

### 12.10 范围外仍不做

- 二级评论(楼中楼)
- @回复 / 发评论
- 收藏到指定文件夹(只默认收藏夹)
