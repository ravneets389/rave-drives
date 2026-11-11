import { useEffect, useState } from 'react';
import { CAR_PRESETS, type Drive, type Settings } from '../lib/types';
import { saveDrive, saveSettings } from '../lib/db';

export function SettingsPage({ settings, onChange, drives, onImported }: { settings: Settings; onChange: (s: Settings) => void; drives: Drive[]; onImported: () => void }) {
  const [usage, setUsage] = useState<string>('');
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1e6).toFixed(1)} MB used`)).catch(() => {});
  }, [drives.length]);
  const update = (patch: Partial<Settings>) => { const s = { ...settings, ...patch }; onChange(s); void saveSettings(s); };

  const exportAll = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(drives)], { type: 'application/json' }));
    a.download = `rave-drives-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  const importAll = async (f: File) => {
    const data = JSON.parse(await f.text());
    const list: Drive[] = Array.isArray(data) ? data : [data];
    for (const d of list) if (d?.id && Array.isArray(d.samples)) await saveDrive(d);
    onImported();
    alert(`Imported ${list.length} drive(s)`);
  };

  return (
    <div className="page">
      <h1>Settings</h1>
      <h2 style={{ marginTop: 0 }}>My car</h2>
      <div className="card">
        <div className="seg" style={{ marginBottom: 14 }}>
          {CAR_PRESETS.map((p) => (
            <button key={p.carName} className={'btn' + (settings.carName === p.carName ? ' on' : '')} onClick={() => update(p)}>{p.carName}</button>
          ))}
        </div>
        <label className="field"><span>Car name (shown on recap cards)</span>
          <input type="text" placeholder="e.g. Maruti Swift · 1.2 AMT" value={settings.carName} onChange={(e) => update({ carName: e.target.value })} />
        </label>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <label className="field" style={{ flex: 1 }}><span>Engine size (litres)</span>
            <input type="number" inputMode="decimal" step="0.1" value={settings.engineL} onChange={(e) => update({ engineL: parseFloat(e.target.value) || 0 })} />
          </label>
          <label className="field" style={{ flex: 1 }}><span>Your average mileage (km/l)</span>
            <input type="number" inputMode="decimal" step="0.5" value={settings.avgKmpl} onChange={(e) => update({ avgKmpl: parseFloat(e.target.value) || 0 })} />
          </label>
        </div>
        <p className="muted" style={{ margin: 0 }}>Without an OBD adapter, fuel and cost are estimated from your average mileage. With one connected, they're measured from the engine instead, using the engine size.</p>
      </div>

      <h2>Fuel</h2>
      <div className="card">
        <label className="field"><span>Petrol price (₹ per litre)</span>
          <input type="number" inputMode="decimal" value={settings.fuelPrice} onChange={(e) => update({ fuelPrice: parseFloat(e.target.value) || 0 })} />
        </label>
        <label className="field"><span>OBD fuel calibration (volumetric efficiency): {settings.ve.toFixed(2)}</span>
          <input type="range" min={0.6} max={1.0} step={0.01} value={settings.ve} onChange={(e) => update({ ve: parseFloat(e.target.value) })} />
        </label>
        <p className="muted">OBD only. After a full-tank-to-full-tank fill, compare the app's litres with the pump's. If the app reads low, raise this; if it reads high, lower it. Applies to new drives.</p>
      </div>

      <h2>Data</h2>
      <div className="card">
        <p className="dim" style={{ marginTop: 0 }}>{drives.length} drives stored on this phone. {usage}</p>
        <div className="seg">
          <button className="btn" onClick={exportAll} disabled={!drives.length}>Export all (JSON)</button>
          <label className="btn">Import JSON<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importAll(e.target.files[0])} /></label>
        </div>
        <p className="muted">Everything stays on this phone. Nothing is uploaded anywhere.</p>
      </div>
    </div>
  );
}
