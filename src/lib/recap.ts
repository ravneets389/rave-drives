import type { Drive } from './types';
import { fmtDate, fmtDuration, fmtNum, fmtRs, fmtTime, speedColor } from './fmt';

/** Renders a 1080×1920 story-sized recap image of a drive. */
export async function renderRecap(d: Drive): Promise<Blob> {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b0d10'); bg.addColorStop(1, '#151a22');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);

  const font = (px: number, w = 600, mono = false) => `${w} ${px}px ${mono ? 'ui-monospace, Menlo, monospace' : 'system-ui, -apple-system, Roboto, sans-serif'}`;
  g.fillStyle = '#ff5a1f'; g.font = font(34, 800); g.fillText('DRIVE RECAP', 80, 130);
  g.fillStyle = '#a9b0bb'; g.font = font(40, 500); g.fillText(`${fmtDate(d.startedAt)} · ${fmtTime(d.startedAt)}`, 80, 190);
  if (d.name) { g.fillStyle = '#f2f4f7'; g.font = font(56, 700); g.fillText(d.name, 80, 270); }

  // Route
  const pts = d.samples.filter((s) => s.lat != null && (s.acc ?? 0) < 60);
  const box = { x: 80, y: 320, w: W - 160, h: 760 };
  g.fillStyle = '#14171c'; roundRect(g, box.x, box.y, box.w, box.h, 40); g.fill();
  if (pts.length > 1) {
    const lats = pts.map((p) => p.lat!), lons = pts.map((p) => p.lon!);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    const spanX = (maxLon - minLon) * kx || 1e-6, spanY = maxLat - minLat || 1e-6;
    const pad = 70;
    const scale = Math.min((box.w - pad * 2) / spanX, (box.h - pad * 2) / spanY);
    const ox = box.x + (box.w - spanX * scale) / 2, oy = box.y + (box.h - spanY * scale) / 2;
    const P = (p: typeof pts[0]) => [ox + (p.lon! - minLon) * kx * scale, oy + (maxLat - p.lat!) * scale] as const;
    g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 12;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = P(pts[i - 1]); const [x1, y1] = P(pts[i]);
      g.strokeStyle = speedColor(pts[i].v, d.summary.maxKmh);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    const dot = (p: typeof pts[0], fill: string) => { const [x, y] = P(p); g.fillStyle = fill; g.strokeStyle = '#0b0d10'; g.lineWidth = 6; g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.fill(); g.stroke(); };
    dot(pts[0], '#f2f4f7'); dot(pts[pts.length - 1], '#ff5a1f');
  }

  // Stats
  const s = d.summary;
  const tiles: [string, string][] = [
    [s.distanceKm.toFixed(1), 'KM'],
    [fmtDuration(s.durationS), 'TIME'],
    [fmtNum(s.avgKmh), 'AVG KM/H'],
    [fmtNum(s.maxKmh), 'TOP KM/H'],
    s.kmpl ? [s.kmpl.toFixed(1), 'KM/L'] : [s.best0100 ? `${s.best0100.toFixed(1)}s` : '—', '0–100'],
    [fmtRs(s.fuelCost), s.fuelEstimated ? 'FUEL (EST.)' : 'FUEL'],
    [String(s.smoothness), 'SMOOTHNESS'],
    [s.best060 ? `${s.best060.toFixed(1)}s` : '—', '0–60'],
  ];
  const cols = 2, tw = (W - 160 - 30) / cols, th = 140;
  tiles.forEach(([v, l], i) => {
    const x = 80 + (i % cols) * (tw + 30), y = 1130 + Math.floor(i / cols) * (th + 20);
    g.fillStyle = '#14171c'; roundRect(g, x, y, tw, th, 28); g.fill();
    g.fillStyle = '#f2f4f7'; g.font = font(64, 700, true); g.fillText(v, x + 36, y + 78);
    g.fillStyle = '#6b7380'; g.font = font(26, 600); g.fillText(l, x + 36, y + 118);
  });
  g.fillStyle = '#6b7380'; g.font = font(28, 500); if (d.car) g.fillText(d.car, 80, H - 60);

  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export async function shareRecap(d: Drive) {
  const blob = await renderRecap(d);
  const file = new File([blob], `i20-drive-${new Date(d.startedAt).toISOString().slice(0, 10)}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
