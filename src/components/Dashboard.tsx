import { useEffect, useRef, useState } from 'react';
import type { LiveState } from '../lib/session';
import type { Settings } from '../lib/types';
import { fmtDuration, fmtNum, fmtRs } from '../lib/fmt';

const REDLINE = 6000;

/** Full-screen, glanceable driving view. Nothing here needs a tap except Stop. */
export function Dashboard({ s, onStop, settings }: { s: LiveState; onStop: () => void; settings: Settings }) {
  const o = s.obd;
  const hasObd = s.obdStatus === 'on';
  const liveKmpl = o.fuelLph != null && s.speed > 3 ? (o.fuelLph < 0.05 ? Infinity : s.speed / o.fuelLph) : undefined;
  const tripKmpl = s.fuelL && s.fuelL > 0.01 ? s.distanceKm / s.fuelL : undefined;
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const toast = s.lastLaunch && Date.now() - s.lastLaunch.shownAt < 6000 ? s.lastLaunch : undefined;
  const g = s.ghost;

  return (
    <div className="dash">
      <div className="dash-top">
        <span><b className="num">{fmtDuration(s.elapsedMs / 1000)}</b></span>
        <span><b className="num">{s.distanceKm.toFixed(2)}</b> km</span>
      </div>

      <div className="dash-speed">
        <div className="v">{Math.round(s.speed)}</div>
        <div className="u">KM/H{!hasObd && ' · GPS'}</div>
        {hasObd && (
          <div className="rpm">
            <div className="bar"><div className={'fill' + ((o.rpm ?? 0) > 4500 ? ' hot' : '')} style={{ width: `${Math.min(100, ((o.rpm ?? 0) / REDLINE) * 100)}%` }} /></div>
            <div className="lbl"><span>RPM</span><b>{fmtNum(o.rpm)}</b></div>
          </div>
        )}
      </div>

      <div className="side">
        {g && (
          <div className={'ghost ' + (g.delta == null ? '' : g.delta > 0 ? 'behind' : 'ahead')}>
            {g.delta == null ? 'off route' : `${g.delta > 0 ? '+' : '−'}${Math.abs(g.delta).toFixed(1)}s`}
            <small>{g.delta == null ? `GHOST · ${g.name}` : g.delta > 0 ? `BEHIND GHOST · ${g.name}` : `AHEAD OF GHOST · ${g.name}`}</small>
          </div>
        )}
        <div className="cells">
          {hasObd ? (
            <>
              <div className="cell"><b>{fmtNum(o.throttle)}<small>%</small></b><span>Throttle</span></div>
              <div className="cell"><b>{liveKmpl === Infinity ? '∞' : fmtNum(liveKmpl, 0)}</b><span>km/l now</span></div>
              <div className="cell"><b>{fmtNum(tripKmpl, 1)}</b><span>km/l trip</span></div>
              <div className="cell"><b>{fmtNum(o.coolant)}°</b><span>Coolant</span></div>
              <div className="cell"><b>{fmtNum(o.load)}<small>%</small></b><span>Load</span></div>
              <div className="cell"><b>{fmtNum(o.voltage, 1)}</b><span>Volts</span></div>
            </>
          ) : (
            <>
              <div className="cell"><b>{fmtNum(s.distanceKm && s.elapsedMs ? s.distanceKm / (s.elapsedMs / 3.6e6) : 0)}</b><span>Avg km/h</span></div>
              <div className="cell"><b>{fmtNum(best(s, 60), 1)}</b><span>Best 0–60</span></div>
              <div className="cell"><b>{settings.avgKmpl > 0 ? fmtRs((s.distanceKm / settings.avgKmpl) * settings.fuelPrice) : '—'}</b><span>Fuel (est.)</span></div>
            </>
          )}
        </div>
        <HoldToStop onStop={onStop} />
      </div>

      {toast && <div className="toast">0–{toast.target} · {toast.seconds.toFixed(1)}s</div>}
    </div>
  );
}

function best(s: LiveState, target: 60 | 100) {
  const r = s.launches.filter((l) => l.target === target).map((l) => l.seconds);
  return r.length ? Math.min(...r) : undefined;
}

/** Hold for ~1 s to stop, so a bump in the road can't end the drive. */
function HoldToStop({ onStop }: { onStop: () => void }) {
  const [active, setActive] = useState(false);
  const timer = useRef<number | null>(null);
  const begin = () => { setActive(true); timer.current = window.setTimeout(() => { setActive(false); onStop(); }, 900); };
  const cancel = () => { setActive(false); if (timer.current) clearTimeout(timer.current); };
  return (
    <button className={'hold' + (active ? ' active' : '')} onPointerDown={begin} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()}>
      <i /><span>HOLD TO END DRIVE</span>
    </button>
  );
}
