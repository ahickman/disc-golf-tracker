// Averaging the fixes collected during a mark's settling window into one position (DGT-POS-002, DGT-POS-004).

import { fromLocal, toLocal } from './geo.ts';
import { DEFAULT_WARN_THRESHOLD_M } from './gps.ts';
import type { Fix, Mark } from './types.ts';

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
 * Fixes worse than the threshold are dropped when any fix meets it; otherwise all usable fixes are kept. The
 * position is the inverse-variance (1/accuracy²) weighted mean, taken in the local plane around the first fix.
 *
 * The mark's accuracy is the weighted RMS of the fixes' accuracies, with no 1/√n improvement: fixes a second
 * apart share most of their error, so averaging them removes jitter but not the underlying offset.
 */
export function averageFixes(fixes: readonly Fix[], thresholdM: number = DEFAULT_WARN_THRESHOLD_M): Mark | null {
  const usable = fixes.filter(isUsable);
  if (usable.length === 0) return null;
  const good = usable.filter((f) => f.accuracyM <= thresholdM);
  const used = good.length > 0 ? good : usable;

  const origin = used[0];
  let sumW = 0;
  let east = 0;
  let north = 0;
  let altSum = 0;
  let altCount = 0;
  let time = -Infinity;
  for (const f of used) {
    const w = 1 / (f.accuracyM * f.accuracyM);
    const p = toLocal(origin, f);
    sumW += w;
    east += w * p.east;
    north += w * p.north;
    if (f.altitudeM !== undefined && Number.isFinite(f.altitudeM)) {
      altSum += f.altitudeM;
      altCount++;
    }
    time = Math.max(time, f.time);
  }
  const pos = fromLocal(origin, { east: east / sumW, north: north / sumW });
  const mark: Mark = {
    lat: pos.lat,
    lon: pos.lon,
    accuracyM: Math.sqrt(used.length / sumW),
    fixCount: used.length,
    time,
  };
  if (altCount > 0) mark.altitudeM = altSum / altCount;
  return mark;
}
