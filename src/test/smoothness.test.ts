import { expect, it } from 'vitest';
import { SimCar } from '../lib/obd/sim';
import { smoothnessScore } from '../lib/analysis';
import type { Sample } from '../lib/types';

function simDrive(seconds: number, seed: number, gps1hz = false) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const orig = Math.random; Math.random = rnd;
  const car = new SimCar(); const out: Sample[] = []; let held = 0;
  for (let t = 0; t <= seconds * 1000; t += 250) {
    car.step(0.25);
    if (!gps1hz || t % 1000 === 0) held = Math.round(car.kmh * 10) / 10;
    out.push({ t, v: held });
  }
  Math.random = orig;
  return out;
}

it('smoothness agrees between 1 Hz GPS and fast OBD speed', () => {
  for (const [secs, seed] of [[45, 1], [300, 3], [900, 5]]) {
    const a = smoothnessScore(simDrive(secs, seed)).score;
    const b = smoothnessScore(simDrive(secs, seed, true)).score;
    expect(Math.abs(a - b)).toBeLessThanOrEqual(10);
  }
});

it('a short drive with one launch is not scored zero', () => {
  expect(smoothnessScore(simDrive(45, 1)).score).toBeGreaterThan(50);
});
