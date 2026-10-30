// On-device storage (SQLite). Every session and confirmed throw is written as soon as it exists (DGT-SES-003).

import * as SQLite from 'expo-sqlite';

import type { Mark } from '../core/types.ts';
import type { DistanceUnit } from '../core/units.ts';

export type Db = SQLite.SQLiteDatabase;

export interface DiscRow {
  id: number;
  name: string;
}

export interface ThrowRow {
  id: number;
  sessionId: number;
  seq: number;
  time: number;
  disc: Mark;
  downrangeM: number;
  crossRangeM: number;
  totalM: number;
  lowQuality: boolean;
  deleted: boolean;
}

export interface SessionRow {
  id: number;
  disc: DiscRow;
  startedAt: number;
  endedAt: number | null;
  tee: Mark;
  aim: Mark;
}

// Version 2 dropped the disc type and throw type columns (the developer has no use for them, 2026-10-30).
const SCHEMA_VERSION = 2;

export async function openDb(): Promise<Db> {
  const db = await SQLite.openDatabaseAsync('disc-golf-tracker.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version === 0) {
    await db.execAsync(`
      CREATE TABLE discs (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        retired INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY,
        disc_id INTEGER NOT NULL REFERENCES discs(id),
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        tee TEXT NOT NULL,
        aim TEXT NOT NULL,
        note TEXT
      );
      CREATE TABLE throws (
        id INTEGER PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES sessions(id),
        seq INTEGER NOT NULL,
        time INTEGER NOT NULL,
        disc_mark TEXT NOT NULL,
        downrange_m REAL NOT NULL,
        crossrange_m REAL NOT NULL,
        total_m REAL NOT NULL,
        low_quality INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        note TEXT
      );
      CREATE INDEX throws_by_session ON throws(session_id, seq);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  } else if (version === 1) {
    await db.execAsync(`
      ALTER TABLE discs DROP COLUMN type;
      ALTER TABLE throws DROP COLUMN throw_type;
      DELETE FROM settings WHERE key = 'lastThrowType';
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }
  return db;
}

// --- settings

/** What the plot shows (DGT-PLT-003): this session's throws only, or also all earlier sessions with the same disc. */
export type Overlay = 'off' | 'disc';

export interface Settings {
  unit: DistanceUnit;
  lastDiscId: number | null;
  overlay: Overlay;
}

export async function loadSettings(db: Db): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const lastDisc = Number(m.get('lastDiscId'));
  return {
    unit: m.get('unit') === 'ft' ? 'ft' : 'm',
    lastDiscId: Number.isInteger(lastDisc) && lastDisc > 0 ? lastDisc : null,
    // 'all' (every disc) was an option until 2026-10-30; it now means the same disc.
    overlay: m.get('overlay') === 'disc' || m.get('overlay') === 'all' ? 'disc' : 'off',
  };
}

export async function saveSetting(db: Db, key: keyof Settings, value: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

// --- discs

/** The disc with this name (ignoring case and surrounding spaces), created if new. */
export async function saveDisc(db: Db, name: string): Promise<DiscRow> {
  const clean = name.trim();
  const existing = await db.getFirstAsync<DiscRow>(
    'SELECT id, name FROM discs WHERE lower(name) = lower(?) AND retired = 0',
    clean,
  );
  if (existing) return existing;
  const r = await db.runAsync('INSERT INTO discs (name, created_at) VALUES (?, ?)', clean, Date.now());
  return { id: r.lastInsertRowId, name: clean };
}

/** Discs, most recently used first. */
export async function recentDiscs(db: Db, limit = 6): Promise<DiscRow[]> {
  return db.getAllAsync<DiscRow>(
    `SELECT d.id, d.name FROM discs d LEFT JOIN sessions s ON s.disc_id = d.id
     WHERE d.retired = 0 GROUP BY d.id ORDER BY max(coalesce(s.started_at, d.created_at)) DESC LIMIT ?`,
    limit,
  );
}

/** How much a disc's deletion would remove. */
export async function discUsage(db: Db, discId: number): Promise<{ sessions: number; throws: number }> {
  const r = await db.getFirstAsync<{ sessions: number; throws: number }>(
    `SELECT (SELECT count(*) FROM sessions WHERE disc_id = ?) AS sessions,
            (SELECT count(*) FROM throws t JOIN sessions s ON s.id = t.session_id WHERE s.disc_id = ?) AS throws`,
    discId,
    discId,
  );
  return { sessions: r?.sessions ?? 0, throws: r?.throws ?? 0 };
}

/** Delete a disc with all its sessions and throws (DGT-DSC-002). */
export async function deleteDisc(db: Db, discId: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM throws WHERE session_id IN (SELECT id FROM sessions WHERE disc_id = ?)', discId);
    await db.runAsync('DELETE FROM sessions WHERE disc_id = ?', discId);
    await db.runAsync('DELETE FROM discs WHERE id = ?', discId);
  });
}

export async function getDisc(db: Db, id: number): Promise<DiscRow | null> {
  return db.getFirstAsync<DiscRow>('SELECT id, name FROM discs WHERE id = ?', id);
}

// --- sessions

interface SessionDbRow {
  id: number;
  disc_id: number;
  started_at: number;
  ended_at: number | null;
  tee: string;
  aim: string;
}

async function toSession(db: Db, r: SessionDbRow): Promise<SessionRow | null> {
  const disc = await getDisc(db, r.disc_id);
  if (!disc) return null;
  return {
    id: r.id,
    disc,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    tee: JSON.parse(r.tee) as Mark,
    aim: JSON.parse(r.aim) as Mark,
  };
}

export async function createSession(db: Db, discId: number, tee: Mark, aim: Mark): Promise<number> {
  const r = await db.runAsync(
    'INSERT INTO sessions (disc_id, started_at, tee, aim) VALUES (?, ?, ?, ?)',
    discId,
    Date.now(),
    JSON.stringify(tee),
    JSON.stringify(aim),
  );
  return r.lastInsertRowId;
}

/** End a session; one with no throws is deleted instead. */
export async function endSession(db: Db, sessionId: number): Promise<void> {
  const n = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM throws WHERE session_id = ?', sessionId);
  if ((n?.n ?? 0) === 0) await db.runAsync('DELETE FROM sessions WHERE id = ?', sessionId);
  else await db.runAsync('UPDATE sessions SET ended_at = ? WHERE id = ?', Date.now(), sessionId);
}

export async function getSession(db: Db, sessionId: number): Promise<SessionRow | null> {
  const r = await db.getFirstAsync<SessionDbRow>('SELECT * FROM sessions WHERE id = ?', sessionId);
  return r ? toSession(db, r) : null;
}

/** The most recent unfinished session, if any (DGT-SES-004). */
export async function openSession(db: Db): Promise<SessionRow | null> {
  const r = await db.getFirstAsync<SessionDbRow>('SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY id DESC');
  return r ? toSession(db, r) : null;
}

// --- throws

interface ThrowDbRow {
  id: number;
  session_id: number;
  seq: number;
  time: number;
  disc_mark: string;
  downrange_m: number;
  crossrange_m: number;
  total_m: number;
  low_quality: number;
  deleted: number;
}

function toThrow(r: ThrowDbRow): ThrowRow {
  return {
    id: r.id,
    sessionId: r.session_id,
    seq: r.seq,
    time: r.time,
    disc: JSON.parse(r.disc_mark) as Mark,
    downrangeM: r.downrange_m,
    crossRangeM: r.crossrange_m,
    totalM: r.total_m,
    lowQuality: r.low_quality !== 0,
    deleted: r.deleted !== 0,
  };
}

export type NewThrow = Omit<ThrowRow, 'id' | 'seq' | 'deleted'>;

export async function addThrow(db: Db, t: NewThrow): Promise<ThrowRow> {
  const last = await db.getFirstAsync<{ seq: number | null }>(
    'SELECT max(seq) AS seq FROM throws WHERE session_id = ?',
    t.sessionId,
  );
  const seq = (last?.seq ?? 0) + 1;
  const r = await db.runAsync(
    `INSERT INTO throws (session_id, seq, time, disc_mark, downrange_m, crossrange_m, total_m, low_quality)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    t.sessionId,
    seq,
    t.time,
    JSON.stringify(t.disc),
    t.downrangeM,
    t.crossRangeM,
    t.totalM,
    t.lowQuality ? 1 : 0,
  );
  return { ...t, id: r.lastInsertRowId, seq, deleted: false };
}

export async function setThrowDeleted(db: Db, throwId: number, deleted: boolean): Promise<void> {
  await db.runAsync('UPDATE throws SET deleted = ? WHERE id = ?', deleted ? 1 : 0, throwId);
}

export async function sessionThrows(db: Db, sessionId: number): Promise<ThrowRow[]> {
  const rows = await db.getAllAsync<ThrowDbRow>('SELECT * FROM throws WHERE session_id = ? ORDER BY seq', sessionId);
  return rows.map(toThrow);
}

export interface PastThrow {
  id: number;
  time: number;
  discName: string;
  downrangeM: number;
  crossRangeM: number;
}

/** Throws from other sessions for the plot overlay (DGT-PLT-003), newest first, optionally for one disc only. */
export async function pastThrows(
  db: Db,
  excludeSessionId: number | null,
  discId: number | null,
  limit = 1000,
): Promise<PastThrow[]> {
  const rows = await db.getAllAsync<{
    id: number;
    time: number;
    disc_name: string;
    downrange_m: number;
    crossrange_m: number;
  }>(
    `SELECT t.id, t.time, d.name AS disc_name, t.downrange_m, t.crossrange_m
     FROM throws t JOIN sessions s ON s.id = t.session_id JOIN discs d ON d.id = s.disc_id
     WHERE t.deleted = 0 AND s.id != ? AND (? IS NULL OR s.disc_id = ?)
     ORDER BY t.time DESC LIMIT ?`,
    excludeSessionId ?? -1,
    discId,
    discId,
    limit,
  );
  return rows.map((r) => ({
    id: r.id,
    time: r.time,
    discName: r.disc_name,
    downrangeM: r.downrange_m,
    crossRangeM: r.crossrange_m,
  }));
}

export interface SessionSummary {
  id: number;
  startedAt: number;
  endedAt: number | null;
  throwCount: number;
  bestM: number | null;
  averageM: number | null;
}

/** A disc's sessions, newest first, with counts and distances over their kept throws (DGT-RPT-003). */
export async function discSessions(db: Db, discId: number): Promise<SessionSummary[]> {
  const rows = await db.getAllAsync<{
    id: number;
    started_at: number;
    ended_at: number | null;
    n: number;
    best: number | null;
    average: number | null;
  }>(
    `SELECT s.id, s.started_at, s.ended_at, count(t.id) AS n, max(t.downrange_m) AS best, avg(t.downrange_m) AS average
     FROM sessions s LEFT JOIN throws t ON t.session_id = s.id AND t.deleted = 0
     WHERE s.disc_id = ? GROUP BY s.id ORDER BY s.started_at DESC`,
    discId,
  );
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    throwCount: r.n,
    bestM: r.best,
    averageM: r.average,
  }));
}
