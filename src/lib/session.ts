import type { Drive, GpsFix, LaunchRun, ObdValues, Sample, Settings } from './types';
import { DeviceGps, SimGps, type PositionSource } from './gps';
import { Elm327, ObdPoller } from './obd/elm327';
import { BleTransport } from './obd/ble';
import { SimCar, SimTransport } from './obd/sim';
import type { Transport } from './obd/transport';
import { LaunchDetector } from './launch';
import { Ghost } from './ghost';
import { summarize } from './analysis';
import { deleteDrive, saveDrive } from './db';

export type GpsMode = 'off' | 'real' | 'sim';
export type ObdMode = 'none' | 'ble' | 'sim';
export type ObdStatus = 'off' | 'connecting' | 'on' | 'error';

export interface LiveState {
  gpsMode: GpsMode;
  gps?: GpsFix;
  gpsError?: string;
  obdMode: ObdMode;
  obdStatus: ObdStatus;
  obdName?: string;
  obdLog: string[];
  obd: ObdValues;
  speed: number;
  recording: boolean;
  elapsedMs: number;
  distanceKm: number;
  fuelL?: number;
  ghost?: { name: string; delta: number | null; finishS: number; pos: [number, number] | null };
  launches: LaunchRun[];
  lastLaunch?: LaunchRun & { shownAt: number };
}

const TICK_MS = 250;
const AUTOSAVE_MS = 60_000;

export class Session {
  private listeners = new Set<(s: LiveState) => void>();
  private gpsSrc: PositionSource | null = null;
  private simCar: SimCar | null = null;
  private transport: Transport | null = null;
  private poller: ObdPoller | null = null;
  private obdAt = 0;
  private tick: ReturnType<typeof setInterval> | null = null;
  private autosave: ReturnType<typeof setInterval> | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private samples: Sample[] = [];
  private launch = new LaunchDetector();
  private ghost: Ghost | null = null;
  private drive: Drive | null = null;

  state: LiveState = { gpsMode: 'off', obdMode: 'none', obdStatus: 'off', obdLog: [], obd: {}, speed: 0, recording: false, elapsedMs: 0, distanceKm: 0, launches: [] };

  constructor(public settings: Settings) {}

  subscribe(fn: (s: LiveState) => void) { this.listeners.add(fn); fn(this.state); return () => { this.listeners.delete(fn); }; }
  private set(patch: Partial<LiveState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((l) => l(this.state)); }
  private log(line: string) { this.set({ obdLog: [...this.state.obdLog.slice(-30), line] }); }

  private car(): SimCar { this.simCar ??= new SimCar(); this.simCar.start(); return this.simCar; }

  // ---------- GPS ----------
  setGps(mode: GpsMode) {
    this.gpsSrc?.stop();
    this.gpsSrc = null;
    this.set({ gpsMode: mode, gps: undefined, gpsError: undefined });
    if (mode === 'off') return;
    this.gpsSrc = mode === 'real' ? new DeviceGps() : new SimGps(() => this.car().kmh);
    this.gpsSrc.start(
      (f) => this.set({ gps: f, gpsError: undefined, speed: this.bestSpeed(f) }),
      (msg) => this.set({ gpsError: msg }),
    );
  }

  // ---------- OBD ----------
  async connectObd(mode: Exclude<ObdMode, 'none'>) {
    await this.disconnectObd();
    this.set({ obdMode: mode, obdStatus: 'connecting', obdLog: [] });
    try {
      this.log(mode === 'ble' ? 'Pick your Vgate adapter…' : 'Starting simulated i20…');
      const t: Transport = mode === 'ble' ? await BleTransport.connect() : new SimTransport(this.car());
      this.transport = t;
      this.log(`Linked to ${t.name}`);
      t.onDisconnect(() => { this.log('Adapter disconnected'); this.poller?.stop(); this.set({ obdStatus: 'error' }); });
      const elm = new Elm327(t);
      await elm.init((l) => this.log(l));
      if (elm.supported.size) this.log(`Car supports PIDs: ${[...elm.supported].map((p) => p.toString(16).padStart(2, '0')).join(' ')}`);
      this.poller = new ObdPoller(elm, (v) => { this.obdAt = Date.now(); this.set({ obd: v, speed: this.bestSpeed(this.state.gps) }); }, () => this.settings);
      this.poller.start();
      this.set({ obdStatus: 'on', obdName: t.name });
    } catch (e) {
      this.log(`✗ ${(e as Error).message}`);
      this.set({ obdStatus: 'error' });
      await this.transport?.close();
      this.transport = null;
    }
  }

  async disconnectObd() {
    this.poller?.stop();
    this.poller = null;
    await this.transport?.close();
    this.transport = null;
    this.set({ obdMode: 'none', obdStatus: 'off', obd: {}, obdName: undefined });
  }

  /** The car's own speed sensor beats GPS when it's fresh. */
  private bestSpeed(f?: GpsFix): number {
    if (this.state.obd.speed != null && Date.now() - this.obdAt < 2000) return this.state.obd.speed;
    return f?.speed ?? 0;
  }

  // ---------- Recording ----------
  async startDrive(ghostRef?: Drive) {
    if (this.state.recording) return;
    const now = Date.now();
    this.samples = [];
    this.launch = new LaunchDetector();
    this.ghost = ghostRef ? new Ghost(ghostRef) : null;
    this.drive = {
      id: `${now}`,
      startedAt: now,
      endedAt: now,
      source: { gps: this.state.gpsMode === 'sim' ? 'sim' : 'real', obd: this.state.obdStatus === 'on' ? this.state.obdMode : 'none' },
      samples: this.samples,
      launches: [],
      summary: summarize([], [], this.settings),
      ghostOf: ghostRef?.id,
      car: this.settings.carName || undefined,
    };
    try { this.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not fatal */ }
    this.set({ recording: true, elapsedMs: 0, distanceKm: 0, fuelL: undefined, launches: [], lastLaunch: undefined, ghost: undefined });
    this.tick = setInterval(() => this.onTick(), TICK_MS);
    this.autosave = setInterval(() => void this.persist(), AUTOSAVE_MS);
  }

  private onTick() {
    if (!this.drive) return;
    const t = Date.now() - this.drive.startedAt;
    const f = this.state.gps;
    const fresh = f && Date.now() - f.t < 3000;
    const obdFresh = Date.now() - this.obdAt < 2000;
    const v = this.bestSpeed(f);
    const s: Sample = { t, v: Math.round(v * 10) / 10 };
    if (fresh) { s.lat = f.lat; s.lon = f.lon; s.acc = Math.round(f.accuracy); }
    if (obdFresh) s.obd = { ...this.state.obd };
    const prev = this.samples[this.samples.length - 1];
    this.samples.push(s);

    let distanceKm = this.state.distanceKm;
    let fuelL = this.state.fuelL;
    if (prev) {
      const dt = (s.t - prev.t) / 1000;
      distanceKm += (((s.v + prev.v) / 2) / 3.6) * dt / 1000;
      if (s.obd?.fuelLph != null) fuelL = (fuelL ?? 0) + (s.obd.fuelLph / 3600) * dt;
    }

    const done = this.launch.feed(t, s.v);
    let ghost = this.state.ghost;
    if (this.ghost) {
      const delta = s.lat != null ? this.ghost.delta(t, s.lat, s.lon!) : null;
      ghost = { name: new Date(this.ghost.ref.startedAt).toLocaleDateString(), delta, finishS: this.ghost.finishT / 1000, pos: this.ghost.positionAt(t) };
    }
    this.set({
      elapsedMs: t,
      distanceKm,
      fuelL,
      speed: v,
      ghost,
      launches: [...this.launch.runs],
      ...(done.length ? { lastLaunch: { ...done[done.length - 1], shownAt: Date.now() } } : {}),
    });
  }

  private async persist() {
    if (!this.drive) return;
    this.drive.endedAt = Date.now();
    this.drive.launches = [...this.launch.runs];
    this.drive.summary = summarize(this.samples, this.drive.launches, this.settings);
    await saveDrive(this.drive);
  }

  /** Stops recording. Returns the saved drive, or null if it was too short to keep. */
  async stopDrive(): Promise<Drive | null> {
    if (!this.drive) return null;
    if (this.tick != null) clearInterval(this.tick);
    if (this.autosave != null) clearInterval(this.autosave);
    this.tick = this.autosave = null;
    try { await this.wakeLock?.release(); } catch { /* ignore */ }
    this.wakeLock = null;
    const d = this.drive;
    this.drive = null;
    this.ghost = null;
    this.set({ recording: false, ghost: undefined });
    if (this.samples.length < 20) {
      await deleteDrive(d.id);
      return null;
    }
    d.endedAt = Date.now();
    d.launches = [...this.launch.runs];
    d.summary = summarize(this.samples, d.launches, this.settings);
    await saveDrive(d);
    return d;
  }
}
