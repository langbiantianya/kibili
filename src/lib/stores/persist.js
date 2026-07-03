// localStorage try/catch wrapper (KaiOS 2.4 has ~5MB quota)
export const persist = {
  load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // quota exceeded or storage disabled - silently fail
    }
  },
  del(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
};
