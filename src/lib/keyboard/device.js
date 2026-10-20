// KaiOS 设备能力探测 (Feature Detection)
//
// 不同机型的硬件键不一样:
//   - 所有 KaiOS 都有: 方向键 + 左软键 + 右软键
//   - Nokia 105 / 110 / 150 / 210 / 220 / 225 / 230: 有 拨号键 + 挂断键 (EndCall)
//   - Nokia 6300 4G / 8000 4G: 有 音量键 (VolumeUp / VolumeDown) + 相机键
//   - Nokia 8000 4G (KaiOS 3 Smart Touch): 还有 GoBack 键
//
// 官方文档 (kaios.dev "Special Keys on KaiOS") 建议用特性探测来知道
// 设备上到底有没有相机键 / 音量键, 而不是硬编码。
//
// KaiOS 2.5 提供:
//   navigator.hasFeature(name) → Promise<boolean>
//   navigator.getFeature(name) → Promise<any>
//   名字形如 'device.capability.volume-key' / 'device.capability.camera-key'
//                       / 'device.capability.endcall-key' / 'device.capability.qwerty'
//
// KaiOS 3.0 移除了 hasFeature, 改用 DeviceCapabilityManager:
//   DeviceCapabilityManager.get('device.key.volume')
//   DeviceCapabilityManager.get('device.qwerty')
//
// KaiOS 2.4 (Gecko 48) 上这两个 API 都没有 —— 此时一律按"没有"处理,
// 调用方要用降级逻辑 (例如没有音量键就不显示音量提示)。
//
// 权限: 需要 manifest 里的 "feature-detection" 权限;
// 拿不到权限时 API 会 reject, 这里统一吞掉并按 false 处理。

/** 已知键名 → 各版本的 feature 名字 */
const KEY_FEATURES = {
  volume:   { kaios25: 'device.capability.volume-key',   kaios30: 'device.key.volume' },
  camera:   { kaios25: 'device.capability.camera-key',   kaios30: 'device.key.camera' },
  endcall:  { kaios25: 'device.capability.endcall-key',  kaios30: 'device.key.endcall' },
  qwerty:   { kaios25: 'device.capability.qwerty',        kaios30: 'device.qwerty' }
};

/** 探测结果缓存: name → Promise<boolean> */
const cache = {};

/** 已经解析出来的同步缓存: name → boolean */
const resolved = {};

/**
 * 取 navigator (SSR / 测试环境下可能没有)
 * @returns {Navigator|null}
 */
function getNavigator() {
  if (typeof navigator === 'undefined' || !navigator) return null;
  return navigator;
}

/**
 * 探测设备是否有某个硬件键
 *
 * @param {string} name 'volume' | 'camera' | 'endcall' | 'qwerty'
 * @returns {Promise<boolean>} 探测不到 (API 不存在 / 无权限) 时返回 false
 */
export function hasDeviceKey(name) {
  const feature = KEY_FEATURES[name];
  if (!feature) return Promise.resolve(false);
  if (cache[name]) return cache[name];

  const nav = getNavigator();
  const p = new Promise((resolve) => {
    if (!nav) { resolve(false); return; }

    // KaiOS 2.5
    if (typeof nav.hasFeature === 'function') {
      try {
        nav.hasFeature(feature.kaios25).then(
          (v) => resolve(!!v),
          () => resolve(false)
        );
      } catch (e) {
        resolve(false);
      }
      return;
    }

    // KaiOS 3.0
    const dcm = typeof window !== 'undefined' ? window.DeviceCapabilityManager : null;
    if (dcm && typeof dcm.get === 'function') {
      try {
        dcm.get(feature.kaios30).then(
          (v) => resolve(!!v),
          () => resolve(false)
        );
      } catch (e) {
        resolve(false);
      }
      return;
    }

    // KaiOS 2.4 / 桌面浏览器: 没有这个 API
    resolve(false);
  });

  cache[name] = p;
  p.then((v) => { resolved[name] = v; });
  return p;
}

/**
 * 同步读取探测结果 (探测完成之后才有意义)
 *
 * 用于渲染时决定要不要显示某个提示 —— 先用同步值渲染,
 * 探测 Promise 回来后再更新。
 *
 * @param {string} name
 * @returns {boolean} 没探测过或探测不到时返回 false
 */
export function hasDeviceKeySync(name) {
  return !!resolved[name];
}

/**
 * 批量探测
 * @param {Array<string>} names
 * @returns {Promise<Object<string, boolean>>}
 */
export function detectDeviceKeys(names) {
  const list = names || [];
  return Promise.all(list.map((n) => hasDeviceKey(n).then((v) => [n, v])))
    .then((pairs) => {
      const out = {};
      for (let i = 0; i < pairs.length; i++) out[pairs[i][0]] = pairs[i][1];
      return out;
    });
}

/**
 * 预热探测 (应用启动时调一次, 之后用 hasDeviceKeySync 读)
 * @param {Array<string>} [names]
 * @returns {Promise<Object<string, boolean>>}
 */
export function initDeviceKeys(names) {
  return detectDeviceKeys(names || ['volume', 'camera', 'endcall', 'qwerty']);
}
