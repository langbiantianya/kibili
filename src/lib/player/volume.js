// Volume helpers
export function clampVol(v) {
  return Math.max(0, Math.min(1, v));
}

export function bumpVol(v, delta) {
  return clampVol(v + delta);
}
