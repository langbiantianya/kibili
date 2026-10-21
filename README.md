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
- ⚙️ **设置** — 基础应用设置

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
│       ├── player/          # 视频播放器
│       ├── router/          # 路由工具
│       ├── stores/          # Svelte stores (状态管理)
│       │   ├── home.js      #   首页推荐流 (数据缓存 / 焦点位置)
│       │   ├── following.js #   关注页状态 (tab / 数据缓存 / 焦点位置)
│       │   └── keytest.js   #   按键检测数据 (真机核对用, 可从 adb 拉取)
│       ├── utils/           # 工具函数
│       └── views/           # 页面视图
│           └── KeyTest.svelte # 按键检测页 (真机核对实体键 ↔ 框架映射)
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

实跑输出（13 个页面 + 一次真实按键）：

```text
设备: app://bilibili.com/manifest.webapp  视口 240x320
✓ home            softkeys={"left":"刷新","center":"打开","right":"搜索"} navables=8
✓ following       softkeys={"left":"刷新","center":"打开","right":"切Tab"} navables=22
✓ profile         softkeys={"left":"","center":"打开","right":""} navables=6
✓ history         softkeys={"left":"刷新","center":"播放","right":""} navables=29
✓ favorites       softkeys={"left":"刷新","center":"打开","right":""} navables=9
✓ settings        softkeys={"left":"","center":"","right":""} navables=2
✓ about           softkeys={"left":"","center":"","right":""} navables=11
✓ keytest         softkeys={"left":"","center":"选择","right":""} navables=19
✓ search          softkeys={"left":"刷新","center":"","right":"搜索"} navables=10
✓ search-results  softkeys={"left":"刷新","center":"打开","right":""} navables=20
✓ user            softkeys={"left":"刷新","center":"","right":""} navables=11
✓ player          softkeys={"left":"全屏","center":"暂停","right":"主页"} navables=0
✓ fullscreen      softkeys={"left":"播放/暂停","center":"","right":""} navables=0
✓ back-key        返回键 #/settings → #/profile

结果: 14/14 项通过
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
| 是否超出视口 | 元素右边界 vs 240px | 长文本把布局撑破（全屏播放器按横屏设计，豁免） |
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
| 左软键 | 页面主操作（首页=刷新、播放器详情=全屏、播放器评论=待实现、动态详情=评论/待实现） |
| 中间 | 中键（OK）当前会做什么的提示（打开/播放/暂停），本身不接收按键 |
| 右软键 | 页面自己定义（首页=搜索、关注=切Tab、视频页=UP 主页）；**没定义就是什么都不做** |

- 方向键：上下移动焦点（列表内自动滚动居中），左右在详情/评论等子 Tab 间切换
- 中键：打开/播放/暂停；评论列表中展开子评论
- **动态详情的中键提示跟着内容走**：这条动态能播视频（视频动态本身，或转发的原动态是视频）→ 中键显示「播放」，按中键直接进播放器；没有视频可播 → **中键不显示任何文案**（没绑定的键不显示提示）。切到「评论」Tab → 中键提示跟着焦点走（焦点在某条评论上 = 「展开」/「收起」，焦点不在评论上就不显示）
- **「我的」页不绑左右软键**：进页面焦点落在用户卡片上，中键（OK）打开当前选中项（用户卡片 / 历史记录 / 收藏 / 设置 / 关于 / 登出），软键栏只留中间的"打开"提示
- **关于页的「开发者」**：直接在应用里进他的**个人主页**（`/user?uid=29529884`），不是 `window.open` 拉起外部浏览器看网页空间 —— KaiOS 上外部浏览器体验差，而且应用内已经有这套用户主页了
- **搜索页**：左软键=刷新热搜，右软键=搜索；中间提示跟着焦点走（焦点在热搜列表里="打开"，输入框里中键什么都不做、就不显示文案）；↑ 从热搜列表顶部回到输入框，输入框里再按 ↑ 原地不动。**输入框里不绑中键搜索** —— 输入文本时按 OK 容易误触，搜索走右软键
- **视频页**：右软键 = 进 **UP 主主页**（`/user?uid=xxx`）；作者信息还没加载出来时这一格不显示文案（文案必须和行为一致）；设置里关掉「打开视频立刻播放」时，中键 = 去加载并播放（此时页面只显示封面）
- **全屏播放器**：↑ 后退 10 秒，↓ 短按前进 10 秒、**长按直接进 2 倍速**（长按不会先跳 10 秒，松手恢复原速）；←/→ 与硬件音量键调系统音量；中键/左软键 = 播放暂停；**右软键不绑**（全屏要沉浸，右软键留空）
- 模态组件打开时独占按键（左软键=取消，右软键=发送，Enter=发送）；评论回复框暂时下线（见「评论」章），模态独占这套机制本身留着给回复功能做回来用
- **返回键家族**：退格键 `Backspace`（规范名 `Back`，官方语义就是"返回上一级"）、Smart Touch 的 `GoBack`/`BrowserBack` 都能当"返回"用（顶层页面不拦截，交给系统退出）
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
- 播放地址在用户按中键的那一刻才去拉（`/x/player/wbi/playurl` 拿 DASH，拿不到退回 `/x/player/playurl` 的 MP4），拉完 `<video>` 元素自动播起来，进度接着历史记录里的位置
- 全屏播放器同理：进去先显示封面，按中键或左软键才加载
- 省流量也省电：翻列表看到封面就够了，不用点一个下一段视频

老版本存过的设置里没有这个字段，缺省按「开」处理 —— 不然老用户升级后打开视频会突然不播。

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
| `scopes.js` | 作用域注册表：优先级、独占、按实例注销、软键栏所有权 |
| `roving.js` | 焦点漫游：`[data-navable]` 收集、上下移动、区域边界、滚动居中、激活 |
| `index.js` | 按键总线：分发顺序、输入框策略、默认行为、长按 |
| `modalkeys.js` | 模态框独占作用域（评论回复框下线了，机制留着） |
| `device.js` | 设备能力探测（有没有相机键/音量键/挂断键） |

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
- 顶层页面（`/home`、`/following`、`/profile`）不拦截，交给系统退出应用
- 长按连发时只退一层（`e.repeat` 保护），否则一次长按会连续 pop 掉多级路由
- 页面自己声明了同名键就以页面为准（优先级更高），全局只在没人管时兜底
- 输入框聚焦时退格键让给输入法删字（`isTextKey('Back')` 为真）；模态框则自己声明 `Back` 的行为

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
