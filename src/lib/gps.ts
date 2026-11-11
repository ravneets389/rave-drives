import type { GpsFix } from './types';
import { haversine, offset } from './geo';

export interface PositionSource {
  start(onFix: (f: GpsFix) => void, onError: (msg: string) => void): void;
  stop(): void;
}

/** Real device GPS via the Geolocation API. */
export class DeviceGps implements PositionSource {
  private id: number | null = null;
  private last: GpsFix | null = null;

  start(onFix: (f: GpsFix) => void, onError: (msg: string) => void) {
    if (!('geolocation' in navigator)) { onError('No GPS on this device'); return; }
    this.id = navigator.geolocation.watchPosition(
      (p) => {
        const fix: GpsFix = {
          t: p.timestamp,
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          heading: p.coords.heading ?? undefined,
          speed: p.coords.speed != null && !Number.isNaN(p.coords.speed) ? p.coords.speed * 3.6 : undefined,
        };
        // Some devices omit coords.speed: derive it from consecutive fixes.
        if (fix.speed == null && this.last) {
          const dt = (fix.t - this.last.t) / 1000;
          if (dt > 0.2) fix.speed = (haversine(this.last.lat, this.last.lon, fix.lat, fix.lon) / dt) * 3.6;
        }
        this.last = fix;
        onFix(fix);
      },
      (e) => onError(e.message || 'GPS error'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  stop() {
    if (this.id != null) navigator.geolocation.clearWatch(this.id);
    this.id = null;
    this.last = null;
  }
}

/**
 * Fake GPS that follows a closed loop, moving at whatever speed `getSpeed` returns.
 * Pair it with the simulated car so position and engine data agree.
 */
export class SimGps implements PositionSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private route: [number, number][] = [];
  private seg = 0;
  private segPos = 0;

  constructor(private getSpeed: () => number, private center: [number, number] = [28.6129, 77.2295]) {
    // A rough 4 km loop with some kinks so the map looks like a real drive.
    const [lat, lon] = this.center;
    const legs: [number, number][] = [[0, 700], [80, 900], [150, 500], [190, 800], [260, 1100], [320, 600], [20, 350]];
    let p: [number, number] = [lat, lon];
    this.route.push(p);
    for (const [bearing, dist] of legs) { p = offset(p[0], p[1], dist, bearing); this.route.push(p); }
    this.route.push([lat, lon]);
  }

  start(onFix: (f: GpsFix) => void) {
    let lastT = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      const kmh = this.getSpeed();
      let move = (kmh / 3.6) * ((now - lastT) / 1000);
      lastT = now;
      while (move > 0) {
        const a = this.route[this.seg];
        const b = this.route[(this.seg + 1) % this.route.length];
        const len = haversine(a[0], a[1], b[0], b[1]);
        if (this.segPos + move < len) { this.segPos += move; move = 0; }
        else { move -= len - this.segPos; this.segPos = 0; this.seg = (this.seg + 1) % (this.route.length - 1); }
      }
      const a = this.route[this.seg];
      const b = this.route[(this.seg + 1) % this.route.length];
      const len = haversine(a[0], a[1], b[0], b[1]) || 1;
      const f = this.segPos / len;
      onFix({ t: now, lat: a[0] + (b[0] - a[0]) * f, lon: a[1] + (b[1] - a[1]) * f, speed: kmh, accuracy: 4 });
    }, 500);
  }

  stop() { if (this.timer != null) clearInterval(this.timer); this.timer = null; }
}
