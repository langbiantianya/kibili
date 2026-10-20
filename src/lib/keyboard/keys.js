// KaiOS 2.4 / Gecko 48 设备按键规范化
//
// ── 为什么需要这一层 ───────────────────────────────────────────────────
// KaiOS 的同一个物理键, 在不同机型 / 不同固件 / 不同输入法状态下, 上报的 DOM key
// 并不统一。实测踩过的坑:
//
//   方向键   'ArrowUp' (Gecko 48 标准) / 'Up' (部分机型) / 'Unidentified' + keyCode 38
//   中键     'Enter' / 'Accept' / 'Unidentified' + keyCode 13
//   软键     'SoftLeft' / 'SoftRight' —— **keyCode 是 0**, 只能靠 e.key 认
//   退格     'Backspace' (keyCode 8)
//
// 官方文档 (kaios.dev "Special Keys on KaiOS") 明确要求:
//   "Always use the KeyboardEvent#key property, as many keys lack a keyCode,
//    and the code property changes based on keyboard layout and device configuration."
// → e.code 不可靠 (随键盘布局变), e.keyCode 很多键是 0, **只有 e.key 稳定**。
//
// 所以这里的策略是:
//   1. 优先用 e.key (唯一的可靠来源)
//   2. e.key 缺失时用 e.keyCode 兜底 (静态表 + 运行时自学习表)
//   3. 运行时自学习: 见过一次 "keyCode → 已知 key 名" 就记下来,
//      之后遇到 'Unidentified' 就能还原 —— 不同机型自动适配
//
// ── 真实 KaiOS 设备按键表 ──────────────────────────────────────────────
// 键名来自 Gecko 48 的 dom/events/KeyNameList.h (KaiOS 2.4 实际能产生的 key),
// keyCode 来自 Gecko 48 的 dom/interfaces/events/nsIDOMKeyEvent.idl。
//
//   SoftLeft / SoftRight   keyCode 0     ← **没有 DOM keyCode, 只能靠 e.key**
//   Enter / Accept         keyCode 13
//   Backspace              keyCode 8
//   VolumeUp               keyCode 183   ← 2.4 是 183
//   VolumeDown             keyCode 182   ← 2.4 是 182
//   VolumeMute             keyCode 181
//   Camera / Power / Call / EndCall / Symbol / HeadsetHook / Notification
//                          keyCode 0     ← 全都只能靠 e.key
//
// ⚠️ KaiOS 3 (Gecko 84, 如 Nokia 8000 4G) 的音量 keyCode 和 2.4 **正好相反**:
//   KaiOS 3: VolumeUp=182, VolumeDown=183, Symbol=224, EndCall=95
//   KaiOS 2.4: VolumeUp=183, VolumeDown=182
// 所以静态表只按 2.4 (本项目目标) 写, 跨版本由"运行时自学习"兜底 ——
// 见下面 learnKeyCode()。

/**
 * 规范键名表 (视图里的按键表统一用这些名字)
 * @enum {string}
 */
export const KEY = {
  // 方向键
  Up:        { key: 'ArrowUp',    code: 38 },
  Down:      { key: 'ArrowDown',  code: 40 },
  Left:      { key: 'ArrowLeft',  code: 37 },
  Right:     { key: 'ArrowRight', code: 39 },

  // 确认 / 软键
  Enter:     { key: 'Enter',      code: 13 },
  Accept:    { key: 'Accept',     code: 0 },
  SoftLeft:  { key: 'SoftLeft',   code: 0 },
  SoftRight: { key: 'SoftRight',  code: 0 },

  // 返回家族 (都能当"返回/取消"用)
  Back:        { key: 'Backspace',   code: 8 },
  GoBack:      { key: 'GoBack',      code: 0 },
  BrowserBack: { key: 'BrowserBack', code: 0 },
  EndCall:     { key: 'EndCall',     code: 0 },

  // 系统 / 硬件键
  Power:            { key: 'Power',            code: 0 },
  Call:             { key: 'Call',             code: 0 },
  Camera:           { key: 'Camera',           code: 0 },
  HeadsetHook:      { key: 'HeadsetHook',      code: 0 },
  LaunchWebBrowser: { key: 'LaunchWebBrowser', code: 0 },
  LaunchMail:       { key: 'LaunchMail',       code: 0 },
  Message:          { key: 'Message',          code: 0 },
  Notification:     { key: 'Notification',     code: 0 },
  MicrophoneToggle: { key: 'MicrophoneToggle', code: 0 },
  Flip:             { key: 'Flip',             code: 0 },

  // 音量 (Gecko 48 的 keyCode; KaiOS 3 上 182/183 是反的, 靠自学习纠正)
  VolumeUp:   { key: 'VolumeUp',   code: 183 },
  VolumeDown: { key: 'VolumeDown', code: 182 },
  Mute:       { key: 'VolumeMute', code: 181 },

  // 符号输入 (切换 # * - + @)
  Symbol:     { key: 'Symbol', code: 0 }
};

/**
 * DOM key → 规范名
 * 覆盖 KaiOS / Gecko 上会遇到的全部别名。
 */
const ALIAS = {
  ArrowUp: 'Up',
  Up: 'Up',
  ArrowDown: 'Down',
  Down: 'Down',
  ArrowLeft: 'Left',
  Left: 'Left',
  ArrowRight: 'Right',
  Right: 'Right',
  Accept: 'Enter',
  Enter: 'Enter',
  SoftLeft: 'SoftLeft',
  F1: 'SoftLeft',
  SoftRight: 'SoftRight',
  F2: 'SoftRight',

  // 返回家族
  Back: 'Back',
  Backspace: 'Back',
  BrowserBack: 'BrowserBack',
  GoBack: 'GoBack',
  EndCall: 'EndCall',

  // 系统键
  Power: 'Power',
  PowerOff: 'Power',
  Call: 'Call',
  Camera: 'Camera',
  HeadsetHook: 'HeadsetHook',
  LaunchWebBrowser: 'LaunchWebBrowser',
  LaunchMail: 'LaunchMail',
  Message: 'Message',
  Notification: 'Notification',
  MicrophoneToggle: 'MicrophoneToggle',
  Flip: 'Flip',

  // 音量 (Gecko 48 的 key 名是 VolumeUp/VolumeDown/VolumeMute;
  //        KaiOS 3 有时用 AudioVolumeUp 这种 code 值, 一并兼容)
  VolumeUp: 'VolumeUp',
  VolumeDown: 'VolumeDown',
  VolumeMute: 'Mute',
  AudioVolumeUp: 'VolumeUp',
  AudioVolumeDown: 'VolumeDown',
  AudioVolumeMute: 'Mute',

  // 符号输入
  Symbol: 'Symbol',
  SymbolLock: 'Symbol',

  Escape: 'Escape',
  Esc: 'Escape',
  ' ': 'Space',
  Spacebar: 'Space',
  Space: 'Space',
  Tab: 'Tab'
};

/**
 * keyCode → 规范名 (e.key 不可用时的兜底)
 *
 * 数值取自 Gecko 48 的 dom/interfaces/events/nsIDOMKeyEvent.idl,
 * 即 KaiOS 2.4 (本项目目标) 的实际定义:
 *
 *   CANCEL 3 / BACK_SPACE 8 / TAB 9 / RETURN 13 / ESCAPE 27 / SPACE 32 / END 35
 *   LEFT 37 / UP 38 / RIGHT 39 / DOWN 40 / DELETE 46 / 数字键 48-57 / WIN 91
 *   ADD 107 / DECIMAL 110 / DIVIDE 111
 *   VOLUME_MUTE 181 / VOLUME_DOWN 182 / VOLUME_UP 183
 *
 * 软键 (SoftLeft/SoftRight)、相机键、电源键、通话键、符号键在 Gecko 48 里
 * **根本没有对应的 DOM_VK** —— 它们的 keyCode 是 0, 只能靠 e.key 识别。
 * 所以这里没有任何 183/187 之类的"猜软键"映射。
 */
const CODE_TO_NAME = {
  3: 'Cancel',
  8: 'Back',
  9: 'Tab',
  13: 'Enter',
  27: 'Escape',
  32: 'Space',
  35: 'End',
  37: 'Left',
  38: 'Up',
  39: 'Right',
  40: 'Down',
  46: 'Delete',
  91: 'Menu',
  107: 'Add',
  110: 'Decimal',
  111: 'Divide',
  181: 'Mute',
  182: 'VolumeDown',
  183: 'VolumeUp'
};

/**
 * 运行时自学习到的 keyCode → 规范名
 *
 * 不同机型的 keyCode 分配可能有出入 (同一台机器上 SoftRight 到底是 0 还是别的值)。
 * 只要见过一次 "已知 key 名 + 某个 keyCode", 就把它记下来,
 * 之后遇到 e.key === 'Unidentified' 的事件就能还原。
 * 优先级高于静态表 —— 因为自学习到的是**这台机器的实测事实**。
 *
 * @type {Object<number, string>}
 */
const learnedCodes = {};

/**
 * 规范名 → 视图按键表里允许的旧写法 (向后兼容)
 * 视图里写 'ArrowUp' 也能被识别, 但新代码请直接写 'Up'。
 */
export const LEGACY_ALIAS = {
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight'
};

/**
 * 系统级按键: 由系统/别的应用处理, 应用不应该吞掉
 *
 * 官方文档明确警告:
 *   "Never block the user from leaving your app. Although KaiOS allows apps to
 *    intercept important navigational keys like Backspace and Power, users can
 *    typically long-press these keys to terminate your app."
 *
 * 这些键默认不走任何作用域, 也不 preventDefault, 保证系统永远能收到。
 * (某个页面若显式声明了其中某个键, 视为应用主动选择接管。)
 *
 * @type {Array<string>}
 */
export const SYSTEM_KEYS = [
  'Power',
  'Call',
  'Camera',
  'HeadsetHook',
  'LaunchWebBrowser',
  'LaunchMail',
  'Message',
  'Notification',
  'MicrophoneToggle'
];

/**
 * 把 KeyboardEvent 归一化成规范键名。
 *
 * @param {KeyboardEvent} e
 * @returns {string} 规范名; 单字符按键 (数字/字母/标点) 原样返回; 无法识别返回 ''
 */
export function canonicalKey(e) {
  if (!e) return '';
  const raw = e.key;

  // e.key 可用 (且不是 Unidentified) 时优先用它 —— 这是唯一可靠的来源
  if (raw && raw !== 'Unidentified' && raw !== 'Unknown') {
    if (ALIAS[raw]) return ALIAS[raw];
    return raw;
  }

  // e.key 不可用: 优先用自学习表 (本机实测), 再用静态表
  const code = e.keyCode || e.which || 0;
  if (code && learnedCodes[code]) return learnedCodes[code];
  if (code && CODE_TO_NAME[code]) return CODE_TO_NAME[code];
  if (code >= 48 && code <= 57) return String.fromCharCode(code); // 数字键
  if (code >= 65 && code <= 90) return String.fromCharCode(code); // 字母键
  // 认不出来就返回空串 —— 'Unidentified' 不是有效的规范名
  return '';
}

/**
 * 学习 keyCode → 规范名 的映射 (运行时自适配不同机型)
 *
 * 每次收到 keydown 都调一次: 只要这个事件的 e.key 是认识的,
 * 就把 (keyCode → 规范名) 记下来。之后遇到 e.key === 'Unidentified'
 * 的事件就能还原出正确的键名。
 *
 * @param {KeyboardEvent} e
 */
export function learnKeyCode(e) {
  if (!e) return;
  const raw = e.key;
  if (!raw || raw === 'Unidentified' || raw === 'Unknown') return;
  const name = ALIAS[raw] || (raw.length === 1 ? raw : null);
  if (!name) return;
  const code = e.keyCode || e.which || 0;
  if (!code) return;
  // 自学习优先于静态表 (静态表只是冷启动兜底)
  if (learnedCodes[code] !== name) learnedCodes[code] = name;
}

/**
 * 读取自学习到的映射 (调试用)
 * @returns {Object<number, string>}
 */
export function learnedKeyCodes() {
  return learnedCodes;
}

/**
 * 清空自学习到的映射 (仅测试用)
 */
export function resetLearnedKeyCodes() {
  for (const k in learnedCodes) {
    delete learnedCodes[k];
  }
}

/**
 * 判断某个规范键名是否是"文字类"按键。
 *
 * 文字类按键在输入框聚焦时必须让给输入法 / 输入框本身:
 *   数字 0-9、字母、空格、*、#、标点、退格、符号输入键
 * 方向键 / 中键 / 软键不算 —— 它们是导航语义, 页面仍然需要收到。
 *
 * @param {string} name 规范键名
 * @returns {boolean}
 */
export function isTextKey(name) {
  if (!name) return false;
  if (name === 'Space' || name === 'Back' || name === 'Symbol') return true;
  if (name.length !== 1) return false;
  const c = name.charCodeAt(0);
  if (c >= 48 && c <= 57) return true;   // 0-9
  if (c >= 65 && c <= 90) return true;   // A-Z
  if (c >= 97 && c <= 122) return true;  // a-z
  if (c >= 33 && c <= 47) return true;   // ! " # $ % & ' ( ) * + , - . /
  if (c >= 58 && c <= 64) return true;   // : ; < = > ? @
  if (c >= 91 && c <= 96) return true;   // [ \ ] ^ _ `
  if (c >= 123 && c <= 126) return true;  // { | } ~
  return false;
}

/**
 * 判断按键是否匹配 (优先用 KeyboardEvent.key, 兜底用 keyCode)
 *
 * @param {KeyboardEvent} e
 * @param {string} keyName 规范名或旧写法
 * @returns {boolean}
 */
export function matchKey(e, keyName) {
  const name = canonicalKey(e);
  if (!name || !keyName) return false;
  if (name === keyName) return true;
  const legacy = LEGACY_ALIAS[keyName];
  return !!(legacy && name === legacy);
}

/**
 * 获取按键的友好名称 (调试用)
 *
 * @param {KeyboardEvent} e
 * @returns {string}
 */
export function getKeyName(e) {
  const name = canonicalKey(e);
  if (name && name.length === 1 && name >= '0' && name <= '9') return 'Digit' + name;
  return name;
}

/**
 * 判断是否为数字键
 * @param {string} k - 按键字符
 * @returns {boolean}
 */
export function isDigit(k) {
  return typeof k === 'string' && /^[0-9]$/.test(k);
}
