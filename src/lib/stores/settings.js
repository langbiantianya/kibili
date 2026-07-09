import { writable, get } from 'svelte/store';
import { persist } from './persist.js';

const initial = persist.load('settings:v1', {
  quality: 16,            // 320p-ish cap
  volume: 1,
  muted: false,
  listenOnlyDefault: false
});

export const settings = writable(initial);

settings.subscribe(v => persist.save('settings:v1', v));
