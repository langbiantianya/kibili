# Kibili — KaiOS 哔哩哔哩客户端

基于 Svelte 3 + Rollup 构建的 KaiOS 第三方哔哩哔哩（B站）客户端，使用 AI 辅助开发。

**下载最新安装包** 👉 [Releases](https://github.com/langbiantianya/kibili/releases)

## 功能

- 🏠 **首页推荐** — 个性化视频推荐信息流
- 👥 **关注列表** — 已关注 UP 主的视频与动态
- 🔍 **搜索** — 关键词搜索视频
- 🔐 **账号登录** — 扫码登录，支持 Cookie 持久化
- ▶️ **视频播放** — 自适应码率播放，全屏模式，音量控制
- 💬 **视频评论** — 查看评论与回复
- 📜 **历史记录** — 观看历史，播放进度上报
- ⭐ **收藏列表** — 查看收藏夹及内容
- ⚙️ **设置** — 基础应用设置

### 开发中 / 计划中

- [ ] 弹幕
- [ ] 用户主页
- [ ] 一键三连（点赞 / 收藏 / 投币）
- [ ] 关注 / 取关

## 技术栈

| 类别 | 技术 |
| ------ | ------ |
| UI 框架 | [Svelte 3](https://svelte.dev/) |
| 构建工具 | [Rollup](https://rollupjs.org/) |
| 路由 | [svelte-spa-router](https://github.com/EmilTholin/svelte-spa-router) |
| CSS 兼容 | PostCSS（CSS 变量展开 / gap 降级 / preset-env） |
| ES 降级 | Babel + Terser → ES5（目标 Firefox 48 / KaiOS 2.4） |
| 二维码 | [qrcode-generator](https://github.com/nicennnnnnnlee/qrcode-generator) |
| 许可证 | AGPL-3.0 |

## 项目结构

```text
├── public/                  # 静态资源 (图标, manifest.webapp)
├── scripts/
│   ├── dev-server.js        # 开发服务器 (Express + 代理)
│   ├── install-device.js    # 打包并安装到真机 (adb + 设备调试协议)
│   ├── device-test.js       # 真机自动测试 (冒烟检查 + 截图)
│   ├── device-console.js    # 抓应用内 console 输出 / 执行 JS
│   ├── test-keyboard.js     # 按键框架无头自测 (Node, 不需要真机)
│   └── lib/
│       └── ui-probe.js      # 注入页面运行的 UI 探针 (被 device-test.js 使用)
├── src/
│   ├── main.js              # 入口
│   ├── App.svelte           # 根组件 + 路由
│   ├── app.css              # 全局样式 + CSS 变量
│   └── lib/
│       ├── api/             # B站 API 封装
│       │   ├── auth.js      #   登录鉴权
│       │   ├── bili.js      #   请求基础层 (WBI 签名)
│       │   ├── dynamic.js   #   动态
│       │   ├── feed.js      #   推荐信息流
│       │   ├── followings.js#   关注
│       │   ├── interact.js  #   互动 (点赞/收藏/投币)
│       │   ├── user.js      #   用户信息
│       │   ├── video.js     #   视频详情/播放
│       │   └── wbi.js       #   WBI 签名算法
│       ├── components/      # UI 组件
│       ├── keyboard/        # 按键导航框架 (按键总线/作用域/焦点漫游)
│       ├── player/          # 视频播放器
│       ├── router/          # 路由工具
│       ├── stores/          # Svelte stores (状态管理)
│       ├── utils/           # 工具函数
│       └── views/           # 页面视图
├── index.html               # HTML 模板
├── rollup.config.js         # Rollup 构建配置
└── package.json
```

## 如何构建

### 环境要求

- Node.js ≥ 14
- npm

### 开发

```bash
# 安装依赖
npm install

# 启动开发服务器 (Express + B站 API 代理)
npm run dev
```

### 生产构建

```bash
# 清理 + 构建
npm run build
```

构建产物输出到 `build/` 目录，包含：

| 文件 | 说明 |
| ------ | ------ |
| `app.js` | IIFE 格式单文件 bundle（ES5） |
| `app.css` | PostCSS 处理后的样式（CSS 变量已展开） |
| `index.html` | 入口页面 |
| `manifest.webapp` | KaiOS 应用清单 |
| `icons/` | 应用图标 |

### 安装到真机（adb + 设备调试协议）

KaiOS 没有 `adb install`：应用必须以 packaged app 的形式装进 `/data/local/webapps`，
WebIDE / OmniSD / make-kaios-install 走的都是同一条路：

```text
build/ 打包成 application.zip (manifest.webapp 在压缩包根目录)
   ↓ adb push
/data/local/tmp/b2g/<appId>/application.zip
   ↓ 转发调试端口 + webapps actor 的 install 请求
设备安装应用
```

一条命令搞定（打包 → 推送 → 安装 → 启动，并打印安装结果）：

```bash
npm run build
node scripts/install-device.js
```

前置条件：

| 条件 | 说明 |
| --- | --- |
| 调试模式 | 手机拨号 `*#*#33284#*#*`（状态栏出现 bug 图标），或 设置 → 设备 → 开发者 → 调试器 → 选择 ADB 和 DevTools。**重启手机后会被清除，需要重新打开** |
| USB 授权 | `adb devices` 能看到设备（`device` 状态而不是 `unauthorized`） |
| 依赖 | `adb` 在 PATH 里；打包还需要 `zip`（Windows 用 PowerShell 的 `Compress-Archive`，脚本已自动选择） |

脚本内部做的事（排障时可按此手工执行）：

```bash
# 1. 打包（appId 取自 manifest 的 origin：app://bilibili.com → bilibili.com）
cd build && zip -Xr ../application.zip $(ls) && cd ..

# 2. 推送安装包（/data/local/tmp 是 tmpfs，重启会清空）
adb shell mkdir -p /data/local/tmp/b2g/bilibili.com
adb push application.zip /data/local/tmp/b2g/bilibili.com/application.zip

# 3. 转发设备调试端口（同一端口要先 --remove，否则旧监听会让连接被拒）
adb forward --remove tcp:6000
adb forward tcp:6000 localfilesystem:/data/local/debugger-socket
#    然后向 root actor 发 listTabs 拿到 webappsActor，向它发:
#    { type: "close",   manifestURL: "app://bilibili.com/manifest.webapp" }   # 旧实例要先关, 否则手机上仍是旧代码
#    { type: "install", appId: "bilibili.com", appType: 2 }                    # appType 2 = packaged
#    { type: "launch",  manifestURL: "app://bilibili.com/manifest.webapp" }
```

要点：

- **appId 就是 `manifest.webapp` 里 `origin` 的主机名**，它同时决定安装目录名和 `app://` 地址；改 origin 就等于换了个新应用（登录态不会跟着走）。
- **设备调试 socket 同一时间只接受一个客户端**，别和 WebIDE 或另一个脚本同时连（后连的会被拒绝）。
- **重装后一定要 close → install → launch** 一次，只 install 的话手机上跑的还是旧代码。
- 安装脚本会打印权限等级（`systemXHR` 需要 `privileged` 及以上）、`installed` 状态和是否已在运行。
- 应用数据（localStorage 里的登录态等）在重装后保留；`/data/local/tmp` 里的安装包重启后需要重新推送。

### 查看真机日志

KaiOS 没有 `am` / `input` / `screencap`，可用的通道是下面这些。

**1）系统与平台日志（logcat）**

```bash
adb logcat -c                                  # 清空缓冲
adb logcat | grep -E 'BrowserElement|FocusManager'   # 按键与焦点（调试 UI 最常用）
adb logcat -s Gecko:V GeckoConsole:V            # 按 tag 过滤
adb shell b2g-ps                                # 应用进程列表 (b2g 是 KaiOS 的浏览器进程, 不是 Android)
```

实测有用的几类行（示例为本机真实抓取）：

```text
# 按键是否真的送达应用、落在哪个元素上 (KaiOS 会打印 DOM key 名与焦点元素)
Gecko   : [BrowserElement] event type: keydown, key: SoftLeft, target: [object HTMLDivElement], class: feed-card svelte-…
Gecko   : [BrowserElement] event type: keydown, key: ArrowDown, target: [object HTMLIFrameElement], src: app://bilibili.com/index.html, id: browser9
FocusManager: -> focus is now on, tag: DIV, id: , class: feed-card svelte-…
# 输入法 (若 T9/内置键盘异常会看到这条, 说明 inputcontextfocus 无人处理)
Gecko   : MozKeyboard.js: A frame with input-manage permission did not handle the inputcontextfocus event dispatched.
# systemXHR 权限是否被使用
       : XMLHttpRequest nsXMLHttpRequest::getPermission:0,type:0
# 调试连接相关
GeckoDump: XXX FIXME : Got a mozContentEvent: transport-closed
```

注意：`SoftLeft` / `SoftRight` / `Enter` / `ArrowUp` 等是 **DOM key 名**，不是 Linux 键码。

**2）应用内日志（`console.*` 与未捕获异常）**

**应用内的 `console.log/warn/error` 和未捕获异常不会进 logcat**（本机实测 0 条），
要拿到它们得连设备调试协议的 console actor（WebIDE 的控制台走的是同一条路）：

```bash
node scripts/device-console.js                          # 跟踪 (Ctrl-C 退出)
node scripts/device-console.js --once                   # 打印已缓存的消息后退出
node scripts/device-console.js --eval 'location.hash'   # 在应用里执行一段 JS, 并打印返回值
```

输出形如：

```text
已连接 app://bilibili.com/manifest.webapp 的 console actor (appId 哔哩哔哩)，下面是应用内输出:
[log] hello-from-eval #/profile 哔哩哔哩
[eval] 返回: {"route":"#/profile","navables":6,"softkeys":"打开|登出"}
```

`--eval` 也能当“真机自检”用，比如查软键文案、焦点元素、标题是否被截断、图标是否渲染：

```bash
node scripts/device-console.js --once --eval 'JSON.stringify({
  route: location.hash,
  softkeys: document.querySelector(".softkey-bar").innerText.replace(/\s*\n\s*/g,"|"),
  title: document.querySelector(".title") && getComputedStyle(document.querySelector(".title")).maxHeight
})'
```

**3）按键注入与截图（自动化 UI 用）**

- 按键：设备没有 `input` 命令，用 `sendevent` 直接写 `/dev/input/event1`（matrix_keypad）。
  本机实测映射：`139`→`SoftLeft`、`158`→`SoftRight`、`352`→`Enter`、`103/108/105/106`→方向键、`14`→`Backspace`。
  ```bash
  adb shell "sendevent /dev/input/event1 1 108 1; sendevent /dev/input/event1 0 0 0; \
            sendevent /dev/input/event1 1 108 0; sendevent /dev/input/event1 0 0 0"
  ```
- 截图：`screencap` 在 KaiOS 上不可用（没有 SurfaceFlinger），走调试协议的 `deviceActor.screenshotToDataURL`（返回 240×320 PNG dataURL），`install-device.js` 里那段协议客户端可以直接复用。

### 真机自动测试（adb + 调试协议）

改完东西不用人肉点一遍：把当前构建装到真机，然后跑冒烟检查。

```bash
npm run build
node scripts/install-device.js     # 装上要测的版本
node scripts/device-test.js         # 跑检查, 退出码 0 = 全过, 1 = 有失败项
```

常用参数：

```bash
node scripts/device-test.js --shot ./shots            # 每个页面存一张真机截图 (240x320 PNG)
node scripts/device-test.js --only home,player       # 只跑指定页面
node scripts/device-test.js --only back-key          # 只验证右软键返回
```

实跑输出（11 个页面 + 一次真实按键）：

```text
设备: app://bilibili.com/manifest.webapp  视口 240x320
✓ home            softkeys={"left":"刷新","center":"打开","right":"搜索"} navables=8
✓ following       softkeys={"left":"刷新","center":"","right":"切Tab"} navables=22
✓ profile         softkeys={"left":"打开","center":"","right":"登出"} navables=6
✓ history         softkeys={"left":"刷新","center":"播放","right":"返回"} navables=30
✓ favorites       softkeys={"left":"刷新","center":"打开","right":"返回"} navables=9
✓ settings        softkeys={"left":"","center":"","right":"返回"} navables=1
✓ about           softkeys={"left":"","center":"","right":"返回"} navables=11
✓ search          softkeys={"left":"搜索","center":"","right":"返回"} navables=10
✓ search-results  softkeys={"left":"刷新","center":"打开","right":"返回"} navables=20
✓ player          softkeys={"left":"全屏","center":"暂停","right":"返回"} navables=0
✓ back-key        右软键 #/settings → #/profile

结果: 11/11 项通过
```

检查项（全部在真机上判定）：

| 检查 | 判定方式 | 能抓住的典型问题 |
| --- | --- | --- |
| 页面可达 | 导航后等待，探针能取到快照 + 软键栏 | 路由写错、渲染崩溃、白屏 |
| 软键文案 | 与 `PAGES` 表里的期望值逐项比对 | 软键没接处理器、标签与行为不符 |
| 子页面返回键 | 注入右软键（`sendevent 158`），断言路由变化 | 子页面出不去、返回层级错乱 |
| 字形是否存在 | canvas 位图与空白/豆腐块位图比对 | emoji 图标在 KaiOS 上渲染成空白 |
| 图片是否加载 | `complete && naturalWidth === 0` | 坏图、协议相对 URL、缺封面 |
| 列表是否被裁 | 可滚动容器盒模型 vs 最近裁剪祖先 | 底部内容永远滚不到 |
| 是否超出视口 | 元素右边界 vs 240px | 长文本把布局撑破 |
| 焦点是否可见 | 活动元素矩形是否落在视口内 | 焦点跑到屏幕外 |
| JS 异常 | 订阅 console actor 的 `pageError` 事件 | 未捕获异常 |

实现原理（四个原语，都通过设备调试协议 + adb）：

| 原语 | 通道 |
| --- | --- |
| 读页面状态 | `consoleActor.evaluateJS` 注入 `scripts/lib/ui-probe.js`，返回 JSON 快照 |
| 真机按键 | `adb shell sendevent /dev/input/event1 …` 注入真实按键 |
| 截图 | `deviceActor.screenshotToDataURL` |
| 页面异常 | `consoleActor.startListeners(['PageError'])` |

扩展方式：

- 加检查项：改 `scripts/lib/ui-probe.js`（在 `issues` 里 `push({t, …})` 即可，`device-test.js` 会按 `t` 分类报错）。
- 加页面/改期望：`scripts/device-test.js` 的 `PAGES` 表（路径 + 等待时间 + 期望软键）。
- 加一次性验证：`node scripts/device-console.js --eval '<js>'` 在真机上执行并打印返回值。

注意事项：

- 设备调试 socket 同时只接受一个客户端，别和 WebIDE / `device-console.js` 同时跑。
- 页面数据来自 B 站接口，网络抖动会产生误报，建议先确认页面数据正常再判失败。
- 登录态相关的页面（首页/收藏/历史/关注）需要手机上是已登录状态。
- `--shot` 输出的截图就是手机当时真实画面，可直接贴进 issue。

## 兼容性说明

本项目专为 **KaiOS 2.4**（基于 Firefox 48 / Gecko 引擎）优化：

- **CSS 变量** — 构建时通过 `postcss-css-variables` 全部展开为具体值，运行时无需 `var()` 支持
- **Flexbox gap** — 通过 `postcss-gap-properties` 降级；flexbox gap 在 Firefox 48 上无完美 polyfill，小间距（4-8px）视觉差异可接受
- **ES5 输出** — Babel `preset-env` + Terser 确保 `ecma:5` 输出，无箭头函数、模板字符串等现代语法
- **单文件 bundle** — IIFE 格式，`inlineDynamicImports: true`，KaiOS 不支持 ES module loader
- **图标字形** — KaiOS 系统字体不含 emoji（`💬`/`⭐`/`🪙`/`👁`… 会渲染为空白或豆腐块），界面图标统一使用字体内置符号（`❤ ▶ ❝ ★ ◎ ▤ ● ∅` 等），新增图标前需在真机确认字形存在
- **文字截断** — Gecko 48 不支持 `-webkit-line-clamp`，标题类样式需额外给出 `max-height` 兜底
- **登录接口形态** — web 扫码登录的 `qrcode/poll` 成功响应改为只在 `Set-Cookie` 响应头里下发 `SESSDATA`/`bili_jct`/`DedeUserID`（响应里的 `url` 只剩 `ticket`）。KaiOS 的 `mozSystem` XHR **可以**读到该响应头（实测），但**不会**使用 cookie jar 发请求，因此必须从响应头取值：`extractCookies()` 同时兼容"URL 参数"与"响应头"两种形态，并对响应头里的值做 URL 解码（SESSDATA 含逗号，须原样回传）

## 键位与软键约定

KaiOS 把硬件返回键（`KEY_BACK`）上报为 DOM 事件 `key: "SoftRight"`，因此右软键同时承担"页面动作"和"返回"：

| 位置 | 约定 |
| --- | --- |
| 左软键 | 页面主操作（首页=刷新、播放器详情=全屏、播放器评论=回复、动态详情=评论/回复） |
| 中间 | 中键（OK）当前会做什么的提示（打开/播放/暂停），本身不接收按键 |
| 右软键 | 子页面固定为返回：`/history`、`/settings`、`/about`、`/search`、`/search-results`、`/favorites`、`/folder`、`/login`、`/player`、`/fullscreen`、`/dynamic-detail`；三个主 Tab（首页/关注/我的）保持各自动作（搜索/切Tab/登出） |

- 方向键：上下移动焦点（列表内自动滚动居中），左右在详情/评论等子 Tab 间切换
- 中键：打开/播放/暂停；评论列表中展开子评论
- 回复框等模态组件打开时独占按键（左软键=取消，右软键=发送，Enter=发送）
- 返回键家族：右软键 `SoftRight`、退格键 `Backspace`、挂断键 `EndCall`、Smart Touch 的 `GoBack`/`BrowserBack` 都能当"返回"用（顶层页面不拦截，交给系统退出）
- 有硬件音量键的机型（`VolumeUp`/`VolumeDown`/`VolumeMute`）在播放器里调音量；系统类按键（电源/相机/拨号/短信/通知/语音助手）一律不拦截，长按才能退出应用

## 按键导航框架

`src/lib/keyboard/` 是全应用**唯一**的按键入口。视图不再各自监听 `window`，而是注册"按键作用域"（scope），由总线统一分发。

| 文件 | 职责 |
| --- | --- |
| `keys.js` | 按键归一化：把 KaiOS 各机型不一致的 `e.key` / `keyCode` 统一成规范名 |
| `scopes.js` | 作用域注册表：优先级、独占、按实例注销 |
| `roving.js` | 焦点漫游：`[data-navable]` 收集、上下移动、区域边界、滚动居中、激活 |
| `index.js` | 按键总线：分发顺序、输入框策略、默认行为、长按 |
| `modalkeys.js` | 模态框独占作用域（回复框等） |
| `device.js` | 设备能力探测（有没有相机键/音量键/挂断键） |

### 规范键名

同一个物理键在不同机型/固件/输入法状态下上报的 DOM key 并不统一（方向键可能是 `ArrowUp` 也可能是 `Up`，中键可能是 `Enter` 也可能是 `Accept`，甚至 `Unidentified` + keyCode）。**所有按键判断都必须先归一化**，按键表统一用规范名。

键名取自 Gecko 48 的 `dom/events/KeyNameList.h`（KaiOS 2.4 实际能产生的 key），keyCode 取自 `dom/interfaces/events/nsIDOMKeyEvent.idl`：

| 规范名 | DOM key | keyCode | 说明 |
| --- | --- | --- | --- |
| `Up` / `Down` / `Left` / `Right` | `ArrowUp` / … | 38 / 40 / 37 / 39 | 方向键（每台机器都有） |
| `Enter` | `Enter` / `Accept` | 13 | 中键 |
| `SoftLeft` / `SoftRight` | `SoftLeft` / `SoftRight` | **0** | 左右软键（KaiOS 把硬件 `KEY_BACK` 上报成 `SoftRight`） |
| `Back` | `Backspace` | 8 | 退格键（官方语义就是"返回上一级"） |
| `BrowserBack` | `BrowserBack` | 0 | 浏览器返回键 |
| `GoBack` | `GoBack` | 0 | Smart Touch 返回键（KaiOS 3，如 Nokia 8000 4G） |
| `EndCall` | `EndCall` | 0 | 挂断键（官方语义"结束当前操作"） |
| `VolumeUp` / `VolumeDown` | `VolumeUp` / `VolumeDown` | **183 / 182** | 音量键（Gecko 48 的值） |
| `Mute` | `VolumeMute` | 181 | 静音键 |
| `Symbol` | `Symbol` | 0 | 符号输入键（`#` `*` `-` `+` `@`） |
| `Camera` / `Power` / `Call` / `HeadsetHook` / `Notification` / `LaunchWebBrowser` / `LaunchMail` | 同名 | 0 | 系统/其它应用的键，**应用不应吞掉** |
| `0`–`9`、`*`、`#` | 同名字符 | 48–57 | 数字键与符号键 |

⚠️ **Gecko 48 里软键/相机键/电源键没有对应的 `DOM_VK`** —— 它们的 `keyCode` 是 `0`，只能靠 `e.key` 识别。官方文档也明确要求用 `KeyboardEvent#key`（`code` 会随键盘布局变，不可靠）。

⚠️ **KaiOS 2.4 与 KaiOS 3 的音量 keyCode 正好相反**（2.4: 183=音量+；3.0: 182=音量+）。框架为此做了**运行时自学习**：只要见过一次"已知 key 名 + 某个 keyCode"，就记住这台机器的对应关系，之后 `e.key === 'Unidentified'` 的事件也能正确还原。自学习到的映射优先于静态表。

### 设备按键探测

不是每台机器都有全部硬件键（每台 KaiOS 都有方向键 + 左右软键；相机/音量/挂断键看机型）。KaiOS 提供了特性探测 API：

```js
import { hasDeviceKey, initDeviceKeys } from '../keyboard/device.js';

await hasDeviceKey('volume');    // 'volume' | 'camera' | 'endcall' | 'qwerty'
```

- KaiOS 2.5：`navigator.hasFeature('device.capability.volume-key')`
- KaiOS 3.0：`DeviceCapabilityManager.get('device.key.volume')`
- KaiOS 2.4：没有这个 API，一律返回 `false`（调用方走降级逻辑）

需要 manifest 里的 `feature-detection` 权限。

### 注册按键作用域

```js
import { onKey, roam } from '../keyboard/index.js';

onMount(() => {
  // onKey 返回注销函数, 直接交给 onMount 的返回值 → 组件销毁时自动清理
  return onKey('my-page', {
    SoftLeft: () => refresh(),        // keydown 立即触发
    SoftRight: () => navigate('/home'),
    Down: () => roam(+1, () => loadMore())  // 到底了回调 loadMore
  });
});
```

- 键名用规范名（`Up`/`Down`/`Enter`/`SoftLeft`/`SoftRight`/`Back`/数字字符）
- 值可以是函数，或 `{ press, long, release, repeat, threshold }`（长按用）：
  `press` 松手时触发、`long` 按住 `threshold` 毫秒后触发、`release` 松手时必定触发
- 函数返回 `false` 表示"我没处理这个键" → 总线不 `preventDefault`，浏览器默认行为照常发生
- `onKey(name, map, { priority })` 声明优先级，大的优先（默认 0；模态 100、播放器 10、全局返回 -100）

### 框架默认行为

页面没有注册对应按键时，框架自动提供：

- `Up` / `Down` → 在 `[data-navable]` 元素之间移动焦点，滚动到可视区中央
- `Enter` → 激活当前焦点元素（等价于点击它）

所以绝大多数页面只需要注册软键即可。

### 焦点区域

列表容器加 `data-nav-root` 后，上下键只在该区域内移动，不会跳到别的区域：

```html
<div class="feed-list scroll-y" data-nav-root>…</div>
```

### 输入框与模态框

- **输入框聚焦时**：只有文字类按键（数字/字母/空格/退格/标点）让给输入法；方向键、中键、软键仍然交给页面（页面显式注册了才生效）
- **模态框打开时**：注册一个独占作用域，只有模态能响应按键，且只对它声明的按键 `preventDefault` —— 输入框照常编辑文字、移动光标

```js
import { openModalScope } from '../keyboard/modalkeys.js';

const closeScope = openModalScope('reply', {
  SoftLeft: () => close(),
  SoftRight: () => send(),
  Enter: () => send(),
  Back: () => (!value ? close() : false)  // 非空时返回 false → 退格正常删字
});
```

### 自测

按键框架的纯逻辑可以在 Node 里跑（不需要真机）：

```bash
node scripts/test-keyboard.js
```

覆盖按键归一化、作用域优先级与实例隔离、输入框策略、模态独占、焦点漫游的首/末/边界、长按与 keyup 收尾。

## 致谢

- [bili-apis](https://github.com/realysy/bili-apis) — B站 API 参考
- [Svelte](https://svelte.dev/) — UI 框架
- [Rollup](https://rollupjs.org/) — 模块打包

## 许可证

[AGPL-3.0](LICENSE)
