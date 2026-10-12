// Focus mover for [data-navable] lists
// 在容器中找所有可聚焦元素,按 DOM 顺序排列,移动焦点

// KaiOS (Gecko 48) 不支持 ScrollIntoViewOptions 的 block 参数,
// 手动计算居中位置并滚动到视口中心.
// 注意: 真正滚动的是 .scroll-y 列表, 而不是 offsetParent (.main 是 position:relative 但不可滚),
// 所以这里向上找最近的可滚动祖先.
function findScroller(element) {
  let el = element.parentElement;
  let fallback = null;
  while (el && el !== document.body && el !== document.documentElement) {
    const cs = window.getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
    if (!fallback && el.scrollHeight > el.clientHeight + 1) fallback = el;
    el = el.parentElement;
  }
  return fallback;
}

function scrollIntoViewCenter(element) {
  const scroller = findScroller(element);
  const rect = element.getBoundingClientRect();
  if (!scroller) {
    const target = window.pageYOffset + rect.top - (window.innerHeight / 2) + (rect.height / 2);
    window.scrollTo(0, target);
    return;
  }
  const srect = scroller.getBoundingClientRect();
  const delta = (rect.top - srect.top) - (srect.height / 2) + (rect.height / 2);
  const targetScrollTop = scroller.scrollTop + delta;
  if (scroller.scrollTo) {
    scroller.scrollTo(0, targetScrollTop);
  } else {
    scroller.scrollTop = targetScrollTop;
  }
}

export function getFocusables(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll('[data-navable]:not([disabled])'))
    .filter(el => el.offsetParent !== null || el === document.activeElement);
}

export function focusFirst(root) {
  const list = getFocusables(root || document);
  if (list.length) {
    list[0].focus();
    scrollIntoViewCenter(list[0]);
  }
}

export function moveFocus(delta, root) {
  const container = root || document;
  const list = getFocusables(container);
  if (!list.length) return false;
  const cur = document.activeElement;
  let i = list.indexOf(cur);
  if (i < 0) i = 0;
  else i = i + delta;
  if (i < 0) i = 0;
  if (i >= list.length) i = list.length - 1;
  const next = list[i];
  if (next && next !== cur) {
    next.focus();
    scrollIntoViewCenter(next);
    return true;
  }
  return false;
}

export function activateFocused() {
  const el = document.activeElement;
  if (!el) return false;
  if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.dataset.navable !== undefined) {
    el.click();
    return true;
  }
  return false;
}
