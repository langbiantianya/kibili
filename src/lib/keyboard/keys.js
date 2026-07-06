// Key code mapping for KaiOS 2.4 / Gecko 48
// 优先用 KeyboardEvent.key (string), 兜底用 keyCode (number)

/**
 * KaiOS 2.4 按键映射表
 *
 * KaiOS 设备按键布局（典型）：
 * ┌─────────┬─────────┬─────────┐
 * │ SoftLeft│   Up    │SoftRight│
 * │  (菜单)  │         │  (选项)  │
 * ├─────────┼─────────┼─────────┤
 * │  Left   │  Enter  │  Right  │
 * │         │  (确定)  │         │
 * ├─────────┼─────────┼─────────┤
 * │         │  Down   │         │
 * │         │         │         │
 * └─────────┴─────────┴─────────┘
 *
 * 数字键: 0-9, *, #
 * 音量键: VolUp, VolDown, VolMute
 * 通话键: Call (绿色), End (红色)
 */
export const KEY = {
  // 方向键
  Up:        { key: 'ArrowUp',    code: 38 },
  Down:      { key: 'ArrowDown',  code: 40 },
  Left:      { key: 'ArrowLeft',  code: 37 },
  Right:     { key: 'ArrowRight', code: 39 },

  // 确认/返回
  Enter:     { key: 'Enter',      code: 13 },
  Back:      { key: 'Back',       code: 8,  alt: ['Escape', 27] },

  // 软键（KaiOS 特有）
  SoftLeft:  { key: 'SoftLeft',   code: 183 },
  SoftRight: { key: 'SoftRight',  code: 187 },

  // 数字键和特殊字符
  Star:      { key: '*',          code: 56 },
  Hash:      { key: '#',          code: 51 },

  // 音量控制
  VolUp:     { key: 'AudioVolumeUp',   code: 175 },
  VolDown:   { key: 'AudioVolumeDown', code: 174 },
  VolMute:   { key: 'AudioVolumeMute', code: 173 }
};

/**
 * 数字键映射表
 * KaiOS 2.4 T9 输入法激活时，数字键会被输入法占用
 * 需要通过 isInputFocused() 判断是否处于输入状态
 */
export const DIGIT_KEYS = {
  '0': 48, '1': 49, '2': 50, '3': 51, '4': 52,
  '5': 53, '6': 54, '7': 55, '8': 56, '9': 57
};

/**
 * 判断是否为数字键
 * @param {string} k - 按键字符
 * @returns {boolean}
 */
export function isDigit(k) {
  return typeof k === 'string' && /^[0-9]$/.test(k);
}

/**
 * 判断按键是否匹配
 * 同时支持 KeyboardEvent.key 和 KeyboardEvent.keyCode
 *
 * @param {KeyboardEvent} e - 键盘事件
 * @param {string} keyName - 按键名称（如 'Enter', 'SoftLeft'）
 * @returns {boolean}
 */
export function matchKey(e, keyName) {
  const def = KEY[keyName];
  if (!def) return false;

  // 优先匹配 key
  if (e.key === def.key) return true;

  // 兜底匹配 keyCode
  if (e.keyCode === def.code) return true;

  // 匹配备选键
  if (def.alt) {
    for (let i = 0; i < def.alt.length; i += 2) {
      if (e.key === def.alt[i] || e.keyCode === def.alt[i + 1]) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 获取按键的友好名称
 * @param {KeyboardEvent} e
 * @returns {string}
 */
export function getKeyName(e) {
  if (e.key === 'SoftLeft') return 'SoftLeft';
  if (e.key === 'SoftRight') return 'SoftRight';
  if (e.key === 'Enter' || e.keyCode === 13) return 'Enter';
  if (e.key === 'Back' || e.keyCode === 8) return 'Back';
  if (e.key.startsWith('Arrow')) return e.key;
  if (e.key >= '0' && e.key <= '9') return 'Digit' + e.key;
  return e.key;
}
