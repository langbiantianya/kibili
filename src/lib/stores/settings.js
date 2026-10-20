import { writable, get } from 'svelte/store';
import { persist } from './persist.js';

const initial = persist.load('settings:v1', {
  quality: 16,            // 320p-ish cap
  muted: false,
  listenOnlyDefault: false
});

// 旧版本存过"应用内音量"(settings.volume), 现在音量只走系统 (KaiOS 2.4 读不到系统音量,
// 应用再叠一层增益只会和系统对不上), 这个字段已经没有意义, 读出来时顺手丢掉
if (initial && typeof initial === 'object' && 'volume' in initial) {
  delete initial.volume;
}

export const settings = writable(initial);

settings.subscribe(v => persist.save('settings:v1', v));
