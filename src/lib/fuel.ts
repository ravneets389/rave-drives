/**
 * Speed-density fuel estimate. Works for engines without a MAF sensor (like the
 * i20's 1.2 Kappa) by reconstructing airflow from manifold pressure, intake temp and RPM.
 */
const R_AIR = 287.05;         // J/(kg·K)
const AFR = 14.7;             // stoichiometric petrol
const PETROL_G_PER_L = 745;

export function fuelLph(rpm: number, mapKpa: number, iatC: number, ve = 0.85, throttle?: number, speedKmh?: number, engineL = 1.197): number {
  // Decel fuel cut: foot off throttle while the wheels drive the engine.
  if (throttle != null && throttle < 1 && rpm > 1200 && (speedKmh ?? 0) > 20) return 0;
  const airKgPerS = (mapKpa * 1000 * (engineL / 1000) * ve * (rpm / 120)) / (R_AIR * (iatC + 273.15));
  const fuelGPerS = (airKgPerS * 1000) / AFR;
  return (fuelGPerS * 3600) / PETROL_G_PER_L;
}
