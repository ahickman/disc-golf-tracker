// GPS status and mark quality (DGT-GPS-001..006).
//
// Only RELATIVE accuracy matters: a steady offset shared by the tee, aim point and disc cancels out of every
// distance (decided 2026-10-30). The accuracy the phone reports estimates absolute error, steady offset included,
// so it is shown for information but does not trigger warnings, except when it is so large that the phone has
// clearly lost satellite lock. Warnings come instead from what spoils relative measurements: the jitter of the
// fixes while a mark is taken (here), and drift of the offset during a session (`teeDriftM`).

import type { Fix, Mark } from './types.ts';
import { feet } from './units.ts';

/**
 * Reported accuracy worse than this means no satellite lock: the phone is positioning from Wi-Fi or cell towers,
 * whose error is neither small nor steady (DGT-GPS-002).
 */
export const NO_LOCK_ACCURACY_M = 15;
/** A mark whose fixes scatter more than this while standing still is unsteady (DGT-GPS-004, default 10 ft). */
export const DEFAULT_JITTER_LIMIT_M = feet(10);
/** Steadiness can only be judged from at least this many fixes. */
export const MIN_FIXES_TO_JUDGE = 3;
/** A fix older than this is stale, and no fix for this long is "no fix" (DGT-GPS-003). */
export const STALE_AFTER_MS = 5000;
/** Tee drift above this is worth acting on (DGT-GPS-006, default 10 ft). */
export const DEFAULT_DRIFT_LIMIT_M = feet(10);

/** Live status for the indicator (DGT-GPS-001). */
export type GpsStatus = 'ok' | 'no-lock' | 'no-fix';

export function gpsStatus(fix: Fix | null, nowMs: number): GpsStatus {
  if (fix === null || nowMs - fix.time > STALE_AFTER_MS) return 'no-fix';
  if (!(fix.accuracyM <= NO_LOCK_ACCURACY_M)) return 'no-lock';
  return 'ok';
}

/** steady: usable; unsteady: fixes scattered; no-lock: no satellite lock; unchecked: too few fixes to judge. */
export type MarkQuality = 'steady' | 'unsteady' | 'no-lock' | 'unchecked';

export function markQuality(mark: Mark, jitterLimitM: number = DEFAULT_JITTER_LIMIT_M): MarkQuality {
  if (!(mark.accuracyM <= NO_LOCK_ACCURACY_M)) return 'no-lock';
  if (mark.fixCount < MIN_FIXES_TO_JUDGE) return 'unchecked';
  if (mark.spreadM > jitterLimitM) return 'unsteady';
  return 'steady';
}

/** Anything but a steady mark flags the throw as low quality (DGT-THR-003). */
export function isLowQuality(mark: Mark, jitterLimitM: number = DEFAULT_JITTER_LIMIT_M): boolean {
  return markQuality(mark, jitterLimitM) !== 'steady';
}
