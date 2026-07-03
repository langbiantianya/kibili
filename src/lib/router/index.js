// Hash-based router with dynamic import for code-splitting
// 路由: #/home, #/following, #/profile, #/history, #/favorites, #/folder, #/player, #/login

import { writable } from 'svelte/store';

export const route = writable(location.hash || '#/home');

const ROUTES = {
  '#/home':      () => import('../views/Home.svelte'),
  '#/following': () => import('../views/Following.svelte'),
  '#/profile':   () => import('../views/Profile.svelte'),
  '#/history':   () => import('../views/History.svelte'),
  '#/favorites': () => import('../views/Favorites.svelte'),
  '#/folder':    () => import('../views/FolderContents.svelte'),
  '#/player':    () => import('../views/Player.svelte'),
  '#/login':     () => import('../views/Login.svelte')
};

window.addEventListener('hashchange', () => {
  route.set(location.hash || '#/home');
});

export function navigate(hash) {
  if (typeof hash === 'number') {
    // navigate(-1) = back
    history.go(hash);
    return;
  }
  if (!hash.startsWith('#')) hash = '#' + hash;
  if (location.hash === hash) {
    // 同一路由,手动触发更新
    route.set(hash);
  } else {
    location.hash = hash;
  }
}

export function back() {
  if (history.length > 1) history.back();
  else navigate('#/home');
}

export async function loadView(hash) {
  const loader = ROUTES[hash] || ROUTES['#/home'];
  const mod = await loader();
  return mod.default;
}

export function getRouteParams() {
  // 支持 #/folder?media_id=123
  const hash = location.hash || '#/home';
  const [path, query] = hash.split('?');
  const params = {};
  if (query) {
    query.split('&').forEach(kv => {
      const [k, v] = kv.split('=');
      params[k] = decodeURIComponent(v || '');
    });
  }
  return { path, params };
}
