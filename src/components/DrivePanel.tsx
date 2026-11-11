import { useEffect, useState } from 'react';
import type { LiveState, Session } from '../lib/session';
import type { Drive, Settings } from '../lib/types';
import { BleTransport } from '../lib/obd/ble';
import { ghostCandidates } from '../lib/ghost';
import { fmtDate, fmtDuration, fmtNum, fmtTime } from '../lib/fmt';

export function DrivePanel({ s, session, drives, ghostId, setGhostId, onStart, settings, onSetup }: {
  s: LiveState; session: Session; settings: Settings; onSetup: () => void; drives: Drive[]; ghostId: string | null; setGhostId: (id: string | null) => void; onStart: () => void;
}) {
  const bleOk = BleTransport.supported();
  const [showAll, setShowAll] = useState(false);
  const gpsDot = s.gpsError ? 'err' : s.gps ? 'ok' : s.gpsMode === 'off' ? '' : 'wait';
  const obdDot = { off: '', connecting: 'wait', on: 'ok', error: 'err' }[s.obdStatus];

  useEffect(() => { if (s.gpsMode === 'off') session.setGps('real'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const near = s.gps ? ghostCandidates(drives, s.gps.lat, s.gps.lon) : [];
  const ghosts = showAll ? drives.filter((d) => d.summary.distanceKm > 0.3) : near;
  const chosen = drives.find((d) => d.id === ghostId);

  return (
    <div className="page">
      <h1>Drive</h1>
      {!settings.carName && (
        <button className="list-item sel" onClick={onSetup}>
          <span className="t">Set up your car →</span>
          <div className="muted">Pick your car and its average mileage so fuel cost and recap cards are right. Takes 20 seconds.</div>
        </button>
      )}

      <div className="card">
        <div className="row between">
          <div className="row"><span className={'dot ' + gpsDot} /><b>Position</b></div>
          <span className="muted">
            {s.gpsError ? s.gpsError : s.gps ? `±${Math.round(s.gps.accuracy)} m` : s.gpsMode === 'off' ? 'off' : 'waiting for fix…'}
          </span>
        </div>
        <div className="seg" style={{ marginTop: 10 }}>
          <button className={'btn' + (s.gpsMode === 'real' ? ' on' : '')} onClick={() => session.setGps('real')}>Phone GPS</button>
          <button className={'btn' + (s.gpsMode === 'sim' ? ' on' : '')} onClick={() => session.setGps('sim')}>Simulated route</button>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <div className="row"><span className={'dot ' + obdDot} /><b>Car (OBD)</b></div>
          <span className="muted">{s.obdStatus === 'on' ? s.obdName : s.obdStatus === 'connecting' ? 'connecting…' : s.obdStatus === 'error' ? 'failed' : 'not connected'}</span>
        </div>
        <div className="seg" style={{ marginTop: 10 }}>
          <button className={'btn' + (s.obdMode === 'ble' && s.obdStatus === 'on' ? ' on' : '')} disabled={!bleOk || s.obdStatus === 'connecting'} onClick={() => session.connectObd('ble')}>Connect Vgate</button>
          <button className={'btn' + (s.obdMode === 'sim' && s.obdStatus === 'on' ? ' on' : '')} disabled={s.obdStatus === 'connecting'} onClick={() => session.connectObd('sim')}>Simulated car</button>
          {s.obdStatus !== 'off' && <button className="btn" onClick={() => session.disconnectObd()}>Disconnect</button>}
        </div>
        {s.obdStatus === 'off' && <p className="muted">No adapter? No problem. Just hit Start: speed, route, 0–60, ghosts and recap cards all work from GPS, and fuel cost is estimated from your mileage.</p>}
        {!bleOk && <p className="muted">Connecting an OBD adapter needs Chrome on Android.</p>}
        {s.obdLog.length > 0 && <div className="log">{s.obdLog.join('\n')}</div>}
        {(s.obdStatus === 'on' || s.gps) && (
          <div className="mini">
            <div><b>{Math.round(s.speed)}</b><span>km/h</span></div>
            <div><b>{fmtNum(s.obd.rpm)}</b><span>rpm</span></div>
            <div><b>{fmtNum(s.obd.coolant)}</b><span>coolant °C</span></div>
          </div>
        )}
      </div>

      <h2>Race a ghost</h2>
      {ghosts.length === 0 ? (
        <p className="muted">{drives.length ? 'No previous drives start near here. Drive the same route twice to race your ghost.' : 'Record a drive first. Next time you take the same route, you can race it.'}</p>
      ) : (
        <>
          <button className={'list-item' + (ghostId == null ? ' sel' : '')} onClick={() => setGhostId(null)}><span className="t">No ghost</span></button>
          {ghosts.slice(0, 6).map((d) => (
            <button key={d.id} className={'list-item' + (ghostId === d.id ? ' sel' : '')} onClick={() => setGhostId(d.id)}>
              <span className="t">{d.name || `${fmtDate(d.startedAt)}, ${fmtTime(d.startedAt)}`}</span>
              <div className="muted">{d.summary.distanceKm.toFixed(1)} km · {fmtDuration(d.summary.durationS)}</div>
            </button>
          ))}
        </>
      )}
      {drives.length > 0 && <button className="btn" onClick={() => setShowAll(!showAll)}>{showAll ? 'Only drives starting near here' : 'Show all drives'}</button>}

      <button className="btn primary big" disabled={!s.gps && s.obdStatus !== 'on'} onClick={onStart}>
        START DRIVE{chosen ? ' · vs ghost' : ''}
      </button>
      {!s.gps && s.obdStatus !== 'on' && <p className="muted" style={{ textAlign: 'center' }}>Waiting for GPS or car connection.</p>}
    </div>
  );
}
