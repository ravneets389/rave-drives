/** Live engine values read over OBD-II. Any field may be missing if the car doesn't report it. */
export interface ObdValues {
  rpm?: number;          // rev/min
  speed?: number;        // km/h (from the car's own speed sensor)
  throttle?: number;     // %
  load?: number;         // % calculated engine load
  coolant?: number;      // °C
  iat?: number;          // °C intake air temp
  map?: number;          // kPa intake manifold absolute pressure
  timing?: number;       // ° before TDC
  voltage?: number;      // V battery / control module
  fuelLph?: number;      // L/h, derived (speed-density)
}

export interface GpsFix {
  t: number;             // ms epoch
  lat: number;
  lon: number;
  speed?: number;        // km/h if the device reports it
  accuracy: number;      // metres
  heading?: number;
}

/** One recorded row. Recorded at a fixed tick rate while a drive is active. */
export interface Sample {
  t: number;             // ms since drive start
  lat?: number;
  lon?: number;
  acc?: number;          // GPS accuracy, m
  v: number;             // best available speed, km/h
  obd?: ObdValues;
}

export interface LaunchRun {
  target: 60 | 100;
  seconds: number;
  atT: number;           // ms since drive start when the run began
}

export interface DriveSummary {
  distanceKm: number;
  durationS: number;
  movingS: number;
  avgKmh: number;        // moving average
  maxKmh: number;
  fuelL?: number;
  fuelCost?: number;
  kmpl?: number;
  fuelEstimated?: boolean; // true = from average mileage, not measured over OBD
  smoothness: number;    // 0..100
  harshAccel: number;
  harshBrake: number;
  best060?: number;
  best0100?: number;
  maxRpm?: number;
  maxCoolant?: number;
}

export interface Drive {
  id: string;
  startedAt: number;     // ms epoch
  endedAt: number;
  source: { gps: 'real' | 'sim'; obd: 'none' | 'ble' | 'sim' };
  samples: Sample[];
  launches: LaunchRun[];
  summary: DriveSummary;
  ghostOf?: string;      // id of the drive raced against
  name?: string;
  car?: string;          // car profile name at the time of the drive
}

export interface Settings {
  fuelPrice: number;     // ₹ per litre
  ve: number;            // volumetric efficiency used for the OBD fuel calculation
  carName: string;       // shown on recap cards; empty = not set up yet
  engineL: number;       // engine displacement, litres
  avgKmpl: number;       // real-world mileage, used to estimate fuel without OBD
}

export const DEFAULT_SETTINGS: Settings = { fuelPrice: 101, ve: 0.85, carName: '', engineL: 1.2, avgKmpl: 15 };

/** Presets so setup is one tap. Mileage is a rough real-world city/highway mix. */
export const CAR_PRESETS: { carName: string; engineL: number; avgKmpl: number }[] = [
  { carName: 'Hyundai i20 · 1.2 IVT', engineL: 1.197, avgKmpl: 15 },
];
