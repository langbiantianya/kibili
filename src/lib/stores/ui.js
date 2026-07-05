import { writable } from 'svelte/store';

export const ui = writable({
  route: '#/home',
  softkeys: { left: '菜单', center: '', right: '...' },
  toast: '',
  toastTimer: null
});

export function showToast(msg, ms = 2000) {
  ui.update(s => {
    if (s.toastTimer) clearTimeout(s.toastTimer);
    return { ...s, toast: msg, toastTimer: setTimeout(() => ui.set({ ...s, toast: '' }), ms) };
  });
}

export function setSoftkeys(left, right, center = '') {
  ui.update(s => ({ ...s, softkeys: { left, center, right } }));
}
