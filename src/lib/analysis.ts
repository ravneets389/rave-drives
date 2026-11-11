import type { DriveSummary, LaunchRun, Sample, Settings } from './types';

/** Speed resampled to 1 Hz (per-second averages). Evens out 1 Hz GPS vs ~5 Hz OBD. */
function perSecond(samples: Sample[]): number[] {
  const sums: number[] = [], counts: number[] = [];
  for (const p of samples) {
    const k = Math.floor(p.t / 1000);
    sums[k] = (sums[k] ?? 0) + p.v;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const out: number[] = [];
  let last = 0;
  for (let k = 0; k < sums.length; k++) { if (counts[k]) last = sums[k] / counts[k]; out.push(last); }
  return out;
}

/** Longitudinal acceleration (m/s²) at 1 Hz, centred difference. */
export function accelSeries(samples: Sample[]): number[] {
  const v = perSecond(samples).map((x) => x / 3.6);
  return v.map((_, i) => (i === 0 || i === v.length - 1 ? 0 : (v[i + 1] - v[i - 1]) / 2));
}

const HARSH_ACCEL = 2.8; // m/s² (roughly a full-throttle pull in an i20 1.2)
const HARSH_BRAKE = -3.2;

/** Count separate episodes (at least 3 s apart) where the test holds. */
function countEvents(a: number[], test: (x: number) => boolean): number {
  let n = 0, last = -99;
  a.forEach((x, i) => { if (test(x)) { if (i - last > 3) n++; last = i; } });
  return n;
}

/**
 * 0–100. Penalises jerky throttle/brake (rate of change of acceleration) and
 * harsh events. On drives over 10 min, events are counted per 10 min so long
 * drives aren't punished just for being long; short drives use the raw count.
 */
export function smoothnessScore(samples: Sample[]): { score: number; harshAccel: number; harshBrake: number } {
  const v = perSecond(samples);
  const a = accelSeries(samples);
  const harshAccel = countEvents(a, (x) => x > HARSH_ACCEL);
  const harshBrake = countEvents(a, (x) => x < HARSH_BRAKE);
  let sumSq = 0, n = 0;
  for (let i = 1; i < a.length; i++) {
    if (v[i] < 2 && v[i - 1] < 2) continue;
    sumSq += (a[i] - a[i - 1]) ** 2;
    n++;
  }
  const jerkRms = n ? Math.sqrt(sumSq / n) : 0;
  const movingMin = n / 60;
  const scale = movingMin > 10 ? 10 / movingMin : 1;
  const score = 100 - jerkRms * 30 - (harshAccel * 6 + harshBrake * 9) * scale;
  return { score: Math.round(Math.max(0, Math.min(100, score))), harshAccel, harshBrake };
}

export function summarize(samples: Sample[], launches: LaunchRun[], settings: Settings): DriveSummary {
  let distM = 0;
  let movingS = 0;
  let maxKmh = 0;
  let fuelL = 0;
  let hasFuel = false;
  let maxRpm: number | undefined;
  let maxCoolant: number | undefined;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0 || dt > 10) continue;
    distM += (((a.v + b.v) / 2) / 3.6) * dt;
    if (b.v > 2) movingS += dt;
    maxKmh = Math.max(maxKmh, b.v);
    if (b.obd?.fuelLph != null) { fuelL += (b.obd.fuelLph / 3600) * dt; hasFuel = true; }
    if (b.obd?.rpm != null) maxRpm = Math.max(maxRpm ?? 0, b.obd.rpm);
    if (b.obd?.coolant != null) maxCoolant = Math.max(maxCoolant ?? -99, b.obd.coolant);
  }
  const durationS = samples.length ? samples[samples.length - 1].t / 1000 : 0;
  const distanceKm = distM / 1000;
  const sm = smoothnessScore(samples);
  // No OBD fuel data: estimate from the car's average mileage.
  const fuelEstimated = !hasFuel && settings.avgKmpl > 0;
  if (fuelEstimated) fuelL = distanceKm / settings.avgKmpl;
  const best = (target: 60 | 100) => {
    const runs = launches.filter((l) => l.target === target).map((l) => l.seconds);
    return runs.length ? Math.min(...runs) : undefined;
  };
  return {
    distanceKm,
    durationS,
    movingS,
    avgKmh: movingS > 0 ? distanceKm / (movingS / 3600) : 0,
    maxKmh,
    fuelL: hasFuel || fuelEstimated ? fuelL : undefined,
    fuelCost: hasFuel || fuelEstimated ? fuelL * settings.fuelPrice : undefined,
    kmpl: hasFuel && fuelL > 0.01 ? distanceKm / fuelL : undefined,
    fuelEstimated: fuelEstimated || undefined,
    smoothness: sm.score,
    harshAccel: sm.harshAccel,
    harshBrake: sm.harshBrake,
    best060: best(60),
    best0100: best(100),
    maxRpm,
    maxCoolant,
  };
}
