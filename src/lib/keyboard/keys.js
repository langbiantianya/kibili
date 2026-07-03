// Key code mapping for KaiOS 2.4 / Gecko 48
// 优先用 KeyboardEvent.key (string), 兜底用 keyCode (number)
export const KEY = {
  Up:        { key: 'ArrowUp',    code: 38 },
  Down:      { key: 'ArrowDown',  code: 40 },
  Left:      { key: 'ArrowLeft',  code: 37 },
  Right:     { key: 'ArrowRight', code: 39 },
  Enter:     { key: 'Enter',      code: 13 },
  Back:      { key: 'Back',       code: 8,  alt: ['Escape', 27] },
  SoftLeft:  { key: 'SoftLeft',   code: 183 },
  SoftRight: { key: 'SoftRight',  code: 187 },
  Star:      { key: '*',          code: 56 },
  Hash:      { key: '#',          code: 51 },
  VolUp:     { key: 'AudioVolumeUp',   code: 175 },
  VolDown:   { key: 'AudioVolumeDown', code: 174 },
  VolMute:   { key: 'AudioVolumeMute', code: 173 }
};

export const DIGIT_KEYS = {
  '0': 48, '1': 49, '2': 50, '3': 51, '4': 52,
  '5': 53, '6': 54, '7': 55, '8': 56, '9': 57
};

export function isDigit(k) {
  return typeof k === 'string' && /^[0-9]$/.test(k);
}
