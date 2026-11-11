import type { LaunchRun } from './types';

/**
 * Detects standing-start runs: from a stop (< 1 km/h) to 60 and 100 km/h.
 * A run is abandoned if the car slows noticeably or takes too long.
 */
const MAX_SECONDS = { 60: 15, 100: 25 } as const;

export class LaunchDetector {
  private startT: number | null = null;
  private stoppedT: number | null = null;
  private prev: { t: number; v: number } | null = null;
  private peak = 0;
  private hit60 = false;
  runs: LaunchRun[] = [];

  /** Feed (ms since drive start, km/h). Returns any run that just completed. */
  feed(t: number, v: number): LaunchRun[] {
    const done: LaunchRun[] = [];
    if (v < 1) {
      this.stoppedT = t;
      this.startT = null;
      this.peak = 0;
      this.hit60 = false;
    } else if (this.startT == null && this.stoppedT != null) {
      this.startT = this.stoppedT;
    }

    const startT = this.startT;
    if (startT != null && this.prev) {
      this.peak = Math.max(this.peak, v);
      const elapsed = (t - startT) / 1000;
      if (v < this.peak - 5 || elapsed > 40) {
        this.startT = null;
        this.stoppedT = null; // needs a fresh stop to arm again
      } else {
        for (const target of [60, 100] as const) {
          if (target === 60 && this.hit60) continue;
          if (this.prev.v < target && v >= target) {
            const f = (target - this.prev.v) / (v - this.prev.v);
            const crossT = this.prev.t + f * (t - this.prev.t);
            const run: LaunchRun = { target, seconds: (crossT - startT) / 1000, atT: startT };
            // Gentle pull-aways aren't launches: only keep runs that look like you meant it.
            if (run.seconds <= MAX_SECONDS[target]) { done.push(run); this.runs.push(run); }
            if (target === 60) this.hit60 = true;
            else { this.startT = null; this.stoppedT = null; }
          }
        }
      }
    }
    this.prev = { t, v };
    return done;
  }
}
