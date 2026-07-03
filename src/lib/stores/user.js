import { writable, derived, get } from 'svelte/store';
import { persist } from './persist.js';

// 保留两套登录态:
// 1. SESSDATA + bili_jct (web 端, 用 Cookie)
// 2. access_token + refresh_token (TV 端 OAuth, 用 access_key 签名)
const initial = persist.load('user:v1', {
  // 通用
  mid: 0,
  name: '',
  face: '',
  expiresAt: 0,
  // web 端 (Cookie 登录)
  sessdata: '',
  bili_jct: '',
  // TV 端 (OAuth)
  accessToken: '',
  refreshToken: '',
  loginType: ''     // 'web' | 'tv' | ''
});

export const user = writable(initial);
user.subscribe(v => persist.save('user:v1', v));

export const isLogin = derived(user, $u => {
  if ($u.loginType === 'web') return !!$u.sessdata && !!$u.mid;
  if ($u.loginType === 'tv') return !!$u.accessToken && !!$u.mid;
  return false;
});

// TV 端登录 (来自 auth.js tvQrPoll 成功)
export function tvLogin({ mid, name, face, accessToken, refreshToken, expiresIn }) {
  const expiresAt = expiresIn ? Date.now() / 1000 + expiresIn : 0;
  user.set({
    mid, name, face, expiresAt,
    sessdata: '', bili_jct: '',
    accessToken, refreshToken,
    loginType: 'tv'
  });
}

// Web 端登录 (来自 webQrPoll, 用户手动填 SESSDATA, 后续登录态通过 getNav 验证)
export function webLogin({ sessdata, bili_jct, mid, name, face }) {
  user.set({
    mid, name, face, expiresAt: 0,
    sessdata, bili_jct,
    accessToken: '', refreshToken: '',
    loginType: 'web'
  });
}

export function userLogout() {
  user.set({
    mid: 0, name: '', face: '', expiresAt: 0,
    sessdata: '', bili_jct: '',
    accessToken: '', refreshToken: '',
    loginType: ''
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
