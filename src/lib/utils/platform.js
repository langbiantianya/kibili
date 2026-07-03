// Platform detection helpers

export function isKaiOS() {
  return /KaiOS/i.test(navigator.userAgent || '');
}

export function isInputFocused(e) {
  const el = e.target;
  if (!el) return false;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

// Resize a Bilibili image URL with @ suffix
// e.g. https://i0.hdslb.com/bfs/archive/abc.jpg -> .../abc.jpg@160w_100h.webp
export function biliImg(url, w, h, fmt) {
  if (!url) return '';
  const f = fmt || 'jpg';
  const dim = (w ? w + 'w' : '') + (h ? '_' + h + 'h' : '');
  return url + (dim ? '@' + dim + '.' + f : '');
}
