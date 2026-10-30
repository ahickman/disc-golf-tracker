// On-device storage (SQLite). Every session and confirmed throw is written as soon as it exists (DGT-SES-003).

import * as SQLite from 'expo-sqlite';

import type { Mark, ThrowType } from '../core/types.ts';
import type { DistanceUnit } from '../core/units.ts';

export type Db = SQLite.SQLiteDatabase;

export type DiscType = 'distance' | 'fairway' | 'midrange' | 'putter';

export interface DiscRow {
  id: number;
  name: string;
  type: DiscType;
}

export interface ThrowRow {
  id: number;
  sessionId: number;
  seq: number;
  time: number;
  throwType: ThrowType;
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

const SCHEMA_VERSION = 1;

export async function openDb(): Promise<Db> {
  const db = await SQLite.openDatabaseAsync('disc-golf-tracker.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((row?.user_version ?? 0) < SCHEMA_VERSION) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS discs (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        retired INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY,
        disc_id INTEGER NOT NULL REFERENCES discs(id),
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        tee TEXT NOT NULL,
        aim TEXT NOT NULL,
        note TEXT
      );
      CREATE TABLE IF NOT EXISTS throws (
        id INTEGER PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES sessions(id),
        seq INTEGER NOT NULL,
        time INTEGER NOT NULL,
        throw_type TEXT NOT NULL,
        disc_mark TEXT NOT NULL,
        downrange_m REAL NOT NULL,
        crossrange_m REAL NOT NULL,
        total_m REAL NOT NULL,
        low_quality INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        note TEXT
      );
      CREATE INDEX IF NOT EXISTS throws_by_session ON throws(session_id, seq);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }
  return db;
}

// --- settings

export interface Settings {
  unit: DistanceUnit;
  lastThrowType: ThrowType;
  lastDiscId: number | null;
}

export async function loadSettings(db: Db): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const lastDisc = Number(m.get('lastDiscId'));
  return {
    unit: m.get('unit') === 'ft' ? 'ft' : 'm',
    lastThrowType: m.get('lastThrowType') === 'forehand' ? 'forehand' : 'backhand',
    lastDiscId: Number.isInteger(lastDisc) && lastDisc > 0 ? lastDisc : null,
  };
}

export async function saveSetting(db: Db, key: keyof Settings, value: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

// --- discs

interface DiscDbRow {
  id: number;
  name: string;
  type: string;
}

function toDisc(r: DiscDbRow): DiscRow {
  const type = (['distance', 'fairway', 'midrange', 'putter'] as const).find((t) => t === r.type) ?? 'fairway';
  return { id: r.id, name: r.name, type };
}

/** The disc with this name (ignoring case and surrounding spaces), created or updated to the given type. */
export async function saveDisc(db: Db, name: string, type: DiscType): Promise<DiscRow> {
  const clean = name.trim();
  const existing = await db.getFirstAsync<DiscDbRow>(
    'SELECT id, name, type FROM discs WHERE lower(name) = lower(?) AND retired = 0',
    clean,
  );
  if (existing) {
    if (existing.type !== type) await db.runAsync('UPDATE discs SET type = ? WHERE id = ?', type, existing.id);
    return { id: existing.id, name: existing.name, type };
  }
  const r = await db.runAsync('INSERT INTO discs (name, type, created_at) VALUES (?, ?, ?)', clean, type, Date.now());
  return { id: r.lastInsertRowId, name: clean, type };
}

/** Discs, most recently used first. */
export async function recentDiscs(db: Db, limit = 6): Promise<DiscRow[]> {
  const rows = await db.getAllAsync<DiscDbRow>(
    `SELECT d.id, d.name, d.type FROM discs d LEFT JOIN sessions s ON s.disc_id = d.id
     WHERE d.retired = 0 GROUP BY d.id ORDER BY max(coalesce(s.started_at, d.created_at)) DESC LIMIT ?`,
    limit,
  );
  return rows.map(toDisc);
}

export async function getDisc(db: Db, id: number): Promise<DiscRow | null> {
  const r = await db.getFirstAsync<DiscDbRow>('SELECT id, name, type FROM discs WHERE id = ?', id);
  return r ? toDisc(r) : null;
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
  throw_type: string;
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
    throwType: r.throw_type === 'forehand' ? 'forehand' : 'backhand',
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
    `INSERT INTO throws (session_id, seq, time, throw_type, disc_mark, downrange_m, crossrange_m, total_m, low_quality)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    t.sessionId,
    seq,
    t.time,
    t.throwType,
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
