import { writable, derived, get } from 'svelte/store';
import { persist } from './persist.js';

const initial = persist.load('user:v1', {
  mid: 0,
  name: '',
  face: '',
  expiresAt: 0,
  sessdata: '',
  bili_jct: ''
});

export const user = writable(initial);
user.subscribe(v => persist.save('user:v1', v));

export const isLogin = derived(user, $u => {
  return !!$u.sessdata && !!$u.mid;
});

// Web 端登录
export function webLogin({ sessdata, bili_jct, mid, name, face }) {
  user.set({
    mid, name, face, expiresAt: 0,
    sessdata, bili_jct
  });
}

export function userLogout() {
  user.set({
    mid: 0, name: '', face: '', expiresAt: 0,
    sessdata: '', bili_jct: ''
  });
}

// 刷新当前登录用户信息
export async function hydrateFromNav() {
  if (!get(user).mid) return;
  try {
    const { getNav } = await import('../api/user.js');
    const nav = await getNav();
    if (nav && nav.mid) {
      user.update(u => ({ ...u, mid: nav.mid, name: nav.uname, face: nav.face || u.face }));
    }
  } catch (e) {
    // 401 / 网络错误 - 忽略
  }
}
