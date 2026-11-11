import { useMemo, useState } from 'react';
import type { Drive } from '../lib/types';
import { RouteMap } from './RouteMap';
import { LineChart } from './LineChart';
import { fmtDate, fmtDuration, fmtNum, fmtRs, fmtTime } from '../lib/fmt';
import { shareRecap } from '../lib/recap';
import { deleteDrive, saveDrive } from '../lib/db';

export function DriveDetail({ drive, onBack, onChanged, onRace }: { drive: Drive; onBack: () => void; onChanged: () => void; onRace: (id: string) => void }) {
  const s = drive.summary;
  const [name, setName] = useState(drive.name ?? '');
  const [busy, setBusy] = useState(false);
  const speed = useMemo(() => drive.samples.map((p) => ({ x: p.t / 1000, y: p.v })), [drive]);
  const rpm = useMemo(() => drive.samples.filter((p) => p.obd?.rpm != null).map((p) => ({ x: p.t / 1000, y: p.obd!.rpm! })), [drive]);
  const perMinute = useMemo(() => {
    const acc = new Map<number, { n: number; sum: number; max: number; rn: number; rsum: number }>();
    for (const p of drive.samples) {
      const m = Math.floor(p.t / 60000);
      const r = acc.get(m) ?? { n: 0, sum: 0, max: 0, rn: 0, rsum: 0 };
      r.n++; r.sum += p.v; r.max = Math.max(r.max, p.v);
      if (p.obd?.rpm != null) { r.rn++; r.rsum += p.obd.rpm; }
      acc.set(m, r);
    }
    return [...acc].map(([m, r]) => ({ m, avg: r.sum / r.n, max: r.max, rpm: r.rn ? r.rsum / r.rn : undefined }));
  }, [drive]);

  const saveName = async () => { if ((drive.name ?? '') === name) return; drive.name = name || undefined; await saveDrive(drive); onChanged(); };
  const share = async () => { setBusy(true); try { await shareRecap({ ...drive, name: name || undefined }); } finally { setBusy(false); } };
  const remove = async () => { if (confirm('Delete this drive?')) { await deleteDrive(drive.id); onChanged(); onBack(); } };
  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(drive)], { type: 'application/json' }));
    a.download = `rave-drive-${drive.id}.json`; a.click();
  };
  const sim = drive.source.gps === 'sim' || drive.source.obd === 'sim';

  return (
    <div className="page">
      <button className="btn" onClick={onBack}>← Drives</button>
      <h1 style={{ marginTop: 14 }}>{fmtDate(drive.startedAt)}, {fmtTime(drive.startedAt)}{sim && <span className="muted"> · simulated</span>}</h1>
      {drive.car && <p className="muted" style={{ marginTop: -8 }}>{drive.car}</p>}
      <input type="text" placeholder="Name this drive (e.g. Home → Office)" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} style={{ marginBottom: 14 }} />

      <RouteMap samples={drive.samples} maxKmh={s.maxKmh} />

      <h2>Summary</h2>
      <div className="stats">
        <Stat v={s.distanceKm.toFixed(1)} l="km" />
        <Stat v={fmtDuration(s.durationS)} l="time" />
        <Stat v={fmtNum(s.avgKmh)} l="avg km/h (moving)" />
        <Stat v={fmtNum(s.maxKmh)} l="top km/h" />
        <Stat v={fmtNum(s.kmpl, 1)} l="km/l" />
        <Stat v={s.fuelL != null ? s.fuelL.toFixed(2) : '—'} l={s.fuelEstimated ? 'fuel used (L, est.)' : 'fuel used (L)'} />
        <Stat v={fmtRs(s.fuelCost)} l={s.fuelEstimated ? 'fuel cost (est.)' : 'fuel cost'} />
        <Stat v={String(s.smoothness)} l="smoothness /100" />
        <Stat v={s.best060 ? s.best060.toFixed(1) + 's' : '—'} l="best 0–60" />
        <Stat v={s.best0100 ? s.best0100.toFixed(1) + 's' : '—'} l="best 0–100" />
        <Stat v={`${s.harshAccel} / ${s.harshBrake}`} l="harsh accel / brake" />
        <Stat v={fmtNum(s.maxCoolant)} l="max coolant °C" />
      </div>
      {s.fuelEstimated && <p className="muted">Fuel is estimated from your average mileage in Settings. Connect an OBD adapter to measure it, and to get km/l, RPM and engine temps.</p>}

      {drive.launches.length > 0 && (
        <>
          <h2>Launches</h2>
          <div className="card">
            {drive.launches.map((l, i) => (
              <div key={i} className="row between"><span>0–{l.target} km/h at {fmtDuration(l.atT / 1000)}</span><b className="num">{l.seconds.toFixed(2)} s</b></div>
            ))}
          </div>
        </>
      )}

      <div className="chart-title">Speed (km/h)</div>
      <LineChart data={speed} unit="km/h" />
      {rpm.length > 10 && (<><div className="chart-title">Engine RPM</div><LineChart data={rpm} unit="rpm" /></>)}
      <details>
        <summary>Per-minute table</summary>
        <table className="tbl">
          <thead><tr><th>min</th><th>avg km/h</th><th>max km/h</th><th>avg rpm</th></tr></thead>
          <tbody>{perMinute.map((r) => <tr key={r.m}><td>{r.m}</td><td>{r.avg.toFixed(0)}</td><td>{r.max.toFixed(0)}</td><td>{fmtNum(r.rpm)}</td></tr>)}</tbody>
        </table>
      </details>

      <div className="seg" style={{ marginTop: 24 }}>
        <button className="btn primary" onClick={share} disabled={busy}>{busy ? 'Rendering…' : 'Share recap card'}</button>
        <button className="btn" onClick={() => onRace(drive.id)}>Race this ghost</button>
        <button className="btn" onClick={exportJson}>Export JSON</button>
        <button className="btn danger" onClick={remove}>Delete</button>
      </div>
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return <div className="stat"><b>{v}</b><span>{l}</span></div>;
}
