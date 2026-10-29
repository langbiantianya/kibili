# Kibili — KaiOS 哔哩哔哩客户端

基于 Svelte 3 + Rollup 构建的 KaiOS 第三方哔哩哔哩（B站）客户端，使用 AI 辅助开发。

**下载最新安装包** 👉 [Releases](https://github.com/langbiantianya/kibili/releases)

## 功能

- 🏠 **首页推荐** — 个性化视频推荐信息流
- 👥 **关注列表** — 已关注 UP 主的视频与动态
- 🔍 **搜索** — 关键词搜索视频
- 🔐 **账号登录** — 扫码登录，支持 Cookie 持久化
- ▶️ **视频播放** — 自适应码率播放，全屏模式，音量控制
- 💬 **视频评论** — 查看评论（支持多层级楼中楼）
- 📜 **历史记录** — 观看历史，播放进度上报
- ⭐ **收藏列表** — 查看收藏夹及内容
- 🎧 **听视频** — 纯音频播放页：封面 + 进度条，可最小化成底部迷你条，播放列表本地持久化
- ⚙️ **设置** — 基础应用设置
- 📋 **软键菜单** — 软键栏的二级 / 三级操作（主页三个 Tab、视频页、全屏页）
- 🚪 **退出应用** — 所有菜单（主页三个 Tab / 视频页 / 全屏页）的最后一项：退出前先把路由归位到首页，再关掉应用

### 开发中 / 计划中

- [ ] 弹幕
- [x] 用户主页
- [ ] 一键三连（点赞 / 收藏 / 投币）
- [ ] 关注 / 取关
- [ ] **评论回复**（软键已显示「待实现」，接口层 `addReply` 还在）

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
│       ├── menu/            # 全局二级菜单
│       │   └── appMenu.js   #   三个 Tab 的菜单构造器 + 退出应用项（两套菜单共用）
│       ├── player/          # 视频播放器 (含听视频的播放引擎 engine.js)
│       ├── router/          # 路由工具
│       ├── stores/          # Svelte stores (状态管理)
│       │   ├── home.js      #   首页推荐流 (数据缓存 / 焦点位置)
│       │   ├── following.js #   关注页状态 (tab / 数据缓存 / 焦点位置)
│       │   ├── softkey.js   #   软键菜单 (二级/三级: 层级栈 / 高亮 / 面包屑)
│       │   └── keytest.js   #   按键检测数据 (真机核对用, 可从 adb 拉取)
│       ├── utils/           # 工具函数
│       │   └── commenttree.js #  评论对话树 (按 parent 建树, 多层级)
│       └── views/           # 页面视图
│           ├── ImageViewer.svelte # 图片全屏查看 (左右切图)
│           ├── KeyTest.svelte # 按键检测页 (真机核对实体键 ↔ 框架映射)
│           └── MenuTest.svelte # 菜单测试页 (真机试软键栏的二级/三级菜单)
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
[eval] 返回: {"route":"#/profile","navables":6,"softkeys":{"left":"","center":"打开","right":""}}
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

实跑输出（14 个页面 + 8 段真机按键）：

```text
设备: app://bilibili.com/manifest.webapp  视口 240x320
✓ home            softkeys={"left":"刷新","center":"打开","right":"更多"} navables=8
✓ following       softkeys={"left":"刷新","center":"打开","right":"更多"} navables=22
✓ profile         softkeys={"left":"","center":"打开","right":"更多"} navables=6
✓ history         softkeys={"left":"刷新","center":"播放","right":""} navables=30
✓ favorites       softkeys={"left":"刷新","center":"打开","right":""} navables=9
✓ settings        softkeys={"left":"","center":"","right":""} navables=5
✓ about           softkeys={"left":"","center":"","right":""} navables=11
✓ keytest         softkeys={"left":"","center":"选择","right":""} navables=19
✓ menu-test       softkeys={"left":"","center":"选择","right":"更多"} navables=6
✓ search          softkeys={"left":"刷新","center":"","right":"搜索"} navables=10
✓ search-results  softkeys={"left":"刷新","center":"打开","right":""} navables=20
✓ user            softkeys={"left":"刷新","center":"","right":""} navables=11
✓ player          softkeys={"left":"全屏","center":"播放","right":"更多"} navables=0
✓ fullscreen      softkeys={"left":"隐藏","center":"播放","right":"更多"} navables=0
✓ menu            二级/三级菜单: 展开 → 进三级 → 退格回退 → 执行动作 全通过
✓ video-menu      视频页菜单: 二级 5 入口 (含末项「退出应用」) + 播放控制/互动三级菜单 + 副提示 + 快进 5 秒 全通过
✓ fullscreen-menu 全屏菜单: 右软键开关菜单 + 比详情页多一项「视频分辨率」 + 副提示跟着绑定走 + 中键提示跟着播放状态走 全通过
✓ fullscreen-quality全屏菜单切分辨率: 换流 + 位置接着走 + 设置里的默认分辨率跟着变 全通过
✓ fullscreen-nobar关掉设置: 软键栏藏起来 + 右软键照样展开完整菜单 + 关菜单后继续藏 全通过
✓ back-key        返回键 #/settings → #/profile
✓ tab-menu        三个 Tab: 右软键变「更多」+ 原动作进菜单 + 末项「退出应用」 全通过
✓ search-back     菜单跳搜索页后返回键能退回主页 全通过
✓ exit-app        退出应用: 主页菜单和视频页菜单都能退出 + 路由先重置到 / + 真把应用关掉 + 重开落在首页 全通过

结果: 23/23 项通过
```

> 上面是**加听视频之前**的实跑结果。新增的 `listen` 用例、以及 PAGES 里多出来的
> 听视频页（以及三个列表页右软键改成「更多」之后的变化）**还没在真机上跑过**
> —— 写这轮功能时设备掉线了。脚本已经备好，设备连上就能跑。

检查项（全部在真机上判定）：

| 检查 | 判定方式 | 能抓住的典型问题 |
| --- | --- | --- |
| 页面可达 | 导航后等待，探针能取到快照 + 软键栏 | 路由写错、渲染崩溃、白屏 |
| 软键文案 | 与 `PAGES` 表里的期望值逐项比对 | 软键没接处理器、标签与行为不符 |
| 软键栏藏起来 | `getClientRects().length` 判定栏有没有真的画出来 | 沉浸模式关不掉、藏了之后菜单也一起打不开 |
| 子页面返回键 | 注入右软键（`sendevent 158`），断言路由变化 | 子页面出不去、返回层级错乱 |
| 字形是否存在 | canvas 位图与空白/豆腐块位图比对 | emoji 图标在 KaiOS 上渲染成空白 |
| 图片是否加载 | `complete && naturalWidth === 0` | 坏图、协议相对 URL、缺封面 |
| 列表是否被裁 | 可滚动容器盒模型 vs 最近裁剪祖先 | 底部内容永远滚不到 |
| 是否超出视口 | 元素右边界 vs 240px | 长文本把布局撑破（全屏播放器按横屏设计，豁免） |
| 焦点是否可见 | 活动元素矩形是否落在视口内 | 焦点跑到屏幕外 |
| 视频分辨率 | 菜单里切档 → 比对 `<video>` 宽度 + `settings.quality` | 切了档没换流 / 设置没跟着持久化 |
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
- **所有请求都带超时**（默认 20s，整个脚本上限 20min）。设备调试协议偶发漏回包（页面卡死、USB 掉线），没有超时保护的话脚本会永久挂住、看起来像"卡死"。超时按失败项计入结果，脚本继续往下跑。

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

**返回归返回键，软键归页面。** 软键是"页面动作"键（可被页面自由定义），返回是"导航"键（全局统一），两者不再混用。

| 物理键 | 规范名 | 全局作用 | 页面可覆盖 |
| --- | --- | --- | --- |
| 返回键（退格键 / 方向键右边的「←」） | `Back` | **返回上一级**（全局兜底） | 可 |
| Smart Touch 返回键 | `GoBack` / `BrowserBack` | 返回上一级 | 可 |
| 通话键 | `Call` | **不拦截**（交给系统拨号） | **不可** |
| 挂断键 | `EndCall` | **不拦截**（交给系统挂断） | **不可** |
| 左软键 | `SoftLeft` | 无 | 页面主操作 |
| 右软键 | `SoftRight` | **无**（不再兜底返回） | 页面动作 |
| 中键 | `Enter` | 激活当前焦点元素 | 页面可改 |
| 方向键 | `Up`/`Down`/`Left`/`Right` | 焦点漫游 | 页面可改 |

| 位置 | 约定 |
| --- | --- |
| 左软键 | 页面主操作（首页=刷新、播放器详情=全屏、播放器评论=待实现、动态详情=评论/待实现、全屏页=隐藏/显示软键栏、听视频页=最小化） |
| 中间 | 中键（OK）当前会做什么的提示（打开/播放/暂停），本身不接收按键 |
| 右软键 | 页面自己定义（主页三个 Tab = 更多菜单、视频页 = 更多菜单、全屏页 = 更多菜单、听视频页 = 更多菜单、搜索页 = 搜索）；**没定义就是什么都不做** |

- 方向键：上下移动焦点（列表内自动滚动居中），左右在详情/评论等子 Tab 间切换
- 中键：打开/播放/暂停；评论列表中展开子评论
- **动态详情的中键提示跟着内容走**：这条动态能播视频（视频动态本身，或转发的原动态是视频）→ 中键显示「播放」，按中键直接进播放器；没有视频可播 → **中键不显示任何文案**（没绑定的键不显示提示）。切到「评论」Tab → 中键提示跟着焦点走（焦点在某条评论上 = 「展开」/「收起」，焦点不在评论上就不显示）
- **「我的」页不绑左右软键**：进页面焦点落在用户卡片上，中键（OK）打开当前选中项（用户卡片 / 历史记录 / 收藏 / 设置 / 关于 / 登出），软键栏只留中间的"打开"提示
- **关于页的「开发者」**：直接在应用里进他的**个人主页**（`/user?uid=29529884`），不是 `window.open` 拉起外部浏览器看网页空间 —— KaiOS 上外部浏览器体验差，而且应用内已经有这套用户主页了
- **搜索页**：左软键=刷新热搜，右软键=搜索；中间提示跟着焦点走（焦点在热搜列表里="打开"，输入框里中键什么都不做、就不显示文案）；↑ 从热搜列表顶部回到输入框，输入框里再按 ↑ 原地不动。**输入框里不绑中键搜索** —— 输入文本时按 OK 容易误触，搜索走右软键
- **主页三个 Tab（首页 / 关注 / 我的）**：右软键 = **「更多」二级菜单**（原来绑在右软键上的动作都收进去了：首页 = **搜索**，关注 = **切 Tab**，我的 = 原来没绑右软键 → 菜单里只剩「退出应用」）；菜单最后一项固定是 **「退出应用」**（退出前先把路由重置到 `/`，再关掉应用窗口）。菜单里跳到搜索页后，**返回键能正常退回主页**（搜索页一进来焦点在输入框上，空输入框的退格键不再被输入法吃掉）
- **视频页**：右软键 = **「更多」菜单**（二级菜单 5 个入口，按顺手程度排：**UP 主页** / **播放控制**（快进/快退/音量加/音量减，带「长按 → 键」这类副提示）/ **互动**（一键三连/点赞/投币/收藏）/ **分享** / **退出应用**；除 UP 主页和「退出应用」外都有子项 = 三级菜单）；**播放器固定 240P**（小屏够看又省流量，B 站没这一档时会给最低可用档）；设置里关掉「打开视频立刻播放」时，中键 = 去加载并播放（此时页面只显示封面）
- **全屏播放器**：↑ 后退 10 秒，↓ 短按前进 10 秒、**长按直接进 2 倍速**（长按不会先跳 10 秒，松手恢复原速）；←/→ 与硬件音量键调系统音量；**中键 = 播放/暂停**，中键提示**跟着真实播放状态走**（正在播放显示「暂停」，已暂停显示「播放」）；**右软键 = 显示/隐藏二级菜单**（文案「更多」，和视频详情页同一份菜单、同一侧同一个文案），菜单里多一项 **「视频分辨率」**（三级：240P / 360P / 480P / 720P，当前档用 ✓ 标出；切完**跟着设置里的「全屏默认分辨率」一起持久化**，下次进全屏就用它）；**左软键 = 显示/隐藏整条软键栏**（文案「隐藏」/「显示」，写的是按下之后会做什么；按一下就切，藏的只是那一行提示，**菜单照常能展开**）。页面按横屏布局（视频转 90°），宽高按视口算不写死，详见「全屏播放器」章
- **听视频页**（纯音频）：**← 短按 = 上一首 / 长按 = 快退**、**→ 短按 = 下一首 / 长按 = 快进**（按住不放，每 0.8 秒跳 5 秒）、↑ 系统音量+、↓ 系统音量−、中键 = 播放/暂停（提示跟着播放状态走）、**左软键 = 最小化**（收起页面，底部浮迷你条，声音继续）、右软键 = 「更多」菜单（UP主页/**播放控制**（上一首/下一首/快退/快进/音量加/音量减/**2 倍速**开关）/播放列表/播放模式/点赞/投币/收藏/一键三连/查看评论/退出播放），详见「听视频」章
- 模态组件打开时独占按键（左软键=取消，右软键=发送，Enter=发送）；评论回复框暂时下线（见「评论」章），模态独占这套机制本身留着给回复功能做回来用
- **返回键家族**：退格键 `Backspace`（规范名 `Back`，官方语义就是"返回上一级"）、Smart Touch 的 `GoBack`/`BrowserBack` 都能当"返回"用（顶层页面也拦下来：首页/关注/我的按返回键不退出应用，退出走菜单里的「退出应用」，主页/视频页/全屏页的菜单里都有）
- **通话键 `Call` / 挂断键 `EndCall` 永远不拦截**：它们关系到打电话本身，网页吞掉用户就没法拨号、没法挂断。框架在按键总线的**最前面**就把这两个键放行（`NEVER_INTERCEPT`）——不进任何作用域、不 `preventDefault`，连页面显式声明也接管不到（连页面显式声明也接管不到）
- 有硬件音量键的机型（`VolumeUp`/`VolumeDown`/`VolumeMute`）在播放器里调音量，**只调系统音量**（见下面「音量只走系统」）；系统类按键（电源/相机/拨号/挂断/短信/通知/语音助手）一律不拦截，长按才能退出应用
- **左软键在这类机型上是 `KEY_MENU`，DOM 层拿到的 key 名是 `SoftLeft`**（不是 `F1`/`ContextMenu`）。按下时系统会同时弹自己的菜单 —— 这是 OS 行为，网页拦不住，但按键本身能正常绑定。**实测副作用**：菜单弹着的这段时间应用被挂到后台，**XHR 回调不会回来**（实测 45 秒不返回，菜单关掉后才恢复）—— 所以用左软键做"刷新"时，页面先保持旧内容不变，等菜单关掉数据才更新；刷新逻辑不要在 `await` 之后才去清空列表，否则菜单期间会白屏

> 为什么把右软键从返回家族里摘出去：以前右软键兜底返回，副作用是**每个子页面的右软键都被"返回"占住**，页面自己声明的动作还容易被全局兜底抢走（旧实现里就出过"右软键在二级页仍然触发搜索"的回归）。现在返回只有一个入口（返回键），软键栏的文案和按键行为严格一一对应，没绑定的键就不显示文案。

### 音量只走系统

播放器里调音量（长按 ↑↓、硬件音量键）**只调系统音量**，应用自己不维护"应用内音量"。

原因：KaiOS 2.4 的 `navigator.volumeManager` 只有 `requestUp()` / `requestDown()` / `requestShow()` 三个方法 —— 真机实测确认**没有当前音量的读数，也没有 `input` 事件**。应用读不到系统在第几档。

所以：

- 媒体元素不设 `volume`（保持 1.0），不叠第二层增益 —— 听到的声音就等于系统音量
- 应用不画自己的音量滑块 —— 读不到系统档位，画出来的条只会和系统对不上
- 调音量时 `requestUp()` / `requestDown()` 会让**系统自己弹出音量气泡**（真机实测是紫色圆形气泡，显示 `1/15` 这样的档位），反馈交给系统
- 静音是另一回事：系统音量接口在 2.4 上没有静音方法，静音由应用把媒体元素 `muted` 置位，状态存在 `settings.muted`，普通播放器和全屏播放器共用

> 以前播放器有一根自己的音量条，绑的是 `settings.volume`，而调音量的动作只改系统音量 —— 两边永远对不上（滑块一直停在 100% 不动）。现在这套应用内音量整个去掉了，`settings.volume` 字段也一并删掉（旧数据里残留的字段读出来时会丢弃）。

## 打开视频要不要立刻播放

设置页里有个开关「打开视频立刻播放」：

| 设置 | 行为 |
| --- | --- |
| 开（默认） | 打开视频页 → 拉播放地址 → 直接播（老行为） |
| 关 | 打开视频页 → **不拉播放地址、不建 `<video>` 元素**（一个字节的视频数据都不下），只显示封面；按中键（OK）才去拉地址并开始播 |

关掉之后：

- 播放器区域显示封面图 +「按 OK 播放」提示，中键的软键文案仍然是「播放」（文案必须和行为一致）
- 封面/标题/详情照常显示 —— 视频信息（`/x/web-interface/view`）还是会拉，只是**视频流**不拉
- 播放地址在用户按中键的那一刻才去拉（`/x/player/playurl` 的 MP4 单流，`/x/player/wbi/playurl` 的 DASH 兜底），拉完 `<video>` 元素自动播起来，进度接着历史记录里的位置
- 全屏播放器同理：进去先显示封面，按中键才加载（右软键是菜单键）
- 省流量也省电：翻列表看到封面就够了，不用点一个下一段视频

老版本存过的设置里没有这个字段，缺省按「开」处理 —— 不然老用户升级后打开视频会突然不播。

## 全屏播放要不要显示软键栏

设置页里还有个开关「全屏播放显示软键栏」：

| 设置 | 行为 |
| --- | --- |
| 开（默认） | 全屏页照常显示底部那条软键栏：右软键 = **显示/隐藏二级菜单**（文案「更多」，菜单内容与视频详情页同一份、同一侧）；中键提示跟着播放状态走（播放中「暂停」/ 暂停中「播放」）；左软键空着 |
| 关 | 全屏把**整条软键栏藏起来**（沉浸模式，画面铺满）；**但菜单照常能用** —— 按右软键照样展开二级菜单，6 个入口一个不少 |

关掉之后的行为要分清两件事：

- **藏的是「那一行提示」，不是菜单**。软键栏只是看不见了，页面派给软键的动作（这里是右软键展开菜单）照常生效 —— 菜单面板是另一个图层，不受这个开关影响。
- **菜单开着的时候软键栏会临时露出来**：菜单的操作提示（「关闭」/「选择」）就写在这一行上，而且菜单面板是贴着软键栏上沿摆的，栏不见了底下就空一条。菜单一关，栏继续藏着，不会又冒出来。

**全屏页的左软键就是这个开关**：文案「隐藏」/「显示」，写的是按下之后会做什么（栏显示着 →「隐藏」，栏藏着 →「显示」）。按一下就切，直接改的就是这个设置项，所以别的地方也跟着变。

老版本存过的设置里没有这个字段，缺省按「开」处理。

## 视频分辨率（240P / 360P / 480P / 720P）

设置页里的「全屏默认分辨率」和全屏菜单里的「视频分辨率」是**同一个设置，两处都能改**：

- **设置页改** → 下次进全屏就用那一档
- **全屏菜单里改** → 立刻换流（播放位置接着走，不从头开始），同时把设置里的「全屏默认分辨率」一起改掉并持久化

| 档位 | qn | 用在哪 |
| --- | --- | --- |
| 240P | 6 | 视频详情页的播放器固定这一档 |
| 360P | 16 | 全屏默认档 |
| 480P | 32 | |
| 720P | 64 | |

**B 站给什么档就是什么档** —— 不是每个视频都有 240P/480P（没登录一般只有 360P，登录了还要看视频本身）。请求 240P 而 B 站没有这一档时，它会把清晰度抬到可用档（比如 360P）。真机实测（登录态、某个视频）：`accept_quality = [64, 16]`，请求 240P/480P 都被抬回 360P，请求 720P 才真给到 1280×720。

**视频详情页为什么固定 240P**：详情页那个小播放器不需要高画质，240P 又最省流量。但**得走 MP4 单流**（`/x/player/playurl` + `platform=html5` + `fnval=1`）—— DASH 压根没有 240P 档（最低 360P），而原来的代码走 DASH 再取"id 最小的那档"，等于永远拿 360P，请求什么档都没用。全屏页同理改成 MP4 优先，清晰度才真的跟着请求走。

## 听视频（纯音频播放）

`#/listen?bvid=<bvid>` —— 一个只出声不出画面的播放页，适合在 240×320 的屏上听视频。

### 页面

- 封面图 + 标题 + 进度条（已播 / 总长）
- 方向键：**←** 短按 = 上一首 / 长按 = 快退、**→** 短按 = 下一首 / 长按 = 快进（按住不放，每 0.8 秒跳 5 秒）、**↑** 系统音量+、**↓** 系统音量−
- **中键** = 播放 / 暂停（文案跟着播放状态走：正在播显示「暂停」）
- **左软键** = 最小化：**收起这一页**，底部浮一条迷你条（封面 + 标题 + 进度），**声音继续放**
- **右软键** = 更多 → 二级菜单：`UP 主页` / `播放控制 ▸`（上一首 / 下一首 / 快退 / 快进 / 音量加 / 音量减 / **2 倍速**开关，副提示写的就是这一页方向键的实际绑定）/ `播放列表 ▸` / `播放模式 ▸` / `互动 ▸` / `分享 ▸` / `查看评论` / `退出播放` / `退出应用`

### 声音为什么最小化之后也不断

音频元素**不在听视频页里** —— 页面一卸载元素就没了，声音跟着断。它挂在根组件（`App.svelte`）里，跨路由不销毁，引擎（`src/lib/player/engine.js`）通过 `setAudioElement()` 拿引用。页面卸载时只把「迷你条」显示出来，播放照旧。

### 播放列表（本地持久化）

播放列表存在 localStorage（`player:playlist:v1`），**关掉应用还在**。里面存的是视频信息（bvid / cid / 标题 / 封面 / 作者 / 时长），不是播放地址 —— B 站的流地址带有效期，存下来过阵子就失效，所以每次真正播的时候才重新拉。

| 在哪儿加 | 加的是 |
| --- | --- |
| 视频详情页的「更多」菜单 →「添加到播放列表」 | 当前这个视频 |
| 历史 / 搜索结果 / 收藏夹内容页的「更多」菜单 →「添加到播放列表」 | 当前**选中的**那个视频（读焦点元素上的 `data-bvid`） |
| 首页 / 关注页（视频 Tab）的「更多」菜单 →「添加到播放列表」 | 当前**选中的**那个视频 |
| 收藏夹页的「更多」菜单 →「添加到播放列表」 | **整个收藏夹追加**到播放列表末尾（已有的跳过） |
| 收藏夹页的「更多」菜单 →「替换当前播放列表」 | **整个收藏夹替换**掉播放列表（列表名也跟着换成收藏夹名） |

播放列表在听视频页菜单里是三级菜单（`✓` 标着当前这首），选中即切过去播。

**从视频详情页点「听视频」**：这个视频会**直接放到播放列表最顶上**（已经在列表里的挪到最前，不会重复），然后开始播 —— 想听的那首就该排在第一个，后面的歌顺着往后排，播完接着往下走。

**只有这一个入口会自动播。** 别的入口（直接开 `#/listen?bvid=xxx`、从「我的」页进、菜单里跳回来）都**不自动播**：原来在放就接着放，原来暂停着就还暂停着，页面显示的是引擎里正在放的那首（标题、封面都跟着它走）。什么都没在放的时候，中键放的就是 URL 里那首。

### 播放模式（本地持久化）

播放模式有四种：**顺序播放**（默认，播完最后一首就停）、**列表循环**（播完回到第一首）、**单曲循环**（这一首反复播）、**随机播放**。在听视频页的「更多 → 播放模式」里选，当前那个用 `✓` 标出，页面上也有一个小标签写着。

它存在 localStorage（`player:playmode:v1`），**关掉应用还在**，下次进来还是用户上次选的那个；没存过（或存坏了）就是**顺序播放**。

### 放不了的歌会自动跳下一首

拉不到流、媒体元素报错、或者快进时整段缓存不下来 —— 这三种都算「这首放不了」，会自动跳到下一首并提示一句。顺序播放到最后一首就停，连着三首放不了也停（免得在列表里空转）。单曲循环时也当下一首处理 —— 反复播一首放不了的歌没意义。

### 整段音频缓存（IndexedDB）

快进时要把整段音频缓存下来（老 Gecko 把边下边播的 m4s 当直播流，可跳范围只有播放头那一截）。缓存存在 **IndexedDB**（`bili-audio-cache`）里，**关掉应用还在**，下次直接读出来播，不用重新下。

- 只用 IndexedDB 1.0 的 API（`put`/`get`/`delete`/`clear`/`count`/`openCursor`/`createIndex`）。2.0 的那些（`store.getKey`、`index.getAll` 之类）一个都不用 —— Gecko 48 上它们有的是有的是没有的，版本之间还会飘。
- 分两个仓：`tracks`（音频本体）和 `meta`（大小 + 时间）。算占用、回收的时候只碰轻的 `meta`，不用游标扫几十兆的音频。
- **事务里不 `await`**：IndexedDB 的事务在没有待处理请求时会自动提交，中途 `await` 一下这条事务就废了。
- IndexedDB 打不开（配额满 / 被占 / 压根没有）就退回内存缓存 —— 少个缓存不要紧，不能把播放搞坏。
- 「设置」页里有「听视频缓存限制」（默认 50MB）和「清理听视频缓存」。清理时**正在放的那首会留着** —— 它正被媒体元素用着，`revoke` 掉那个 blob: URL 声音会断。

### 任意页面都能跳回听视频

有在放东西的时候，任意页面的右软键「更多」菜单里会多一项 **「正在播放」**（三级：`回到听视频` / `播放`·`暂停` / `下一个` / `上一个`）。没在放东西时这一项不出现 —— 菜单里放一个点不动的项没意义。

### 交互里的一处讲究

迷你条是**纯显示**的：不注册按键作用域、不抢中键和方向键，页面自己的按键行为不能被这条浮层打断。要跳回听视频页，走上面那个「正在播放」。

## 全屏播放器（横屏布局，尺寸不写死）

全屏播放页是**按横屏设计的**：竖屏设备上把视频内容转 90°，用户把手机横过来看才是正的。所以这个页面的宽高**不能写死 320/240**，得按视口算。

**盒子怎么摆**：`<video>`（和封面）的盒子按"横屏"尺寸摆 —— **宽 = 屏高（`100vh`）、高 = 屏宽（`100vw`）** —— 再整体 `rotate(90deg)`。转之前用 `translate(-50%, -50%)` 把盒子中心对到屏幕中心，`rotate` 绕自己的中心转，转完正好是"屏宽 × 屏高"，铺满整屏：

```css
video, .cover {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100vh;
  height: 100vw;
  max-width: none;
  transform: translate(-50%, -50%) rotate(90deg);
  object-fit: contain;
}
```

**两个必须写的声明**（少一个就出 bug）：

- `max-width: none` —— 全局有 `img { max-width: 100% }`（app.css），会把封面的宽度从 320 夹到父容器宽 240，盒子变成 240×240 的正方形，转完**不居中、右边空掉一条**。真机实测过：改之前封面框在 `left:-40`，右边 40px 是黑的。
- `object-fit: contain` —— `<video>` 默认是 `fill`，16:9 的视频会被拉成 4:3。现在按原比例显示（真机实测 640×360 的片子在 320×240 盒子里显示成 320×180，上下留黑边）。

**其它去写死的地方**：

| 位置 | 之前 | 现在 |
| --- | --- | --- |
| 页面容器 | `width:100%; height:100%` | `top/left/right/bottom: 0` |
| 进度条容器 | `320px × 320px` | `100vw × 100vh` |
| 提示文字位置 | `top: 140px` | `top: 50%` + `translate(-50%,-50%)` |
| 加载中/出错文案 | `padding-top: 100px` | 容器 flex 居中 |
| 封面请求尺寸 | `biliImg(poster, 320, 180)` | 按视口长边算（`Math.max(innerWidth, innerHeight)`） |
| 屏幕方向 | 写死竖屏 | `isLandscape` 标志 —— 屏幕本来就是横的就不转 |

进度条是竖着贴在屏幕左边的 —— 手机横过来看时它就是横屏的底部进度条；时间字符每个转 90°，横过来看才是正的。

## 普通播放页（16:9 播放区，尺寸不写死）

`lib/player/VideoPlayer.svelte` 里的播放区之前写死 `height: 135px`（= 240 × 9/16），换屏幕宽度就拉变形了。现在按**视口宽度**算：

```css
.player-area {
  width: 100%;
  height: 56.25vw;   /* 16:9 */
  max-height: 45vh;  /* 屏幕太矮时别把播放区撑太大 */
}
```

Firefox 48 不支持 `aspect-ratio`，只能用 `vw` 换算（9 ÷ 16 = 56.25%）。前提是播放区铺满视口宽 —— `.screen` 是 `100vw`，`Player` 是顶层路由不在 `MainLayout` 里，所以 `.player-area` 的宽度就等于视口宽，换算精确。

封面地址也跟着走：`biliImg(poster, 320, 180)` → 按视口宽算的 `@240w_135h.jpg`（`posterW`/`posterH` 由 `updateSize()` 算，带 `resize` 监听）。

> 验证时踩的坑：`getComputedStyle().height` 返回的是**计算后的 px 值**，不管源码写的是 `135px` 还是 `56.25vw`，结果都是 `135px` —— 没法用计算样式判断"有没有写死"。要查源码得读 CSSOM（`document.styleSheets[].cssRules[].cssText`）。

## 列表页的状态记忆（首页 / 关注页）

首页和关注页都会被反复进出（点一条视频 → 播放器 → 返回），所以它们需要记住三件事：**数据还在不在**、**看到第几条**、**（关注页）还在哪个 tab**。

状态全部放在模块级 store 里，组件销毁也不丢：

| 页面 | 状态放哪 | 记住的东西 |
| --- | --- | --- |
| 首页 | `src/lib/stores/home.js` | 推荐流数据、分页游标、加载状态、焦点在第几条 |
| 关注页 | `src/lib/stores/following.js` | 视频/动态两个 tab 的数据、分页游标、加载状态、当前 tab、每个 tab 各自记一份焦点位置 |

共同的行为：

- **只有手动刷新才重新拉**：左软键 / 数字键 0 = 刷新当前列表（清缓存重拉，焦点回到**最上面**）；其余情况（返回、切 tab）都不发请求
- 返回时用缓存，**焦点回到上次看的那一条**
- 焦点由页面**独占**：`FeedList` 的自动聚焦在首页/关注页是关掉的（`autoFocus={false}`），否则两处抢焦点会出现"刚设好又被拉回第一条"
- 焦点位置用捕获阶段的 `focus` 事件记录（Gecko 48 没有 `focusin`），位置本身放普通对象不走 store —— 焦点每动一次就写一次，走 store 会让整个列表跟着重算
- 加载状态也在 store 里：路由切换时组件可能被换掉、新旧实例短暂共存，第二个实例会看到"已经在拉了"，不会重复发请求

> 顺带修掉的一个坑：首页的推荐流原来寄居在 `queue`（播放队列）里。`queue` 是"当前播放列表"，关注页/收藏夹/搜索结果都会往里写 —— 从关注页点一个视频再回首页，首页会把"关注的视频"当成推荐流显示。现在首页有自己的 store，`queue` 只负责播放列表。
>
> 另一个坑：svelte-spa-router 是按**路由条目**决定换不换组件的。`/home`、`/following`、`/profile` 之前各写了一条路由（都指向 `MainLayout`），切 Tab 时它会把整个 `MainLayout` 销毁重建，新旧两个实例短暂共存 —— 旧实例先响应了 location 变化挂了一份新页面，紧接着路由又把组件换掉，于是同一个页面被挂载两次，关注页因此发过两次请求、同一页数据被追加两遍。现在主 Tab 共用一条 `"*"` 路由，切 Tab 不再换组件。

## 用户主页

路由带上 uid 就是那个人的主页 —— **自己的主页和别人的主页走同一条路由、同一套代码**：

```
#/user?uid=946974
```

页面三个 tab（`资料` / `投稿` / `动态`），内容分别来自这几个接口（文档见 [bilibili-api-collect 镜像](https://github.com/alittlehuaji/bilibili-api-collect-mirror) 的 `docs/user/`）：

| tab | 接口 | 说明 |
| --- | --- | --- |
| 资料 | `GET /x/web-interface/card` + `GET /x/space/wbi/acc/info` | 名片给昵称/头像/签名/等级/粉丝数/关注数/投稿数/获赞数，空间信息给性别/生日/认证；两个接口分开拉，一个失败另一个还能用 |
| 投稿 | `GET /x/space/arc/search` | 投稿视频列表（`pn`/`ps`/`order` 分页） |
| 动态 | `GET /x/polymer/web-dynamic/v1/feed/space` | 该用户的动态（`offset` 游标翻页） |

名片接口的字段是**分层**的，取错位置就会显示成 0（投稿数/获赞数之前就踩过这个坑）：

| 字段 | 位置 | 备注 |
| --- | --- | --- |
| 昵称/头像/签名/性别/等级/认证 | `data.card.*` | 名片主体 |
| 粉丝数/关注数 | `data.card.fans` / `data.card.attention` | |
| 投稿数/获赞数 | `data.archive_count` / `data.like_num` | **在顶层，不在 `data.card` 里面** |
| 是否关注 | `data.following` | 是**布尔值**，不是关注数 |

所以 `src/lib/api/user.js` 里有一层 `mapUserProfile()` 专门把这些字段拍平成一份资料（`{ uid, name, face, sign, level, sex, birthday, official, fans, attention, archive, likeNum }`），视图层直接用字段名，不用再关心接口的嵌套结构。

入口：

- **我的 → 点用户卡片** = 进自己的主页
- **关注页 → 动态列表里点作者名** = 进那个人的主页（动态列表抽成了 `components/DynamicList.svelte`，关注页和用户主页共用；一条动态拆成"头部"和"正文"两个焦点，头部打开作者主页，正文打开动态详情）

状态记忆和首页/关注页同一套思路，但**按 uid 分开缓存**（`src/lib/stores/userpage.js`）：看过谁的数据、看到第几条、停在哪个 tab，都记着；换个人再切回来还是原样。

按键：上下键在列表里漫游（到底了自动加载下一页），**左右方向键切 tab**，左软键刷新当前 tab，中键打开当前选中的视频/动态。右软键在这一页不派活（没绑就不显示文案）。

## 动态详情（各种动态类型都支持）

B 站的动态不止"视频动态"一种，光主体（major）就有十几种类型，字段位置各不相同。之前只实现了有限几种，其余点进详情就加载失败。现在统一在 `src/lib/api/dynamic.js` 里解析成一种结构，视图层只认这一种。

**两个容易踩的坑**（都是真机实测出来的）：

1. **必须按 `major.type` 分派，不能靠"哪个字段存在"判断。** 接口返回的 major 对象里 `archive` / `pgc` / `draw` / `article` / `opus` / … **所有键都在**，不匹配的类型对应的值才是 `null`。而且 `DYNAMIC_TYPE_DRAW`（带图）和 `DYNAMIC_TYPE_ARTICLE`（专栏）现在的主体现在**都是 `MAJOR_TYPE_OPUS`**。

2. **转发动态的 major 是 `null`，原动态在 `item.orig`。** `item.orig` 是一个完整的动态 item（带自己的 modules / author / major），不在 major 里面。转发动态自己的 `desc.text` 只在转发者写了评论时才有内容，否则是"转发动态"这四个字。

支持的类型和取法：

| 动态主体类型 | 内容 | 取自 |
| --- | --- | --- |
| `MAJOR_TYPE_ARCHIVE` | 视频 | `major.archive` |
| `MAJOR_TYPE_OPUS` / `MAJOR_TYPE_DRAW` | 图文（标题 + 正文 + 图片） | `major.opus`（`pics`）/ `major.draw`（`items`） |
| `MAJOR_TYPE_ARTICLE` | 专栏 | `major.article` |
| `MAJOR_TYPE_UGC_SEASON` | 合集 | `major.ugc_season` |
| `MAJOR_TYPE_PGC` | 剧集（番剧/电影） | `major.pgc` |
| `MAJOR_TYPE_COURSES` | 课程 | `major.courses` |
| `MAJOR_TYPE_COMMON` | 一般类型（装扮/点评/分享） | `major.common` |
| `MAJOR_TYPE_UPOWER_COMMON` | 充电相关 | `major.upower_common` |
| `MAJOR_TYPE_LIVE` / `MAJOR_TYPE_LIVE_RCMD` | 直播间 | `major.live` / `major.live_rcmd`（content 是 JSON 串，标题在 `live_play_info` 里） |
| `MAJOR_TYPE_MUSIC` | 音频 | `major.music` |
| `MAJOR_TYPE_NONE` | 动态失效 | `major.none.tips` |
| 转发动态 | 原作者 + 原内容 + 原主体 | `item.orig` |

另外 `module_dynamic.additional` 是"相关内容卡片"（游戏/商品/预约/投票/视频跳转），也一并解析出来显示。

**列表接口的 `features` 必须带 `itemOpusStyle`**：不带的话图文动态只返回老式的 `MAJOR_TYPE_DRAW`（只有图片，没有正文），带上才返回 `MAJOR_TYPE_OPUS`（标题 + 正文 + 图片）。真机实测：同一条动态，带 features 返回 OPUS + 完整 summary，不带返回 DRAW + 只有 items 数组。

**评论对象随动态类型变**：评论挂在哪个对象上取决于动态类型 —— 视频 → 视频 aid（type=1）、带图 → 相册 id（type=11）、专栏 → cv 号（type=12）、音频 → au 号（type=14）、转发/纯文字 → 动态本身 id（type=17）、收藏夹 → 收藏夹 id（type=19）。接口在 `basic.comment_id_str` + `basic.comment_type` 里直接给了，拿不到时按动态类型兜底。之前这里固定用视频 bvid，非视频动态一律报"该动态没有可评论的视频"。

详情接口 `GET /x/polymer/web-dynamic/v1/detail` 的 `features` 参数是**必填**（文档标注），少了会 `4101139` 加载失败，所以带的是 web 端默认的一整套开关。

**中键（OK）提示跟着内容走**：视频动态、或转发动态的原动态是视频 → 中键显示「播放」，按中键直接进播放器；没有视频可播 → 中键不显示文案（没绑定的键不显示提示）。切到「评论」Tab → 中键提示跟着焦点走（焦点在某条评论上 = 「展开」/「收起」，焦点不在评论上就不显示）。

**带图片的动态：中键进大图看**。图片是可聚焦的，焦点落在某张图上时中键提示是「查看」，按中键进图片查看器：

- 路由 `#/image-viewer?imgs=<编码后的 JSON 数组>&i=<序号>`，图片数组直接通过 URL 参数传过去
- URL 参数里的 JSON **必须 `encodeURIComponent`** —— 否则 URL 里的 `&` 和 `=` 会把参数切碎
- **详情页里怎么选图**：进页面焦点自动落在第一张图上，上下键在图片之间移动（走到头就恢复滚动正文）；按中键从选中的那张开始看
- **查看器里的按键**：

  | 键 | 没放大时 | 放大后 |
  | --- | --- | --- |
  | 左软键 | 上一张 | 放大 |
  | 右软键 | 下一张 | 缩小 |
  | 中键（OK） | 放大 | 复原 |
  | ↑ ↓ ← → | 调整图片位置（平移） | 调整图片位置（平移） |

  软键文案跟着状态走（放大时变成"放大/缩小"，缩回原大小又变回"上一张/下一张"）。图片按屏宽适配，缩放用 `transform: scale`，平移用 `translate`；图片没超出屏幕的那个方向就挪不动（边界会夹住）。

  **方向键的方向跟 `translate` 的符号是反的**：`translate` 正值是"图片往右/下移"，对应"视野往左/上移"。所以按 → 想看图片右边时，代码里要传**负值**（`Right: () => pan(-1, 0)`）。早先写反了，按 → 图片反而往右跑。

**图片的显示尺寸**（240×320 屏上图片有两个位置，规格不一样）：

| 位置 | 布局 | 尺寸 |
| --- | --- | --- |
| 动态详情页 | 一行一张，**满宽**显示，高度按原图比例自然撑开，超出屏幕可见高度的部分**裁掉** | `width:100%` + `height:auto`；容器 `max-height:calc(100vh - 60px)` + `overflow:hidden` |
| 动态列表（关注页动态流） | 九宫格风格，一行几张小图 | 固定 **50×50**，`object-fit:cover` 裁成方图，最多 3 张 |

**详情页为什么是"满宽 + 裁切"而不是"缩到一屏内"**：详情页内容区净宽 224px（240 − 左右各 8px padding）。竖图按满宽渲染是 224×336，比内容区（320 − tab栏32 − 软键栏28 = 260）高，会超出一屏。处理方式是**保持原图比例按满宽渲染、高度不压缩**，超出的 76px 由 `.image-item` 的 `max-height` + `overflow:hidden` 裁掉 —— 所以图是完整的（没被压扁、没被缩成小图），只是底下那一截看不全，完整图按中键进图片查看器看。

踩过的坑：先用 `max-height:250px; width:auto` 把图缩到 167×250 塞进一屏，结果**左右一大片留白**，看着像"图没显示全"。满宽才是一张图该有的样子。

列表里的缩略图走 `biliImg(src, 50, 50)`（裁成方图），详情页和查看器走 `biliImg(src, 240, 0)`（`@240w.jpg`，**只给宽不给高**，等比缩放）。B 站图片后缀实测：`@240w.jpg` 可用；`@100w_100h.jpg` 其实也是等比缩放（不是裁剪），之前看着是方的其实是 CSS `object-fit:cover` 裁的；`@240w.webp` **加载失败**（设备不支持 webp）。

**详情页切 Tab 回来要重新聚焦**：切到「评论」Tab 时详情内容被销毁，回来后焦点没了 —— 中键既没提示也没反应。所以 `changeTab(0)` 切回详情时要重新把焦点落到第一张图上。

## 评论（多层级显示 + 回复功能下线）

视频页和动态详情页共用 `components/CommentSection.svelte`。

**B 站的评论是对话树**：一级评论 → 二级评论（回复一级）→ 三级评论（回复二级）→ …

- 一级评论列表 `GET /x/v2/reply` 只返回一级评论，每条带 `rcount`（子评论条数）和 `parent`（一级为 0）
- 子评论 `GET /x/v2/reply/reply?root=<根评论rpid>` 一次就能拿回整棵子树。**返回的 `data.replies` 见过两种形态**：平铺的（每条带 `parent`）和嵌套的（每条自带 `replies` 数组）。只按嵌套展开的话，遇到平铺的响应就会把所有回复都当成同一层 —— 这就是之前"多层级评论显示错位"的根因
- 所以统一在 `src/lib/utils/commenttree.js` 里处理：先递归拍平，再按 `parent` 建树，按层级缩进打平渲染（最多缩 3 层，240px 宽的屏幕缩太多正文就没地方了）

**「回复 @某某」用 `parent` 字段反查作者**，不用正则去正文里抠 —— 正文里的 `@` 是用户自己打的，正则抠出来的名字经常是错的。

**展开状态只有一份**：`CommentSection` 自己管。之前播放器里也存了一份 `subRepliesMap`，两份状态互不相通，结果是"按了中键没反应"（状态改了，但渲染的是另一份）。现在中键在评论列表里 = 展开/收起当前评论的子评论，交给框架的 `activateFocused()`，页面不再自己处理。

**回复功能暂时下线**：软键文案从「回复」改成「**待实现**」，按下去给一个 toast 提示。评论只保留浏览。接口层的 `api/interact.js` 里 `addReply` 还在，等回复功能做回来时直接用。

## 视频卡片的统计（几个列表统一）

首页推荐流 / 关注页动态流 / 用户主页投稿列表，卡片底部都只显示**播放量**和**点赞量**两项，用的是同一个组件（`components/FeedCard.svelte`，列表层是 `components/FeedList.svelte`）。

三个数据源的字段完全不一样，在 `src/lib/api/videocard.js` 里统一成同一种形状：

| 卡片字段 | 首页推荐流 | 关注页动态流 | 用户主页投稿 |
| --- | --- | --- | --- |
| `stat.play` | `stat.view`（数字） | `stat.play`（"275.7万" 字符串） | `v.play`（数字） |
| `stat.like` | `stat.like` | 动态的 `module_stat.like.count` | **接口没有** → `null` |

**点赞数怎么补齐**：投稿列表的接口（`x/space/arc/search` 的 `vlist`）不返回点赞数，而 B 站也没有批量查的接口（`archive/stats` 那种批量端点已经没了），只能一个视频一个视频地查（`x/web-interface/view`）。

一次打 30 个请求既费流量又容易撞风控，所以做成**焦点驱动**：用户的 D-pad 走到哪张卡，才给那张卡查一个，查到的结果缓存在列表组件里（同一个视频不会查第二次）。还没查到时显示 `—` 而不是 0 —— 0 会被当成"没人赞"，占位才诚实。

顺带修掉的：历史记录页的字段取错了 —— 历史接口的视频信息藏在 `history` 对象里（顶层只有 `uri`/`cover`/`author_mid`），之前取顶层的 `bvid`/`pic`/`owner` 全是 undefined，封面是空的、bvid 成了 `avundefined`（点进去根本播不了）。搜索结果页也把 `like` 写成了 `v.lavorites`（少个 f），点赞数一直是 undefined。

### 三个风控坑（真机实测）

B 站对这几个接口的风控比推荐流严，直接照文档写会被挡：

1. **投稿接口用 wbi 版会被拒**：`x/space/wbi/arc/search` 在设备上返回 `-403 访问权限不足` / `-352 风控校验失败`（它还要 `dm_img_list`/`dm_img_str` 这两个风控参数）。改用**非 wbi 的老端点** `x/space/arc/search`，不用签名就能正常返回。
2. **设备标识要用服务器发的真 buvid**：应用启动时访问一次 `bilibili.com`，服务器回的 `Set-Cookie` 里有 `buvid3`/`b_nut`。之前应用是自己随机生成一套 buvid 发出去的，风控不认 —— 空间动态接口直接 `-412 request was banned`。现在 `getBuvid()` 每次都先从 cookie jar 里读**真实的** buvid，读不到才自己生成。
3. **空间详细信息接口基本拿不到**：`x/space/wbi/acc/info` 在设备上返回 `-352 风控校验失败`（不签名的非 wbi 版 `x/space/acc/info` 也一样是 `-401 非法访问`）。所以资料页以**名片** `x/web-interface/card` 为主力，空间信息只当补充 —— 拿不到也不影响昵称/头像/签名/粉丝/关注/投稿/获赞这些字段。这个接口的超时还特意调短到 6 秒，免得它卡住把整页资料拖到超时。

## 按键导航框架

`src/lib/keyboard/` 是全应用**唯一**的按键入口。视图不再各自监听 `window`，而是注册"按键作用域"（scope），由总线统一分发。

设计参考了 [KaiUI](https://github.com/AdrianMachado/KaiUI) 的 `SoftKey` 组件（KaiOS 官方生态里最常用的组件库）：软键的**文案**和**处理器**由同一个对象持有，组件卸载时一起释放。

| 文件 | 职责 |
| --- | --- |
| `keys.js` | 按键归一化：把 KaiOS 各机型不一致的 `e.key` / `keyCode` 统一成规范名 |
| `scopes.js` | 作用域注册表：优先级、独占、按实例注销、软键栏所有权、软键菜单所有权 |
| `roving.js` | 焦点漫游：`[data-navable]` 收集、上下移动、区域边界、滚动居中、激活 |
| `index.js` | 按键总线：分发顺序、输入框策略、默认行为、长按 |
| `modalkeys.js` | 模态框独占作用域（评论回复框下线了，机制留着） |
| `device.js` | 设备能力探测（有没有相机键/音量键/挂断键） |
| `../stores/softkey.js` | 软键菜单（软键栏的二级/三级操作）：层级栈、高亮、面包屑 |

### 规范键名

同一个物理键在不同机型/固件/输入法状态下上报的 DOM key 并不统一（方向键可能是 `ArrowUp` 也可能是 `Up`，中键可能是 `Enter` 也可能是 `Accept`，甚至 `Unidentified` + keyCode）。**所有按键判断都必须先归一化**，按键表统一用规范名。

键名取自 Gecko 48 的 `dom/events/KeyNameList.h`（KaiOS 2.4 实际能产生的 key），keyCode 取自 `dom/interfaces/events/nsIDOMKeyEvent.idl`：

| 规范名 | DOM key | keyCode | 说明 |
| --- | --- | --- | --- |
| `Up` / `Down` / `Left` / `Right` | `ArrowUp` / … | 38 / 40 / 37 / 39 | 方向键（每台机器都有） |
| `Enter` | `Enter` / `Accept` | 13 | 中键 |
| `SoftLeft` / `SoftRight` | `SoftLeft` / `SoftRight` | **0** | 左右软键。**`SoftRight` 是页面动作键，不是返回键** |
| `Back` | `Backspace` | 8 | **返回键**（官方语义就是"返回上一级"；应用里的"返回"统一绑它） |
| `BrowserBack` | `BrowserBack` | 0 | 浏览器返回键 |
| `GoBack` | `GoBack` | 0 | Smart Touch 返回键（KaiOS 3，如 Nokia 8000 4G） |
| `EndCall` | `EndCall` | **95**（实测） | 挂断键（官方语义"结束当前操作"）——**不拦截**，交给系统 |
| `VolumeUp` / `VolumeDown` | `VolumeUp` / `VolumeDown` | **183 / 182** | 音量键（Gecko 48 的值） |
| `Mute` | `VolumeMute` | 181 | 静音键 |
| `Symbol` | `Symbol` | 0 | 符号输入键（`#` `*` `-` `+` `@`） |
| `Camera` / `Power` / `Call` / `HeadsetHook` / `Notification` / `LaunchWebBrowser` / `LaunchMail` | 同名 | 0（`HeadsetHook` 实测 112） | 系统/其它应用的键，**应用不应吞掉** |
| `0`–`9`、`*`、`#` | 同名字符 | 48–57 | 数字键与符号键 |

⚠️ **Gecko 48 里软键/相机键/电源键没有对应的 `DOM_VK`** —— 它们的 `keyCode` 是 `0`，只能靠 `e.key` 识别。官方文档也明确要求用 `KeyboardEvent#key`（`code` 会随键盘布局变，不可靠）。

⚠️ **KaiOS 2.4 与 KaiOS 3 的音量 keyCode 正好相反**（2.4: 183=音量+；3.0: 182=音量+）。框架为此做了**运行时自学习**：只要见过一次"已知 key 名 + 某个 keyCode"，就记住这台机器的对应关系，之后 `e.key === 'Unidentified'` 的事件也能正确还原。自学习到的映射优先于静态表。

### 真机实测：Nokia 6300 4G（KaiOS 2.4 / Gecko 48）

上表的 `keyCode` 一半来自 Gecko 源码，一半是这台机器上按出来的。下面这张表是**逐个实体键实测**的结果（内核层 `getevent` + DOM 层同时抓，按键映射对得上）：

| 实体键 | Linux key | DOM `e.key` | 规范名 | `e.keyCode` | 备注 |
| --- | --- | --- | --- | --- | --- |
| 左软键 / 菜单键 `≡` | `KEY_MENU` (139) | `SoftLeft` | `SoftLeft` | 0 | **能进页面**，但系统同时会弹菜单 |
| 右软键 | `KEY_BACK` (158) | `SoftRight` | `SoftRight` | 0 | `e.code` 是 `BrowserBack`；**不是返回键** |
| 返回键（退格 / 方向键右边的「←」） | `KEY_BACKSPACE` (14) | `Backspace` | `Back` | 8 | 应用的"返回"绑它 |
| 方向键 | 103/105/106/108 | `ArrowUp/Left/Right/Down` | `Up/Left/Right/Down` | 38/37/39/40 | |
| 中键 OK | `KEY_OK` (352) | `Enter` | `Enter` | 13 | 长按会触发 `MicrophoneToggle`（语音助手） |
| 挂断键 | `KEY_END` (107) | `EndCall` | `EndCall` | **95** | Gecko 48 的 IDL 里没有这一项，是 KaiOS 自己加的 |
| 通话键 | `KEY_SEND` (231) | `Call` | `Call` | 0 | |
| 音量 + / − | `KEY_VOLUMEUP/DOWN` (115/114) | `VolumeUp/VolumeDown` | 同名 | **183 / 182** | 与 KaiOS 2.4 的静态表一致 |
| 媒体键 | `KEY_MEDIA` (226) | `HeadsetHook` | `HeadsetHook` | **112** | Gecko 里 112 是 `F1` |
| 数字键 | `KEY_1`…`KEY_0` | `1`…`0` | 同名字符 | 49…48 | |
| 相机键 | `KEY_CAMERA` (207) | — | — | — | **被系统吃掉**，直接开相机，页面收不到 |
| 电源键 | `KEY_POWER` (116) | — | — | — | 被系统吃掉（熄屏/退出） |
| 语音键 | `KEY_VOICECOMMAND` (217) | — | — | — | 被系统吃掉 |
| `*` / `#` | `KEY_NUMERIC_STAR/POUND` | — | — | — | 走 `gpio-keys` / `qpnp_pon`，页面收不到 |

要点：

- **返回键 = 退格键 / 方向键右边的「←」**，DOM key 名是 `Backspace`，框架归一化成 `Back`。应用的"返回"统一绑它，右软键（`SoftRight`）不再兜底返回，留给页面自己派活。
- **左软键（`≡`）是可以用的** —— 它上报的是 `KEY_MENU`，DOM 层拿到的就是 `SoftLeft`，框架能正常拦截。只是按下时系统会同时弹自己的菜单，这是 OS 行为，网页拦不住。
- **相机键 / 电源键 / 语音键根本到不了页面**，任何"拦截系统键"的写法都没意义 —— 框架的 `SYSTEM_KEYS` 把它们列为不拦截，系统键长按才能退出应用，官方要求如此。
- **通话键 / 挂断键能到页面，但框架不碰它们** —— `NEVER_INTERCEPT` 在总线最前面就把 `Call` / `EndCall` 放行，网页既不处理也不 `preventDefault`，拨号和挂断都归系统。
- 页面刚加载完的**第一发按键**会被 Gecko 的 chrome 吞掉（不是 bug），自动化测试时先空打一发预热。

### 按键检测页

应用内有一个**按键检测页**（设置 → 按键检测，路由 `#/keytest`），用于在真机上核对实体键与框架映射：

- 捕获阶段监听 `keydown`，拿未经框架处理的原始事件
- 表格逐行对照「规范名 / 硬件 / 实测 e.key / keyCode(实测/期望) / 判定」
- 「一致」= 原始 key 与 keyCode 都对得上；「别名」= 框架仍能归一化，但和官方表格的原始名不同；「码差」= 静态兜底表在这台机器上不准
- 页面会吃掉**所有**按键（`catchAll`），不会被任何键带走；清空/返回是页面底部的按钮，不绑快捷键
- 同时显示运行时自学习表和当前生效的按键作用域（谁在抢键一目了然）

也可以直接从 adb 把结果拉回机器上比对：

```bash
node scripts/device-console.js --eval 'JSON.stringify(window.__keytest.seen)'
```

### 菜单测试页

应用内有一个**菜单测试页**（设置 → 菜单测试，路由 `#/menu-test`），用于在真机上试软键栏的二级/三级菜单：

- 6 个**变体**可以切（↑↓ 选中、中键切换）：基础两级 / 带禁用项 / 四级深菜单 / 空菜单 / 视频页同结构 / 分组 + 副提示
- 页面画出当前变体的菜单树（缩进 + 「有子项」「禁用」标记），照着按就不会按错
- 每执行一个菜单动作，页面会记一笔「最近动作」——关掉菜单就能看到刚才到底按中了哪一项
- 右软键开菜单，↑↓ 选，中键进下一级/执行，退格回上一级

自动化也能跑一遍（真机按键注入 + 断言菜单层级/面包屑/高亮/箭头位置）：

```bash
node scripts/device-test.js --only menu --shot ./shots
```

视频页那套分组菜单另有一个用例（分组/副提示/顺序/自动滚动/快进 5 秒）：

```bash
node scripts/device-test.js --only video-menu --shot ./shots
```

### ⚠️ KaiOS 2.4 的坑：`<button>` 当 flex 容器不管用

**Gecko 48（KaiOS 2.4）上 `<button>` 作为 flex 容器时，它的子元素不会被当成 flex item 排布** —— 按钮的内容被塞进一个匿名块里按普通块/行内流排。

真机（Nokia 6300 4G）实测：

| 写法 | 子元素 `flex: 0 0 100px` 的实际宽度 | 期望 |
| --- | --- | --- |
| `<div style="display:flex">` | 100px ✅ | 100px |
| `<button style="display:flex">` | 236px ❌ | 100px |

后果：菜单项「文字撑满 + 右边一个小箭头」在真机上会被挤成**两行**（箭头掉到下一行），`flex-wrap: nowrap` 也拦不住。

**所以菜单项用 `<div role="button">` 而不是 `<button>`**（本项目其它可点的行 —— 设置项、按键检测页的按钮 —— 本来也都是 div + `role="button"`）。

`scripts/device-test.js` 的 `menu` 用例会量箭头的位置（同一行 / 压在文字上 / 没贴右边），防止改回 `button` 之后又踩坑。

### ⚠️ 240px 宽的屏上别做横向动画

菜单项右对齐的东西（副提示「长按 → 键」、子菜单的小箭头）**紧贴着 12px 的右内边距**，也就是紧贴屏幕右边缘。曾经给列表加过一个"换一级就横向滑进来"的动画（`transform: translateX(12px)`），结果：

- 动画进行中的这 180ms，右侧的副提示和箭头被挤出屏幕（提示文字最后一个字被切掉）
- 真机慢 / 动画被系统卡住时，位移**长期停在那里**，箭头直接跑到屏幕外面看不见

所以菜单**不做横向动画**；换一级的提示交给面包屑和层级圆点。面板只保留一个竖向的升起动画（`translateY`），并且给 `.menu-layer` 加了 `overflow: hidden` —— 万一动画卡住，面板也不会盖到软键栏上。

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

### 整页拦截按键（catchAll）

有些页面需要**吃掉所有按键** —— 比如按键检测页：任何键都不能把页面带走（否则按退格键/右软键就退出了，根本测不完）。

`onKey` 的 `catchAll` 选项负责这件事：接管本作用域**没有具名声明**的任何按键。

```js
return onKey('keytest', {}, {
  priority: 50,
  catchAll: (e, key) => {
    // 方向键/中键放行: 框架默认行为 (焦点漫游 + 激活按钮) 要继续工作
    if (key === 'Up' || key === 'Down' || key === 'Left' || key === 'Right' || key === 'Enter') {
      return false;
    }
    // 系统键放行: 官方要求永远别拦着用户离开应用
    if (SYSTEM_KEYS.indexOf(key) >= 0) return false;
    return true;   // 其余一律吞掉 (会被 preventDefault)
  }
});
```

> 通话键 / 挂断键根本走不到 `catchAll` —— 总线在最前面就把它们放行了（`NEVER_INTERCEPT`），连 `catchAll` 都吞不掉。

规则：

- 同作用域内**具名声明优先**于 `catchAll`
- `catchAll` 返回 `false` 表示"不处理" → 总线继续往下找更低优先级的作用域
- 高优先级的 `catchAll` 会盖过低优先级作用域的具名处理器
- 模态独占作用域不受影响，仍然优先于 `catchAll`

### 返回键（全局兜底）

`src/main.js` 注册了一个 `priority = -100` 的**全局**作用域，专门管"返回"：

```js
onKey('app-back', {
  Back: handleBack,        // 返回键 (退格键 / 「←」), 主力
  GoBack: handleBack,      // Smart Touch 返回键
  BrowserBack: handleBack  // 浏览器返回键
}, { priority: -100, global: true });
```

规则：

- **右软键 `SoftRight` 不在里面** —— 软键是页面动作键，页面想用就自己声明；没声明就什么都不做
- **通话键 `Call` / 挂断键 `EndCall` 也不在里面** —— 它们在总线最前面就被放行了（`NEVER_INTERCEPT`），连页面都接管不到，网页不能拦着用户打电话
- 顶层页面（`/home`、`/following`、`/profile`）的返回键**也拦下来** —— 按了不会退出应用（有意为之，避免误触退出）；退出应用走主页菜单最后那项「退出应用」
  - 实现上这两行是配套的：顶层那条分支提前 `return`（返回 `undefined`），而按键总线把"没返回 false"当成"处理了" → 照样 `preventDefault`。想改成能退出，就得让这个分支 `return false`
- 长按连发时只退一层（`e.repeat` 保护），否则一次长按会连续 pop 掉多级路由
- 页面自己声明了同名键就以页面为准（优先级更高），全局只在没人管时兜底
- 输入框聚焦时退格键让给输入法删字（`isTextKey('Back')` 为真）；**但输入框是空的时候不退给输入法** —— 空框没有字可删，这时退格键当"返回"用（模态框则自己声明 `Back` 的行为）

### 软键栏的所有权

参考 KaiUI 的 `SoftKey`：软键的**文案**和**处理器**由同一个作用域持有，卸载时一起释放。否则会出现两类问题：

- 页面注册了按键处理器但忘了设文案 → 软键栏还显示上一个页面的文案
- 页面已经卸载但文案还在 → 软键栏写着"刷新"，按下去却没人响应

`onKey` 的 `softkeys` 选项让作用域接管软键栏：

```js
// 文案固定：直接声明在作用域里
return onKey('history', {
  SoftLeft: () => refresh(),
  SoftRight: () => navigate('/home')
}, { softkeys: ['刷新', '返回', '播放'] });   // [左, 右, 中]

// 文案随状态变：作用域只接管生命周期，文案自己用 setSoftkeys 改
$: setSoftkeys($isLogin ? "刷新" : "登录", "返回", "打开");
return onKey('home', { ... }, { softkeys: true });
```

作用域注销时自动还原成接管之前的文案。模态框也是这么做的 —— 打开时显示"取消/发送"，关闭时自动还原成播放器页面的文案：

```js
const closeScope = openModalScope('reply', {
  SoftLeft: () => close(),
  SoftRight: () => send(),
  Enter: () => send()
}, { softkeys: ['取消', '发送', ''] });
```

> 还原用的是"声明栈"而不是简单栈：Svelte 3 路由切换时是**新组件先 `onMount`、旧组件后 `onDestroy`**（和 React 相反），简单栈会还原错。声明栈按下标取最后一个持有者，与注销顺序无关。

### 软键菜单：软键栏的二级 / 三级操作

软键栏只有三个格子，一个页面能派的动作却有十几个（分享 / 收藏 / 稍后再看 / 复制链接…），塞不下。所以把软键栏当成**一级菜单**：某个软键变成「更多」，按它展开**二级菜单**；二级菜单里的项如果还有子项，再展开就是**三级菜单**。

```
一级: [ 全屏 ]              [ 播放 ]        [ 更多 ▸ ]   ← 软键栏
二级: ┌──────────────────────────────────┐
      │ 更多操作                    ●●    │  ← 面板 + 面包屑 + 层级点
      │ ──────────────────────────────── │
      │  UP 主页                        │
      │  分享                        ▸  │  ← 有子项 → 三级
      │  收藏                        ▸  │
      └──────────────────────────────────┘
三级: ┌──────────────────────────────────┐
      │ ‹ 更多操作 › 分享          ●●    │  ← 面包屑能看出从哪来
      │ ──────────────────────────────── │
      │  复制链接                       │
      │  分享给好友                     │
      └──────────────────────────────────┘
```

`onKey` 的 `menu` 选项让作用域接管这个菜单（和 `softkeys` 一样跟着作用域一起释放，不会漏到下一个页面）：

```js
// 菜单树可以是一个对象, 也可以是一个**函数** —— 函数在菜单打开的那一刻才求值,
// 所以菜单项能跟着页面的异步状态走 (作者信息没到时「UP 主页」就是灰的)
return onKey('video-player', {
  SoftLeft: () => toggleFullscreen()
}, {
  softkeys: true,
  menu: () => ({
    slot: 'right',        // 菜单占右软键 (默认; 只能 left / right)
    label: '更多',        // 右软键显示的文案
    title: '更多操作',    // 面板标题 / 面包屑第一级
    items: [
      // 二级只放入口; 有子项的按中键进三级菜单
      { label: 'UP 主页', disabled: !ownerMid, action: () => goUp() },
      {
        label: '播放控制',
        items: [
          // hint: 副提示 (右对齐的小字), 告诉用户"这个功能还有更快的键"
          { label: '快进', hint: '长按 → 键', action: () => seek(5) },
          { label: '音量加', hint: '长按 ↑ 键', action: () => volume(1) }
        ]
      },
      { label: '互动', items: [ { label: '点赞', action: () => like() } ] },
      // group: 分组标题, 只需要写在每组的第一项, 后面的项自动继承
      { group: '其它', label: '分享', items: [ { label: '复制链接', action: () => copy() } ] }
    ]
  })
});
```

菜单项支持的字段：

| 字段 | 作用 |
| --- | --- |
| `label` | 项的文字 |
| `group` | 所属分组的标题（MD3 list subheader）。**只写在每组第一项**，后面的项自动继承，不用重复写 |
| `hint` | 右对齐的副提示（小号弱化色），例如「长按 → 键」—— 提示这个功能还有更快的键 |
| `icon` | 文字前面的图标（可选） |
| `disabled` | 置灰，按中键没反应 |
| `items` | 有子项 → 右边画箭头，按中键进**三级菜单** |
| `action` | 叶子项的动作 |

**分组 + 副提示**是给「动作很多」的页面用的。视频页的二级菜单**只留入口**，具体动作都收进三级菜单，二级一眼能扫完：

```
更多操作                     ●●          ← 二级菜单 (详情页 5 个入口)
UP 主页
播放控制                   ▸
互动                       ▸
分享                       ▸
退出应用

更多操作 › 播放控制         ●●          ← 三级菜单
  快进              长按 → 键
  快退              长按 ← 键
  音量加            长按 ↑ 键
  音量减            长按 ↓ 键

更多操作 › 互动             ●●          ← 三级菜单
  一键三连
  点赞
  投币
  收藏
```

菜单变长（十几项）会超出面板高度，所以**高亮移动时列表会自动滚动**，把选中项滚到可视区中间 —— 否则用户会看着高亮跑出屏幕。自动滚动那段代码有个坑：响应式语句的条件里**必须出现 `index`**（高亮下标），否则 Svelte 不会因为高亮移动而重跑它，选中项滚出去就再也拉不回来。

**视频页和全屏播放页共用同一份菜单**（`src/lib/player/videoMenu.js`）—— 菜单树只写一份，各自把自己的动作（seek / 音量 / 互动 / 跳转）传进去：

```js
// 视频详情页: 菜单挂右软键
buildVideoMenu({ slot: 'right', label: '更多', seekStep: 5, seek: d => seek(d), ... })

// 全屏播放页: 菜单也挂右软键 (和详情页同一侧, 位置统一)
buildVideoMenu({
  slot: 'right', label: '更多', seekStep: 10, ...,
  // 副提示里的按键跟着**本页的绑定**走 (全屏画面转了 90°, 方向键也转了 90°)
  hints: { forward: '短按 ↓ 键', back: '短按 ↑ 键', volUp: '短按 → 键', volDown: '短按 ← 键' }
});
```

**全屏页比详情页多一项「视频分辨率」**（详情页的播放器固定 240P，不需要调）—— 页面传 `quality` / `qualities` / `onQuality` 才有这一项：

```js
// 全屏播放页: 菜单里能切分辨率, 当前档用 ✓ 标出
buildVideoMenu({
  ...,
  quality: currentQuality,               // 当前档 (qn)
  qualities: [{ label: '240P', value: 6 }, { label: '720P', value: 64 }, ...],
  onQuality: qn => changeQuality(qn)     // 切档: 换流 + 写回设置
});
```

切档时**播放位置接着走**（换流会把播放头重置成 0，得记下位置等新的流 `loadedmetadata` 再跳回去），并且顺手把设置里的「全屏默认分辨率」一起改掉（持久化）。

末项固定是 **「退出应用」**（全局收口，和主页那套菜单同一份文案、同一份行为，由 `buildExitItem()` 统一造）。不想让它出现在菜单里、或者想让它灰着按不动，都可以手动关：

```js
buildVideoMenu({ ... , exit: false })          // 菜单里根本没有这一项
buildVideoMenu({ ... , exitDisabled: true })   // 这一项灰着, 按中键没反应
```

**软键栏能整条藏起来，但菜单不受影响** —— `onKey` 的 `hideSoftkeys` 选项把**那一行提示**藏掉（沉浸模式），页面派给软键的动作照常生效：

```js
// 全屏播放页: 设置里关掉「全屏播放显示软键栏」→ 整条软键栏藏起来
onKey('fullscreen-player', { /* … */ }, {
  softkeys: true,
  hideSoftkeys: !fullscreenMenu,   // 藏的是提示行, 不是菜单
  menu: () => buildMenu()          // 菜单**一直都在**: 右软键照样能展开它
});
```

藏栏时菜单打开，软键栏会**临时露出来** —— 菜单的操作提示（「关闭」/「选择」）写在这一行上，而且菜单面板贴着软键栏上沿摆，栏不见了底下就空一条；菜单一关，栏继续藏着。

**全局二级菜单**（`src/lib/menu/appMenu.js`）—— 主页三个 Tab（首页 / 关注 / 我的）的右软键统一变成「更多」，原来绑在右软键上的动作收进菜单，**最后一项固定是「退出应用」**：

```js
// 首页: 搜索收进菜单, 右软键不再自己派活
onKey('home', { /* … */ }, {
  softkeys: true,
  menu: () => buildAppMenu([
    { label: '搜索', disabled: !$isLogin, action: () => navigate('/search') }
  ])
  // buildAppMenu 会自动在最后追加「退出应用」
  // (exit: false = 不要这一项, exitDisabled: true = 灰着按不动)
});
```

| 页面 | 二级菜单 |
| --- | --- |
| 首页 | 搜索（没登录时置灰） → 退出应用 |
| 关注 | 切到动态 / 切到视频（跟着当前 Tab 走） → 退出应用 |
| 我的 | 退出应用（这一页原来没绑右软键） |

**「退出应用」先归位再退出**：先把路由重置到 `/`（首页），等路由处理完，再 `window.close()` 关掉应用窗口。`window.close()` 在 KaiOS 2.4（Gecko 48）上是真的能结束应用 —— 实测（真机 Nokia 6300 4G）：调完之后 console actor 消失，`b2g-ps` 里也没有这个应用了。路由先归位是为了**下次进来落在首页**，不会停在奇怪的位置。这一项由 `buildExitItem()` 统一造（`src/lib/menu/appMenu.js`），主页那套菜单和视频页/全屏页那套共用同一份 —— 两边行为不一样的话，用户按到会觉得「这软件的退出怎么两副样子」。

> **副提示必须和实际绑定对得上**（本项目的硬规矩：文案必须和行为一致）。全屏播放页的画面转了 90°，方向键也跟着转（↑/↓ 快退快进、←/→ 音量），所以它的提示写「短按 ↓ 键」，而不是详情页的「长按 → 键」。

菜单打开时的按键（`stores/softkey.js` 管层级，`SoftkeyBar.svelte` 管画和派按键）：

| 按键 | 行为 |
| --- | --- |
| `Up` / `Down` | 在当前层移动高亮（到头绕回另一头，菜单是闭环） |
| `Enter` | 激活高亮项：有子项就进下一级，是叶子就执行动作并关掉菜单 |
| `Right` | 有子项 → 进下一级（等价于 `Enter`） |
| `Left` | 回到上一级 |
| `Back`（退格键） | 回到上一级；已在二级就整个关掉 |
| `SoftLeft` | 和返回键同义（二级=关闭，三级=上一级） |

菜单打开期间**独占按键**（页面收不到上下键，也不会偷偷换软键文案），软键栏临时变成菜单的操作提示：二级 = 左「关闭」/ 中「选择」，三级 = 左「上一级」/ 中「选择」；关掉菜单后软键栏立刻恢复成页面自己的文案 —— 菜单不碰 `ui.softkeys`。

> **注册了菜单就别再自己绑那个软键**：菜单接管后优先级高于页面（文案必须和行为一致），页面再绑一次会打架。页面想自己派活、只想"按某个键打开菜单"时，用 `openSoftkeyMenu(tree)` 手动开，软键文案仍然归页面。

状态都在 `src/lib/stores/softkey.js`（层级栈 / 高亮下标 / 面包屑），层级用**栈**表示：`stack[0]` 是二级，`stack[1]` 是三级；每层记着自己是从哪一项进来的（`parentIndex`），往回退时高亮还原到父菜单那一项。

### 框架默认行为

页面没有注册对应按键时，框架自动提供：

- `Up` / `Down` → 在 `[data-navable]` 元素之间移动焦点，滚动到可视区中央
- `Enter` → 激活当前焦点元素（等价于点击它）

所以绝大多数页面只需要注册软键即可。

### Svelte 3 的坑：别用 `x = x` 触发更新

**`x = x` 在 Svelte 3 里不会触发重新渲染。** 编译器把它变成 `$$invalidate(0, x)`，而引用没变 → Svelte 判定"值没变" → 不标脏 → 界面永远不动。

```js
let subMap = {};
function bump() {
  subMap[rpid] = state;
  subMap = subMap;      // ❌ 没反应
}
```

正确写法是**换引用**：

```js
function setSub(rpid, state) {
  const next = { ...subMap };
  next[rpid] = state;
  subMap = next;        // ✅ 新对象 → 标脏 → 重新渲染
}
```

这个坑很隐蔽：JS 层面 `subMap` 确实变了（所以读它的地方拿得到新值），但 DOM 不更新。**评论展开"按了中键没反应"就是踩了这个** —— 展开状态改了、软键提示也变了（提示是另一条链路），唯独子评论列表不渲染。

`scripts/test-keyboard.js` 里有一条测试扫源码里的自赋值写法，防止再踩。

### 焦点区域

列表容器加 `data-nav-root` 后，上下键只在该区域内移动，不会跳到别的区域：

```html
<div class="feed-list scroll-y" data-nav-root>…</div>
```

### 输入框与模态框

- **输入框聚焦时**：只有文字类按键（数字/字母/空格/退格/标点）让给输入法；方向键、中键、软键仍然交给页面（页面显式注册了才生效）
  - **例外：空输入框里的退格键** —— 没有字可删，就不喂给输入法，交给页面当"返回"用。应用的返回键就是退格键，搜索页一进来焦点就在输入框上，不这么处理的话用户按返回键没反应，直接卡在那一页（主页菜单里点「搜索」跳过去后回不来的老毛病）
- **模态框打开时**：注册一个独占作用域，只有模态能响应按键，且只对它声明的按键 `preventDefault` —— 输入框照常编辑文字、移动光标

```js
import { openModalScope } from '../keyboard/modalkeys.js';

const closeScope = openModalScope('reply', {
  SoftLeft: () => close(),
  SoftRight: () => send(),
  Enter: () => send(),
  Back: () => (!value ? close() : false)         // 非空时返回 false → 退格正常删字
}, { softkeys: ['取消', '发送', ''] });           // 关闭时软键栏自动还原
```

> 模态框也拿不到挂断键 —— `EndCall` / `Call` 在总线最前面就放行了，网页不能拦着用户打电话（以前评论回复框把挂断键当"取消"，用户想挂电话结果把回复框关了）。

### 自测

按键框架的纯逻辑可以在 Node 里跑（不需要真机）：

```bash
node scripts/test-keyboard.js
```

覆盖按键归一化、跨版本 keyCode 自学习、作用域优先级与实例隔离、输入框策略、模态独占、软键栏所有权与还原、焦点漫游的首/末/边界、记住并恢复焦点位置（`focusIndex` / `focusAt`）、长按与 keyup 收尾、`catchAll` 整页拦截。

## 致谢

- [bilibili-api-collect (镜像)](https://github.com/alittlehuaji/bilibili-api-collect-mirror) — B站 API 文档参考
- [KaiUI](https://github.com/AdrianMachado/KaiUI) — KaiOS 组件库（软键栏的设计参考）
- [Svelte](https://svelte.dev/) — UI 框架
- [Rollup](https://rollupjs.org/) — 模块打包

## 许可证

[AGPL-3.0](LICENSE)
