import { writable, get } from 'svelte/store';

export const ui = writable({
  route: '/home',
  softkeys: { left: '菜单', center: '', right: '...' },
  // 软键栏整个藏起来 (页面级的"沉浸模式")
  //
  // 和"二级菜单开不开"是两回事: 藏栏只是看不见软键栏这一条,
  // 页面派给软键的动作**照常有效** —— 例如全屏页把软键栏藏了,
  // 按右软键照样能展开二级菜单 (菜单面板是另一个图层, 不受这个开关影响)。
  softkeysHidden: false,
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

/** 内部: 只改软键显示, 不同步软键所有权 */
function setSoftkeysRaw(left, right, center) {
  ui.update(s => ({ ...s, softkeys: { left, center, right } }));
}

/** 内部: 只改软键栏可见性, 不同步软键所有权 */
function setHiddenRaw(hidden) {
  ui.update(s => ({ ...s, softkeysHidden: !!hidden }));
}

// ── 软键所有权 ─────────────────────────────────────────────────────────
// 参考 KaiUI 的 SoftKey: 软键的**文案**和**处理器**由同一个对象持有,
// 组件卸载时一起释放 (KaiUI 叫 unregisterSoftKeys)。
//
// 之前本项目里 setSoftkeys() 和 onKey() 是两套独立的东西, 于是会出现:
//   - 页面注册了按键处理器但忘了设文案 → 软键栏还显示上一个页面的文案
//   - 页面卸载了但文案还在 → 软键栏写着"刷新", 按下去却没人响应
//
// 现在: onKey(name, map, { softkeys }) 让作用域**接管**软键栏。
//   softkeys: true            → 只接管生命周期, 文案由页面自己 setSoftkeys() 动态改
//   softkeys: [left, right, center] → 接管并立即设置成这三个文案
// 作用域注销时自动把文案还原成接管之前的样子。
//
// 用"声明栈"而不是"简单栈": Svelte 3 路由切换时是新组件先 onMount、
// 旧组件后 onDestroy (顺序和 React 相反), 简单栈会还原错。
// 声明栈按下标取最后一个, 谁最后接管谁说了算, 与注销顺序无关。
//
// @type {Array<{owner: Object, labels: {left: string, right: string, center: string}, hidden: boolean}>}
const softkeyClaims = [];

/** 第一个接管之前的软键 (应用默认) */
let baseSoftkeys = null;

/**
 * 接管软键栏
 *
 * @param {Object} owner 拥有者 (通常是按键作用域)
 * @param {Array<string>|null} labels [left, right, center]; null 表示沿用当前文案
 * @param {boolean} [hidden=false] 是否把**软键栏整个藏起来** (沉浸模式)
 *
 *        藏栏 ≠ 菜单打不开: 页面派给软键的动作照常有效, 只是看不见那一行。
 *        例如全屏页把栏藏了, 按右软键照样能展开二级菜单 (菜单是另一个图层)。
 */
export function claimSoftkeys(owner, labels, hidden) {
  if (!baseSoftkeys) {
    const cur = get(ui).softkeys;
    baseSoftkeys = { left: cur.left, right: cur.right, center: cur.center, hidden: !!cur.softkeysHidden };
  }
  const cur = get(ui).softkeys;
  softkeyClaims.push({
    owner: owner,
    labels: labels
      ? { left: labels[0] || '', right: labels[1] || '', center: labels[2] || '' }
      : { left: cur.left, right: cur.right, center: cur.center },
    hidden: !!hidden
  });
  if (labels) {
    setSoftkeysRaw(labels[0] || '', labels[1] || '', labels[2] || '');
  }
  setHiddenRaw(!!hidden);
}

/**
 * 释放软键栏 (作用域注销时调用)
 * @param {Object} owner 拥有者
 */
export function releaseSoftkeys(owner) {
  for (let i = softkeyClaims.length - 1; i >= 0; i--) {
    if (softkeyClaims[i].owner === owner) {
      softkeyClaims.splice(i, 1);
      break;
    }
  }
  if (softkeyClaims.length) {
    // 还原成当前持有者的文案 + 可见性
    const top = softkeyClaims[softkeyClaims.length - 1];
    setSoftkeysRaw(top.labels.left, top.labels.right, top.labels.center);
    setHiddenRaw(top.hidden);
  } else if (baseSoftkeys) {
    // 没人接管了 → 回到应用默认
    setSoftkeysRaw(baseSoftkeys.left, baseSoftkeys.right, baseSoftkeys.center);
    setHiddenRaw(baseSoftkeys.hidden);
    baseSoftkeys = null;
  }
}

/**
 * 设置软键文案
 *
 * 顺带同步给当前持有者 —— 这样持有者注销时能正确还原成它自己那一份,
 * 而不是接管前的旧值。
 *
 * @param {string} left 左软键文案
 * @param {string} right 右软键文案
 * @param {string} [center] 中间文案 (中键会做什么的提示)
 */
export function setSoftkeys(left, right, center = '') {
  setSoftkeysRaw(left, right, center);
  if (softkeyClaims.length) {
    const top = softkeyClaims[softkeyClaims.length - 1];
    top.labels = { left: left, right: right, center: center };
  }
}
