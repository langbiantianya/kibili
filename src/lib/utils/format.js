// Time and number formatting helpers

export function formatDuration(s) {
  if (s == null || isNaN(s)) return '';
  s = Math.floor(s);
  if (s < 60) return s + '秒';
  const m = Math.floor(s / 60);
  if (m < 60) {
    const sec = s % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }
  const h = Math.floor(m / 60);
  const min = m % 60;
  const sec = s % 60;
  return h + ':' + (min < 10 ? '0' : '') + min + ':' + (sec < 10 ? '0' : '') + sec;
}

// 12345 -> 1.2万
export function formatCount(n) {
  if (n == null) return '0';
  if (n < 10000) return String(n);
  if (n < 100000000) return (n / 10000).toFixed(1) + '万';
  return (n / 100000000).toFixed(1) + '亿';
}

export function relativeTime(ts) {
  if (!ts) return '';
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
  if (diff < 604800) return Math.floor(diff / 86400) + '天前';
  const d = new Date(ts * 1000);
  return (d.getMonth() + 1) + '-' + d.getDate();
}

// Strip HTML <em>...</em> tags and decode entities
export function stripHtml(s) {
  if (!s) return '';
  return s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}
