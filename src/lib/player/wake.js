// Wake lock wrapper for "听视频" mode
// KaiOS 2.4 has mozWakeLock; falls back gracefully if not present

let wakeLock = null;

export function acquireWakeLock() {
  if (wakeLock) return Promise.resolve(wakeLock);
  if (typeof navigator !== 'undefined' && navigator.mozWakeLock) {
    try {
      return navigator.mozWakeLock.request('screen').then(lock => {
        wakeLock = lock;
        return lock;
      }).catch(() => null);
    } catch (e) {
      return Promise.resolve(null);
    }
  }
  return Promise.resolve(null);
}

export function releaseWakeLock() {
  if (wakeLock) {
    try { wakeLock.unlock(); } catch (e) {}
    wakeLock = null;
  }
}

export function isWakeLockHeld() {
  return !!wakeLock;
}
