// 模态组件 (如评论回复框) 的按键独占协调
//
// 回复框打开时由组件自己在 window 捕获阶段处理按键, 全局守卫在冒泡阶段吞掉同一次按键,
// 否则页面 (播放器等) 会在 keyup 阶段再次响应同一次软键按下, 例如刚取消回复框又被重新打开。
//
// 组件在捕获阶段处理按键后会调用 markHandledKey(), 这样即使模态在同一次 keydown 内关闭
// (DOM 上的 reply-modal-open 标记已移除), 紧随其后的 keyup 仍会被吞掉。

let pendingKeyUp = false;

/** 组件已处理本次按键: 记住要吞掉随后的 keyup */
export function markHandledKey() {
  pendingKeyUp = true;
}

/** 全局按键守卫 (注册为 window 冒泡阶段监听) */
export function modalKeyGuard(e) {
  if (document.body.classList.contains('reply-modal-open')) {
    if (e.type === 'keydown') pendingKeyUp = true;
    e.stopImmediatePropagation();
    return;
  }
  if (pendingKeyUp && e.type === 'keyup') {
    pendingKeyUp = false;
    e.stopImmediatePropagation();
  }
}
