export const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
};
export const fmtNum = (n: number | undefined | null, digits = 0, dash = '—') =>
  n == null || !Number.isFinite(n) ? dash : n.toFixed(digits);
export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const fmtRs = (n: number | undefined) => (n == null ? '—' : `₹${n < 100 ? n.toFixed(1) : Math.round(n)}`);

/** Sequential blue ramp (dark → light = slow → fast) for speed on a dark map. */
const RAMP = ['#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#cde2fb'];
export const speedColor = (v: number, max: number) => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.floor((v / Math.max(1, max)) * RAMP.length)))];
export const RAMP_CSS = `linear-gradient(90deg, ${RAMP.join(',')})`;
