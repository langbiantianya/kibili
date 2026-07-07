// Router wrapper for svelte-spa-router
// Provides a compatible API for the existing codebase

import { push, pop } from 'svelte-spa-router';

/**
 * Navigate to a new route.
 * Supports both hash strings (e.g. '#/player?bvid=xxx') and relative paths.
 * Also supports passing a number for history.go(n).
 */
export function navigate(target) {
  if (typeof target === 'number') {
    if (target === -1) {
      pop();
    } else {
      history.go(target);
    }
    return;
  }

  let path = target;
  // Remove leading # if present
  if (path.startsWith('#')) {
    path = path.slice(1);
  }
  // Ensure path starts with /
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  push(path);
}

/**
 * Go back in history.
 */
export function back() {
  if (history.length > 1) {
    pop();
  } else {
    push('/home');
  }
}

/**
 * Get route parameters from the current URL hash.
 * Maintains backward compatibility with the old hash-based query params.
 * @returns {{ path: string, params: Record<string, string> }}
 */
export function getRouteParams() {
  // Read the current hash from location
  const hash = location.hash || '#/home';
  const [pathPart, query] = hash.split('?');
  const params = {};
  if (query) {
    query.split('&').forEach(kv => {
      const [k, v] = kv.split('=');
      params[k] = decodeURIComponent(v || '');
    });
  }
  return { path: pathPart, params };
}

/**
 * Get query parameters from a URL search string.
 * @param {string} search - URL search string (e.g. '?bvid=xxx&foo=bar')
 * @returns {Record<string, string>}
 */
export function getQueryParams(search) {
  const params = {};
  if (!search) return params;
  const query = search.startsWith('?') ? search.slice(1) : search;
  query.split('&').forEach(kv => {
    const [k, v] = kv.split('=');
    params[k] = decodeURIComponent(v || '');
  });
  return params;
}
