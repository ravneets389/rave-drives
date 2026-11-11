import type { ObdValues } from '../types';

export interface PidDef {
  pid: number;
  key: keyof ObdValues;
  label: string;
  bytes: number;
  decode: (b: number[]) => number;
  encode: (v: number) => number[]; // used by the simulator
}

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export const PIDS: PidDef[] = [
  { pid: 0x04, key: 'load', label: 'Engine load', bytes: 1, decode: ([a]) => (a * 100) / 255, encode: (v) => [clampByte((v * 255) / 100)] },
  { pid: 0x05, key: 'coolant', label: 'Coolant temp', bytes: 1, decode: ([a]) => a - 40, encode: (v) => [clampByte(v + 40)] },
  { pid: 0x0b, key: 'map', label: 'Manifold pressure', bytes: 1, decode: ([a]) => a, encode: (v) => [clampByte(v)] },
  {
    pid: 0x0c, key: 'rpm', label: 'RPM', bytes: 2, decode: ([a, b]) => (a * 256 + b) / 4,
    encode: (v) => { const n = Math.max(0, Math.min(65535, Math.round(v * 4))); return [n >> 8, n & 0xff]; },
  },
  { pid: 0x0d, key: 'speed', label: 'Vehicle speed', bytes: 1, decode: ([a]) => a, encode: (v) => [clampByte(v)] },
  { pid: 0x0e, key: 'timing', label: 'Timing advance', bytes: 1, decode: ([a]) => a / 2 - 64, encode: (v) => [clampByte((v + 64) * 2)] },
  { pid: 0x0f, key: 'iat', label: 'Intake air temp', bytes: 1, decode: ([a]) => a - 40, encode: (v) => [clampByte(v + 40)] },
  { pid: 0x11, key: 'throttle', label: 'Throttle position', bytes: 1, decode: ([a]) => (a * 100) / 255, encode: (v) => [clampByte((v * 255) / 100)] },
];

export const PID_BY_NUM = new Map(PIDS.map((p) => [p.pid, p]));

/** Read every 0x01 response hiding in an ELM327 reply. Tolerates spaces, echoes, multi-ECU replies. */
export function parseMode01(raw: string, pid: number): number[] | null {
  const hex = raw.toUpperCase().replace(/[^0-9A-F\r\n]/g, '');
  const want = '41' + pid.toString(16).toUpperCase().padStart(2, '0');
  for (const line of hex.split(/[\r\n]+/)) {
    const i = line.indexOf(want);
    if (i < 0) continue;
    const data = line.slice(i + 4);
    const bytes: number[] = [];
    for (let j = 0; j + 1 < data.length; j += 2) bytes.push(parseInt(data.slice(j, j + 2), 16));
    if (bytes.length) return bytes;
  }
  return null;
}

/** Decode the 4-byte "PIDs supported" bitmap returned by 0100/0120/0140… */
export function decodeSupported(base: number, bytes: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 32; i++) {
    const byte = bytes[i >> 3] ?? 0;
    if (byte & (0x80 >> (i & 7))) out.push(base + i + 1);
  }
  return out;
}

export function encodeSupported(base: number, pids: number[]): number[] {
  const bytes = [0, 0, 0, 0];
  for (const p of pids) {
    const i = p - base - 1;
    if (i >= 0 && i < 32) bytes[i >> 3] |= 0x80 >> (i & 7);
  }
  return bytes;
}
