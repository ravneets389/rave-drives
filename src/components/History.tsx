import type { Drive } from '../lib/types';
import { fmtDate, fmtDuration, fmtNum, fmtRs, fmtTime } from '../lib/fmt';

export function History({ drives, onOpen }: { drives: Drive[]; onOpen: (id: string) => void }) {
  const now = new Date();
  const month = drives.filter((d) => { const t = new Date(d.startedAt); return t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear(); });
  const km = month.reduce((a, d) => a + d.summary.distanceKm, 0);
  const cost = month.reduce((a, d) => a + (d.summary.fuelCost ?? 0), 0);
  const best = drives.map((d) => d.summary.best060).filter((x): x is number => x != null);

  return (
    <div className="page">
      <h1>Drives</h1>
      <div className="stats">
        <div className="stat"><b>{month.length}</b><span>drives this month</span></div>
        <div className="stat"><b>{km.toFixed(0)}</b><span>km this month</span></div>
        <div className="stat"><b>{cost ? fmtRs(cost) : '—'}</b><span>fuel this month</span></div>
        <div className="stat"><b>{best.length ? Math.min(...best).toFixed(1) + 's' : '—'}</b><span>best 0–60 ever</span></div>
      </div>
      <h2>All drives</h2>
      {drives.length === 0 && <p className="muted">No drives yet. Head to the Drive tab and hit Start. Try the simulated route and simulated i20 to see how it works.</p>}
      {drives.map((d) => (
        <button key={d.id} className="list-item" onClick={() => onOpen(d.id)}>
          <div className="row between">
            <span className="t">{d.name || `${fmtDate(d.startedAt)}, ${fmtTime(d.startedAt)}`}</span>
            <span className="num dim">{d.summary.distanceKm.toFixed(1)} km</span>
          </div>
          <div className="muted">
            {d.name && `${fmtDate(d.startedAt)} · `}{fmtDuration(d.summary.durationS)} · avg {fmtNum(d.summary.avgKmh)} km/h · smooth {d.summary.smoothness}
            {d.summary.fuelCost != null && ` · ${fmtRs(d.summary.fuelCost)}`}
            {(d.source.gps === 'sim' || d.source.obd === 'sim') && ' · sim'}
          </div>
        </button>
      ))}
    </div>
  );
}
