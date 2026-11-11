import { useCallback, useEffect, useMemo, useState } from 'react';
import { Session, type LiveState } from './lib/session';
import type { Drive, Settings } from './lib/types';
import { listDrives, loadSettings, persistStorage } from './lib/db';
import { Dashboard } from './components/Dashboard';
import { DrivePanel } from './components/DrivePanel';
import { History } from './components/History';
import { DriveDetail } from './components/DriveDetail';
import { SettingsPage } from './components/SettingsPage';

type Tab = 'drive' | 'history' | 'settings';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => { loadSettings().then(setSettings); void persistStorage(); }, []);
  if (!settings) return null;
  return <Main initial={settings} />;
}

function Main({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const session = useMemo(() => new Session(initial), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [live, setLive] = useState<LiveState>(session.state);
  const [tab, setTab] = useState<Tab>('drive');
  const [drives, setDrives] = useState<Drive[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [ghostId, setGhostId] = useState<string | null>(null);

  useEffect(() => session.subscribe(setLive), [session]);
  useEffect(() => { session.settings = settings; }, [session, settings]);
  const refresh = useCallback(() => listDrives().then(setDrives), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const start = () => session.startDrive(drives.find((d) => d.id === ghostId));
  const stop = async () => {
    const d = await session.stopDrive();
    setGhostId(null);
    await refresh();
    if (d) { setOpenId(d.id); setTab('history'); }
  };

  if (live.recording) return <Dashboard s={live} onStop={stop} settings={settings} />;

  const open = drives.find((d) => d.id === openId);
  return (
    <div className="app">
      {tab === 'drive' && <DrivePanel s={live} session={session} drives={drives} ghostId={ghostId} setGhostId={setGhostId} onStart={start} settings={settings} onSetup={() => setTab('settings')} />}
      {tab === 'history' && (open
        ? <DriveDetail key={open.id} drive={open} onBack={() => setOpenId(null)} onChanged={refresh} onRace={(id) => { setGhostId(id); setOpenId(null); setTab('drive'); }} />
        : <History drives={drives} onOpen={setOpenId} />)}
      {tab === 'settings' && <SettingsPage settings={settings} onChange={setSettings} drives={drives} onImported={refresh} />}
      <nav className="tabs">
        {([['drive', '◉', 'Drive'], ['history', '☰', 'Drives'], ['settings', '⚙', 'Settings']] as const).map(([k, ico, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); if (k !== 'history') setOpenId(null); }}>
            <span className="ico">{ico}</span>{label}
          </button>
        ))}
      </nav>
    </div>
  );
}
