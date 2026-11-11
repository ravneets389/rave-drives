import type { Drive } from './types';
import { haversine } from './geo';

interface Pt { lat: number; lon: number; t: number }

/**
 * Race a previous drive. For your current position we find where the ghost was
 * on its route, then compare elapsed times. Positive delta = you're behind.
 */
export class Ghost {
  private pts: Pt[];
  private idx = 0;

  constructor(public readonly ref: Drive) {
    this.pts = ref.samples.filter((s) => s.lat != null && s.lon != null && (s.acc ?? 0) < 50)
      .map((s) => ({ lat: s.lat!, lon: s.lon!, t: s.t }));
  }

  get finishT() { return this.pts.length ? this.pts[this.pts.length - 1].t : 0; }

  /** Where the ghost is right now (for drawing it on the map). */
  positionAt(elapsedMs: number): [number, number] | null {
    if (!this.pts.length) return null;
    let i = 0;
    while (i < this.pts.length - 1 && this.pts[i + 1].t <= elapsedMs) i++;
    return [this.pts[i].lat, this.pts[i].lon];
  }

  /** Seconds behind (+) or ahead (−), or null when you're off the ghost's route. */
  delta(elapsedMs: number, lat: number, lon: number): number | null {
    if (this.pts.length < 2) return null;
    // Search a window ahead of the last match so loops/overlaps don't confuse us.
    const lo = Math.max(0, this.idx - 20);
    const hi = Math.min(this.pts.length - 1, this.idx + 400);
    let best = -1;
    let bestD = Infinity;
    for (let i = lo; i <= hi; i++) {
      const d = haversine(lat, lon, this.pts[i].lat, this.pts[i].lon);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0 || bestD > 80) return null;
    this.idx = best;
    return (elapsedMs - this.pts[best].t) / 1000;
  }

  progress(): number { return this.pts.length ? this.idx / (this.pts.length - 1) : 0; }
}

/** Past drives that started within `radiusM` of here, fastest first. */
export function ghostCandidates(drives: Drive[], lat: number, lon: number, radiusM = 250): Drive[] {
  return drives
    .filter((d) => {
      const s = d.samples.find((x) => x.lat != null);
      return s && haversine(lat, lon, s.lat!, s.lon!) <= radiusM && d.summary.distanceKm > 0.3;
    })
    .sort((a, b) => b.startedAt - a.startedAt);
}
