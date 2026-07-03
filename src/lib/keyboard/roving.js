// Focus mover for [data-navable] lists
// 在容器中找所有可聚焦元素,按 DOM 顺序排列,移动焦点

export function getFocusables(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll('[data-navable]:not([disabled])'))
    .filter(el => el.offsetParent !== null || el === document.activeElement);
}

export function focusFirst(root) {
  const list = getFocusables(root || document);
  if (list.length) {
    list[0].focus();
    list[0].scrollIntoView({ block: 'center' });
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
    next.scrollIntoView({ block: 'center' });
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
