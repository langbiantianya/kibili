// 系统音量 (KaiOS)
//
// KaiOS 2.4 (Gecko 48) 的 navigator.volumeManager 只有三个方法:
//   requestUp() / requestDown() / requestShow()
// 真机实测 (Nokia 6300 4G): 没有 volume 读数, 也没有 input 事件 ——
// 读不到当前系统音量, 只能"请求"系统调高一格/调低一格。
//
// 所以应用不自己维护"应用内音量":
//   * 媒体元素不设 volume (保持 1.0), 听到的声音就等于系统音量, 不会多一层增益
//   * 也不画自己的音量滑块 —— 读不到系统档位, 画出来的条只会和系统对不上
//   * 调音量时 requestUp/requestDown 会让系统自己弹出音量气泡 (显示 1/15 这样的档位)
//
// 静音是另一回事: 系统音量接口在 2.4 上没有静音方法, 静音由应用把媒体元素 muted 置位,
// 状态存在 settings.muted 里。
//
// 硬件音量键 (VolumeUp / VolumeDown) 也走这里 —— 和长按 ↑↓ 是同一个动作。

/**
 * 请求系统调高/调低一格音量
 *
 * @param {number} delta > 0 调高, < 0 调低, 0 不做处理
 * @returns {boolean} 是否成功发出请求
 */
export function requestSystemVolume(delta) {
  if (typeof navigator === 'undefined') return false;
  const vm = /** @type {any} */ (navigator).volumeManager;
  if (!vm) return false;
  try {
    if (delta > 0) {
      vm.requestUp();
    } else if (delta < 0) {
      vm.requestDown();
    } else {
      return false;
    }
    return true;
  } catch (e) {
    // 设备没有音量接口时静默失败
    return false;
  }
}
