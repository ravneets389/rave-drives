import { openDB, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type Drive, type Settings } from './types';

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB('rave-drives', 1, {
    upgrade(d) {
      const s = d.createObjectStore('drives', { keyPath: 'id' });
      s.createIndex('startedAt', 'startedAt');
      d.createObjectStore('kv');
    },
  });
  return dbp;
}

export async function saveDrive(d: Drive) { await (await db()).put('drives', d); }
export async function deleteDrive(id: string) { await (await db()).delete('drives', id); }
export async function getDrive(id: string): Promise<Drive | undefined> { return (await db()).get('drives', id); }
export async function listDrives(): Promise<Drive[]> {
  const all = (await (await db()).getAllFromIndex('drives', 'startedAt')) as Drive[];
  return all.reverse();
}

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await (await db()).get('kv', 'settings')) ?? {}) };
}
export async function saveSettings(s: Settings) { await (await db()).put('kv', s, 'settings'); }

/** Ask the browser not to evict our data under storage pressure. */
export async function persistStorage() {
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
}
