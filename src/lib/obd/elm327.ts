import type { Transport } from './transport';
import type { ObdValues } from '../types';
import { PIDS, PID_BY_NUM, parseMode01, decodeSupported } from './pids';
import { fuelLph } from '../fuel';
import type { Settings } from '../types';

export class Elm327 {
  private buf = '';
  private pending: { resolve: (s: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  supported = new Set<number>();
  version = '';

  constructor(public readonly transport: Transport) {
    transport.onData((chunk) => {
      this.buf += chunk;
      const end = this.buf.indexOf('>');
      if (end >= 0 && this.pending) {
        const reply = this.buf.slice(0, end);
        this.buf = this.buf.slice(end + 1);
        const p = this.pending;
        this.pending = null;
        clearTimeout(p.timer);
        p.resolve(reply.trim());
      }
    });
  }

  /** Send one command and wait for the '>' prompt. Commands are serialised. */
  cmd(command: string, timeoutMs = 2500): Promise<string> {
    const run = () => new Promise<string>((resolve, reject) => {
      this.buf = '';
      const timer = setTimeout(() => { this.pending = null; reject(new Error(`timeout: ${command}`)); }, timeoutMs);
      this.pending = { resolve, reject, timer };
      this.transport.send(command + '\r').catch((e) => { clearTimeout(timer); this.pending = null; reject(e); });
    });
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async init(log: (s: string) => void = () => {}): Promise<void> {
    this.version = (await this.cmd('ATZ', 4000)).split(/[\r\n]+/).find((l) => /ELM|v\d/i.test(l)) ?? 'ELM327';
    log(`Adapter: ${this.version}`);
    for (const c of ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATAT1', 'ATSP0']) await this.cmd(c);
    log('Searching for car protocol…');
    // First request triggers protocol auto-detect, which can take a few seconds.
    const first = await this.cmd('0100', 10000);
    if (/UNABLE|NO DATA|ERROR/i.test(first)) throw new Error('Car not responding. Is the ignition on?');
    const proto = await this.cmd('ATDPN').catch(() => '');
    log(`Connected. Protocol ${proto || '?'}`);
    await this.scanSupported(first);
  }

  private async scanSupported(first0100?: string) {
    this.supported.clear();
    for (const base of [0x00, 0x20, 0x40, 0x60]) {
      const pid = base;
      const raw = base === 0 && first0100 ? first0100 : await this.cmd('01' + pid.toString(16).padStart(2, '0').toUpperCase()).catch(() => '');
      const bytes = parseMode01(raw, pid);
      if (!bytes) break;
      const list = decodeSupported(base, bytes);
      list.forEach((p) => this.supported.add(p));
      if (!list.includes(base + 0x20)) break;
    }
  }

  async readPid(pid: number): Promise<number | null> {
    const def = PID_BY_NUM.get(pid);
    if (!def) return null;
    const raw = await this.cmd('01' + pid.toString(16).padStart(2, '0').toUpperCase());
    const bytes = parseMode01(raw, pid);
    return bytes && bytes.length >= def.bytes ? def.decode(bytes) : null;
  }

  async readVoltage(): Promise<number | null> {
    const m = (await this.cmd('ATRV')).match(/(\d+(\.\d+)?)\s*V/i);
    return m ? parseFloat(m[1]) : null;
  }
}

/** Polls the car continuously and reports merged values. */
export class ObdPoller {
  private running = false;
  values: ObdValues = {};

  constructor(private elm: Elm327, private onValues: (v: ObdValues) => void, private settings: () => Pick<Settings, 've' | 'engineL'>) {}

  start() {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop() { this.running = false; }

  private async loop() {
    const has = (p: number) => this.elm.supported.size === 0 || this.elm.supported.has(p);
    const fast = [0x0d, 0x0c, 0x11, 0x0b, 0x04].filter(has);
    const slow = [0x05, 0x0f, 0x0e].filter(has);
    let n = 0;
    while (this.running) {
      const batch = n % 10 === 0 ? [...fast, ...slow] : fast;
      for (const pid of batch) {
        if (!this.running) return;
        try {
          const v = await this.elm.readPid(pid);
          const def = PIDS.find((d) => d.pid === pid)!;
          if (v != null) (this.values as Record<string, number>)[def.key] = v;
        } catch { /* a dropped reply is fine; next loop retries */ }
      }
      if (n % 10 === 0) {
        try { const v = await this.elm.readVoltage(); if (v != null) this.values.voltage = v; } catch { /* ignore */ }
      }
      const { rpm, map, iat, throttle, speed } = this.values;
      if (rpm != null && map != null) { const s = this.settings(); this.values.fuelLph = fuelLph(rpm, map, iat ?? 35, s.ve, throttle, speed, s.engineL); }
      this.onValues({ ...this.values });
      n++;
    }
  }
}
