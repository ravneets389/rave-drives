import type { Transport } from './transport';
import { PID_BY_NUM, encodeSupported } from './pids';

/**
 * A pretend 2024 i20 1.2 IVT. It drives itself through stop-go-cruise-launch
 * cycles and answers ELM327 commands the way a real adapter does, so the whole
 * OBD stack (protocol, parsing, polling) is exercised without the car.
 */
type Phase = 'idle' | 'launch' | 'accel' | 'cruise' | 'brake';

export class SimCar {
  speed = 0;          // m/s
  rpm = 750;
  throttle = 0;       // %
  coolant = 38;
  iat = 36;
  private phase: Phase = 'idle';
  private phaseLeft = 3;
  private target = 0; // km/h
  private decel = 2;
  private cycle = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  get kmh() { return this.speed * 3.6; }

  start() {
    if (this.timer != null) return;
    let last = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now();
      this.step(Math.min(0.5, (now - last) / 1000));
      last = now;
    }, 100);
  }

  stop() { if (this.timer != null) clearInterval(this.timer); this.timer = null; }

  private nextPhase() {
    const r = Math.random();
    switch (this.phase) {
      case 'idle':
        this.cycle++;
        // Every third pull-away is a full-throttle launch, to exercise the 0–100 timer.
        if (this.cycle % 3 === 0) { this.phase = 'launch'; this.target = 105; this.phaseLeft = 25; }
        else { this.phase = 'accel'; this.target = 30 + Math.round(r * 45); this.phaseLeft = 20; }
        break;
      case 'launch':
      case 'accel':
        this.phase = 'cruise'; this.phaseLeft = 8 + r * 20; break;
      case 'cruise':
        this.phase = 'brake'; this.decel = 1.2 + Math.random() * 2.6;
        this.target = r < 0.45 ? 0 : Math.max(15, this.kmh - 25); this.phaseLeft = 30; break;
      case 'brake':
        if (this.target === 0) { this.phase = 'idle'; this.phaseLeft = 3 + r * 6; }
        else { this.phase = 'accel'; this.target = 35 + Math.round(r * 40); this.phaseLeft = 20; }
        break;
    }
  }

  step(dt: number) {
    this.phaseLeft -= dt;
    const vk = this.kmh;
    let thr = 0;
    switch (this.phase) {
      case 'idle': thr = 0; this.speed = 0; break;
      case 'launch': thr = 100; break;
      case 'accel': thr = 35 + Math.min(25, (this.target - vk) * 1.2); break;
      case 'cruise': thr = 10 + vk * 0.18 + (this.target - vk) * 2; break;
      case 'brake': thr = 0; break;
    }
    thr = Math.max(0, Math.min(100, thr));
    this.throttle += (thr - this.throttle) * Math.min(1, dt * 6);

    let a: number;
    if (this.phase === 'brake') a = -this.decel;
    else if (this.phase === 'idle') a = 0;
    else {
      const drive = 3.3 * (this.throttle / 100) * Math.max(0, 1 - vk / 180);
      a = drive - 0.0005 * this.speed ** 2 - (this.speed > 0.3 ? 0.12 : 0);
    }
    this.speed = Math.max(0, this.speed + a * dt);

    // IVT behaviour: revs jump with throttle, speed catches up later ("rubber band").
    let targetRpm: number;
    if (this.kmh < 1 && this.throttle < 2) targetRpm = 750;
    else {
      const want = 1100 + this.throttle * 38;
      targetRpm = Math.max(Math.min(want, Math.max(1600, vk * 120)), vk * 20, 750);
      if (this.throttle < 2) targetRpm = Math.max(750, vk * 21);
      targetRpm = Math.min(targetRpm, 6200);
    }
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 3.5);

    this.coolant = Math.min(91, this.coolant + dt * 0.25);
    this.iat += ((36 + (vk < 10 ? 6 : 0)) - this.iat) * dt * 0.02;

    const reached = this.phase === 'brake' ? vk <= this.target + 0.5 : (this.phase === 'launch' || this.phase === 'accel') && vk >= this.target;
    if (reached || this.phaseLeft <= 0) {
      if (this.phase === 'brake' && this.target === 0) this.speed = 0;
      this.nextPhase();
    }
  }

  value(pid: number): number {
    const load = Math.min(100, 18 + this.throttle * 0.78 + (Math.random() - 0.5) * 2);
    switch (pid) {
      case 0x04: return load;
      case 0x05: return this.coolant;
      case 0x0b: return 30 + this.throttle * 0.68;
      case 0x0c: return this.rpm + (Math.random() - 0.5) * 20;
      case 0x0d: return Math.round(this.kmh);
      case 0x0e: return 8 + (1 - load / 100) * 26;
      case 0x0f: return this.iat;
      case 0x11: return this.throttle;
      default: return 0;
    }
  }
}

const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

export class SimTransport implements Transport {
  readonly name = 'Simulated car (1.2 CVT)';
  private dataCb: (s: string) => void = () => {};
  /** What a 2024 i20 plausibly reports. 0x20/0x40 are the 'next block' flags. */
  private supported = [0x04, 0x05, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x11, 0x20, 0x33, 0x40, 0x42];

  constructor(public readonly car: SimCar) { car.start(); }

  async send(text: string) {
    const cmd = text.trim().toUpperCase().replace(/\s+/g, '');
    const reply = this.answer(cmd);
    // Real adapters take ~20–60 ms per request over BLE.
    setTimeout(() => this.dataCb(reply + '\r\r>'), 15 + Math.random() * 25);
  }

  private answer(cmd: string): string {
    if (cmd === 'ATZ') return 'ELM327 v2.3 (sim)';
    if (cmd === 'ATRV') return (this.car.rpm > 500 ? 14.1 + Math.random() * 0.2 : 12.4).toFixed(1) + 'V';
    if (cmd === 'ATDPN') return 'A6';
    if (cmd.startsWith('AT')) return 'OK';
    const m = cmd.match(/^01([0-9A-F]{2})$/);
    if (!m) return '?';
    const pid = parseInt(m[1], 16);
    if (pid % 0x20 === 0) {
      if (pid > 0 && !this.supported.includes(pid)) return 'NO DATA';
      return `41 ${m[1]} ` + hex(encodeSupported(pid, this.supported));
    }
    const def = PID_BY_NUM.get(pid);
    if (!def || !this.supported.includes(pid)) return 'NO DATA';
    return `41 ${m[1]} ` + hex(def.encode(this.car.value(pid)));
  }

  onData(cb: (s: string) => void) { this.dataCb = cb; }
  onDisconnect() {}
  async close() { this.car.stop(); }
}
