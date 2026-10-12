// 注入到应用页面里跑的 UI 探针 (由 scripts/device-test.js 通过调试协议 evaluateJS 注入)。
// 返回当前页面快照 + 可自动判定的问题清单, 不依赖任何构建产物。
(function () {
  var vw = window.innerWidth, vh = window.innerHeight;
  var issues = [];
  // 这些容器里的文字来自 B 站接口 (标题/动态/评论/热搜), 里面带 emoji 是内容问题,
  // 不是应用 UI 用了字体不支持的图标, 因此不做字形检查
  var CONTENT_RE = /\.(title|text|keyword|hot-keyword|comment-content|atitle|up-name|name|desc|user-info)\b/;

  function desc(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      var cls = el.className.trim().split(/\s+/).filter(function (c) {
        return c && c.indexOf('svelte-') !== 0;
      });
      if (cls.length) s += '.' + cls.join('.');
    }
    return s;
  }

  function shown(el) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'HEAD') return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    if (el.offsetParent === null && cs.position !== 'fixed') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  }

  // ---- 字形渲染检测: 系统字体缺失的字符会渲染为空白或豆腐块 ----
  var cache = {};
  function glyphBitmap(ctx, s) {
    ctx.clearRect(0, 0, 40, 40);
    ctx.fillStyle = '#000';
    ctx.font = '20px sans-serif';
    ctx.fillText(s, 4, 28);
    var px = ctx.getImageData(0, 0, 40, 40).data;
    var out = '';
    for (var i = 0; i < px.length; i += 4) out += (px[i + 3] > 20 ? '1' : '0');
    return out;
  }
  function missingGlyph(ch, ctx, blank, tofu) {
    if (cache[ch] !== undefined) return cache[ch];
    var b = glyphBitmap(ctx, ch);
    var bad = (b === blank || b === tofu);
    cache[ch] = bad;
    return bad;
  }

  var cv = document.createElement('canvas');
  cv.width = 40; cv.height = 40;
  var gctx = cv.getContext('2d');
  var blankBmp = glyphBitmap(gctx, ' ');
  var tofuBmp = glyphBitmap(gctx, '\uFFFF');

  // ---- 快照 ----
  var out = {
    route: location.hash || '(none)',
    viewport: [vw, vh],
    softkeys: null,
    navables: document.querySelectorAll('[data-navable]:not([disabled])').length,
    focus: null,
    issues: issues,
    missingGlyphs: [],
    visibleTexts: 0
  };

  var bar = document.querySelector('.softkey-bar');
  out.softkeys = bar ? {
    left: (bar.querySelector('.left') || {}).innerText || '',
    center: (bar.querySelector('.center') || {}).innerText || '',
    right: (bar.querySelector('.right') || {}).innerText || ''
  } : null;

  var fe = document.activeElement;
  if (fe && fe !== document.body) {
    var fr = fe.getBoundingClientRect();
    out.focus = {
      el: desc(fe),
      text: (fe.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      inViewport: fr.top >= 0 && fr.bottom <= vh
    };
  }

  // ---- 逐元素检查 ----
  var all = document.querySelectorAll('*');
  var textChars = {};
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    if (!shown(el)) continue;
    var cs = window.getComputedStyle(el);
    var r = el.getBoundingClientRect();

    if (r.right > vw + 1 || r.left < -1) {
      issues.push({ t: 'outOfViewportX', el: desc(el), right: Math.round(r.right), vw: vw });
    }

    if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0) {
      issues.push({ t: 'imageFailed', el: desc(el), src: (el.currentSrc || el.src || '').slice(0, 80) });
    }

    // 文本节点: 收集字符供字形检查
    var hasElementChild = false;
    for (var j = 0; j < el.childNodes.length; j++) {
      if (el.childNodes[j].nodeType === 1) { hasElementChild = true; break; }
    }
    if (!hasElementChild && !CONTENT_RE.test(desc(el))) {
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) {
        out.visibleTexts++;
        for (var k = 0; k < t.length; k++) {
          var code = t.charCodeAt(k);
          if (code >= 0x4e00 && code <= 0x9fff) continue;      // CJK 一定有字形
          if (code < 33) continue;                             // 控制字符与半角空格
          if (code === 0xa0 || (code >= 0x2000 && code <= 0x200f) || code === 0x3000) continue; // 各种空格
          if (!textChars[t.charAt(k)]) textChars[t.charAt(k)] = true;
        }
      }
    }

    // 可滚动容器本身不能超出裁剪祖先, 否则容器底部永远滚不到可视区
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      var anc = el.parentElement;
      while (anc && anc !== document.body) {
        var acs = window.getComputedStyle(anc);
        if (acs.overflow !== 'visible') {
          var ar = anc.getBoundingClientRect();
          if (r.bottom > ar.bottom + 1 || r.top < ar.top - 1) {
            issues.push({
              t: 'scrollBoxClipped', el: desc(el), clippedBy: desc(anc),
              box: [Math.round(r.top), Math.round(r.bottom)],
              clip: [Math.round(ar.top), Math.round(ar.bottom)]
            });
          }
          break;
        }
        anc = anc.parentElement;
      }
    }
  }

  for (var ch in textChars) {
    if (missingGlyph(ch, gctx, blankBmp, tofuBmp)) {
      out.missingGlyphs.push(ch + ' U+' + ch.charCodeAt(0).toString(16));
    }
  }

  return JSON.stringify(out);
})()