import { writable } from 'svelte/store';

export const ui = writable({
  route: '/home',
  softkeys: { left: '菜单', center: '', right: '...' },
  toast: '',
  toastTimer: null
});

export function showToast(msg, ms = 2000) {
  ui.update(s => {
    clearTimeout(s.toastTimer);
    // 定时器只清除 toast, 不能回滚整份快照 (否则会把期间 setSoftkeys 的结果一起还原)
    return { ...s, toast: msg, toastTimer: setTimeout(() => {
      ui.update(cur => ({ ...cur, toast: '', toastTimer: null }));
    }, ms) };
  });
}

export function setSoftkeys(left, right, center = '') {
  ui.update(s => ({ ...s, softkeys: { left, center, right } }));
}
