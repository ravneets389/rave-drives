import { useEffect, useMemo, useRef, useState } from 'react';

interface Pt { x: number; y: number }

/**
 * Single-series time chart with a crosshair tooltip. One series per chart,
 * so speed and RPM get separate charts rather than sharing a dual axis.
 */
export function LineChart({ data, unit, height = 140, digits = 0 }: { data: Pt[]; unit: string; height?: number; digits?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  // Downsample to ~1 point per 2px, keeping each bucket's max so peaks survive.
  const pts = useMemo(() => {
    const n = Math.max(50, Math.floor(w / 2));
    if (data.length <= n) return data;
    const out: Pt[] = [];
    const step = data.length / n;
    for (let i = 0; i < n; i++) {
      const slice = data.slice(Math.floor(i * step), Math.floor((i + 1) * step));
      if (!slice.length) continue;
      out.push(slice.reduce((a, b) => (b.y > a.y ? b : a)));
    }
    return out;
  }, [data, w]);

  if (pts.length < 2) return null;
  const padL = 40, padR = 8, padT = 10, padB = 22;
  const xMax = pts[pts.length - 1].x || 1;
  const yMaxRaw = Math.max(...pts.map((p) => p.y), 1);
  const yStep = niceStep(yMaxRaw / 3);
  const yMax = Math.ceil(yMaxRaw / yStep) * yStep;
  const sx = (x: number) => padL + (x / xMax) * (w - padL - padR);
  const sy = (y: number) => padT + (1 - y / yMax) * (height - padT - padB);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const yTicks = Array.from({ length: Math.round(yMax / yStep) + 1 }, (_, i) => i * yStep);
  const xStep = [15, 30, 60, 120, 300, 600, 900, 1800, 3600].find((s) => xMax / s <= 6) ?? 7200;
  const xTicks: number[] = [];
  for (let t = 0; t <= xMax; t += xStep) xTicks.push(t);
  const xLabel = (t: number) => (t % 60 === 0 ? `${t / 60}m` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);

  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = ((e.clientX - r.left - padL) / (w - padL - padR)) * xMax;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - x) < Math.abs(pts[best].x - x)) best = i;
    setHover(best);
  };
  const hp = hover != null ? pts[hover] : null;

  return (
    <div className="chart" ref={ref}>
      <svg height={height} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${unit} over time`}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={padL - 6} y={sy(t) + 4} fill="var(--muted)" fontSize={11} textAnchor="end">{t}</text>
          </g>
        ))}
        {xTicks.map((t) => <text key={t} x={sx(t)} y={height - 6} fill="var(--muted)" fontSize={11} textAnchor="middle">{xLabel(t)}</text>)}
        <path d={d} fill="none" stroke="var(--series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hp && (
          <>
            <line x1={sx(hp.x)} x2={sx(hp.x)} y1={padT} y2={height - padB} stroke="var(--text-2)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={sx(hp.x)} cy={sy(hp.y)} r={5} fill="var(--series)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hp && (
        <div className="tip" style={{ left: Math.min(w - 60, Math.max(60, sx(hp.x))) }}>
          <b className="num">{hp.y.toFixed(digits)} {unit}</b> <span className="dim">at {Math.floor(hp.x / 60)}:{String(Math.floor(hp.x % 60)).padStart(2, '0')}</span>
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
