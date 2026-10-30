// Taking a mark: collecting fixes over a settling window and averaging them into one position (DGT-POS-002,
// DGT-POS-004), and checking how far the offset has drifted since the tee was set (DGT-GPS-006).

import { fromLocal, toLocal } from './geo.ts';
import { NO_LOCK_ACCURACY_M } from './gps.ts';
import type { Fix, Mark } from './types.ts';

/** Default settling window (DGT-POS-002). */
export const DEFAULT_SETTLE_MS = 5000;
/** The window is extended until this many fixes have arrived... */
export const MIN_MARK_FIXES = 3;
/** ...but never beyond this. */
export const MAX_SETTLE_MS = 15000;

/** Whether a mark that started `elapsedMs` ago with `fixCount` fixes so far should finish now. */
export function isMarkComplete(fixCount: number, elapsedMs: number, settleMs: number = DEFAULT_SETTLE_MS): boolean {
  if (elapsedMs >= MAX_SETTLE_MS) return true;
  return elapsedMs >= settleMs && fixCount >= MIN_MARK_FIXES;
}

function isUsable(f: Fix): boolean {
  return (
    Number.isFinite(f.lat) &&
    Number.isFinite(f.lon) &&
    Math.abs(f.lat) <= 90 &&
    Math.abs(f.lon) <= 180 &&
    Number.isFinite(f.accuracyM) &&
    f.accuracyM > 0
  );
}

/**
 * Combine fixes into a mark, or return null if none is usable.
 *
 * Fixes without satellite lock (reported accuracy worse than NO_LOCK_ACCURACY_M) are dropped when any locked fix
 * exists. The position is the inverse-variance (1/accuracy²) weighted mean, taken in the local plane around the
 * first fix. `spreadM` is the RMS distance of the fixes from that mean: the jitter while standing still. The
 * reported `accuracyM` is the weighted RMS of the fixes' accuracies, kept for information and the no-lock check.
 */
export function averageFixes(fixes: readonly Fix[]): Mark | null {
  const usable = fixes.filter(isUsable);
  if (usable.length === 0) return null;
  const locked = usable.filter((f) => f.accuracyM <= NO_LOCK_ACCURACY_M);
  const used = locked.length > 0 ? locked : usable;

  const origin = used[0];
  const points = used.map((f) => ({ f, p: toLocal(origin, f), w: 1 / (f.accuracyM * f.accuracyM) }));
  let sumW = 0;
  let east = 0;
  let north = 0;
  for (const { p, w } of points) {
    sumW += w;
    east += w * p.east;
    north += w * p.north;
  }
  east /= sumW;
  north /= sumW;

  let sq = 0;
  let altSum = 0;
  let altCount = 0;
  let time = -Infinity;
  for (const { f, p } of points) {
    sq += (p.east - east) ** 2 + (p.north - north) ** 2;
    if (f.altitudeM !== undefined && Number.isFinite(f.altitudeM)) {
      altSum += f.altitudeM;
      altCount++;
    }
    time = Math.max(time, f.time);
  }

  const pos = fromLocal(origin, { east, north });
  const mark: Mark = {
    lat: pos.lat,
    lon: pos.lon,
    accuracyM: Math.sqrt(used.length / sumW),
    spreadM: Math.sqrt(sq / used.length),
    fixCount: used.length,
    time,
  };
  if (altCount > 0) mark.altitudeM = altSum / altCount;
  return mark;
}

/**
 * How far GPS now places the tee from where it was set (DGT-GPS-006). Taken while standing on the tee, this is how
 * much the GPS offset has changed since then, which is the error it adds to every measurement.
 */
export function teeDriftM(tee: Mark, recheck: Mark): number {
  const d = toLocal(tee, recheck);
  return Math.hypot(d.east, d.north);
}
