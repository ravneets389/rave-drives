import { describe, expect, it } from 'vitest';
import { parseMode01, decodeSupported, encodeSupported, PID_BY_NUM } from '../lib/obd/pids';
import { fuelLph } from '../lib/fuel';
import { LaunchDetector } from '../lib/launch';
import { summarize, smoothnessScore } from '../lib/analysis';
import { Elm327 } from '../lib/obd/elm327';
import { SimCar, SimTransport } from '../lib/obd/sim';
import { DEFAULT_SETTINGS, type Sample } from '../lib/types';

describe('PID parsing', () => {
  it('decodes RPM with or without spaces and echo noise', () => {
    expect(PID_BY_NUM.get(0x0c)!.decode(parseMode01('41 0C 1A F8', 0x0c)!)).toBe(1726);
    expect(PID_BY_NUM.get(0x0c)!.decode(parseMode01('010C\r410C1AF8\r', 0x0c)!)).toBe(1726);
  });
  it('returns null for NO DATA', () => { expect(parseMode01('NO DATA', 0x0d)).toBeNull(); });
  it('round-trips the supported-PID bitmap', () => {
    const pids = [0x04, 0x05, 0x0c, 0x0d, 0x11, 0x20];
    expect(decodeSupported(0, encodeSupported(0, pids))).toEqual(pids);
    expect(decodeSupported(0, [0xbe, 0x1f, 0xa8, 0x13])).toContain(0x0c);
  });
});

describe('fuel model (1.2 Kappa)', () => {
  it('idles around 0.6–1.0 L/h', () => {
    const v = fuelLph(750, 32, 40);
    expect(v).toBeGreaterThan(0.5); expect(v).toBeLessThan(1.1);
  });
  it('cuts fuel on overrun', () => { expect(fuelLph(2000, 25, 30, 0.85, 0, 60)).toBe(0); });
});

describe('launch detector', () => {
  it('times 0–60 and 0–100 with interpolation', () => {
    const d = new LaunchDetector();
    const runs = [];
    for (let t = 0; t <= 2000; t += 250) runs.push(...d.feed(t, 0));
    // constant 2 m/s² from t=2s → 60 km/h at 8.33 s, 100 km/h at 13.9 s after start
    for (let t = 2250; t <= 20000; t += 250) runs.push(...d.feed(t, Math.min(110, ((t - 2000) / 1000) * 2 * 3.6)));
    expect(runs.map((r) => r.target)).toEqual([60, 100]);
    expect(runs[0].seconds).toBeCloseTo(8.33, 1);
    expect(runs[1].seconds).toBeCloseTo(13.89, 1);
  });
  it('abandons a run when the car slows', () => {
    const d = new LaunchDetector();
    d.feed(0, 0);
    const out = [...d.feed(1000, 20), ...d.feed(2000, 40), ...d.feed(3000, 30), ...d.feed(4000, 65)];
    expect(out).toEqual([]);
  });
});

describe('analysis', () => {
  const cruise: Sample[] = Array.from({ length: 2400 }, (_, i) => ({ t: i * 250, v: 50 }));
  it('integrates distance from speed', () => {
    expect(summarize(cruise, [], DEFAULT_SETTINGS).distanceKm).toBeCloseTo(50 * (2399 * 0.25) / 3600, 2);
  });
  it('scores steady driving high and stop-go stabbing low', () => {
    expect(smoothnessScore(cruise).score).toBeGreaterThan(90);
    const jerky: Sample[] = Array.from({ length: 2400 }, (_, i) => ({ t: i * 250, v: 30 + ((i % 16) < 8 ? (i % 8) * 4 : 28 - (i % 8) * 4) }));
    expect(smoothnessScore(jerky).score).toBeLessThan(60);
  });
});

describe('simulated i20 over the real ELM327 stack', () => {
  it('connects, scans PIDs, and reads plausible values', async () => {
    const car = new SimCar();
    for (let i = 0; i < 200; i++) car.step(0.1); // ~20 s of driving
    car.stop();
    const elm = new Elm327(new SimTransport(car));
    car.stop(); // freeze the model so readings are stable
    await elm.init();
    expect([...elm.supported]).toEqual(expect.arrayContaining([0x0c, 0x0d, 0x11, 0x42]));
    const rpm = await elm.readPid(0x0c);
    const speed = await elm.readPid(0x0d);
    expect(rpm).toBeGreaterThan(600); expect(rpm).toBeLessThan(6500);
    expect(speed).toBe(Math.round(car.kmh));
    expect(await elm.readVoltage()).toBeGreaterThan(11);
  });
  it('the IVT sim does 0–100 in a believable 12–17 s', () => {
    const car = new SimCar();
    (car as any).phase = 'launch'; (car as any).target = 200; (car as any).phaseLeft = 99;
    let t = 0;
    while (car.kmh < 100 && t < 40) { car.step(0.05); t += 0.05; }
    expect(t).toBeGreaterThan(12); expect(t).toBeLessThan(17);
  });
});

describe('launch filter', () => {
  it('ignores a lazy 20 s crawl to 60', () => {
    const d = new LaunchDetector();
    d.feed(0, 0);
    const out = [];
    for (let t = 250; t <= 25000; t += 250) out.push(...d.feed(t, Math.min(65, (t / 1000) * 3)));
    expect(out).toEqual([]);
  });
});

describe('fuel without OBD', () => {
  it('estimates fuel and cost from average mileage', () => {
    const samples: Sample[] = Array.from({ length: 1441 }, (_, i) => ({ t: i * 250, v: 60 })); // 6 min at 60 km/h = 6 km
    const s = summarize(samples, [], { ...DEFAULT_SETTINGS, avgKmpl: 15, fuelPrice: 100 });
    expect(s.fuelEstimated).toBe(true);
    expect(s.fuelL).toBeCloseTo(0.4, 2);
    expect(s.fuelCost).toBeCloseTo(40, 0);
    expect(s.kmpl).toBeUndefined(); // we don't claim a measured km/l
  });
  it('prefers measured OBD fuel when present', () => {
    const samples: Sample[] = Array.from({ length: 100 }, (_, i) => ({ t: i * 250, v: 60, obd: { fuelLph: 4 } }));
    expect(summarize(samples, [], DEFAULT_SETTINGS).fuelEstimated).toBeUndefined();
  });
  it('engine size scales the OBD fuel calculation', () => {
    expect(fuelLph(2000, 50, 30, 0.85, 20, 50, 2.4)).toBeCloseTo(2 * fuelLph(2000, 50, 30, 0.85, 20, 50, 1.2), 5);
  });
});
