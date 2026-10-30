// GPS quality classification and warnings (DGT-GPS-001..004).

import type { Fix, Mark } from './types.ts';
import { feet } from './units.ts';

/** Warn when accuracy is worse than this (DGT-GPS-002, default 10 ft). */
export const DEFAULT_WARN_THRESHOLD_M = feet(10);
/** A fix older than this is stale, and no fix for this long is "no fix" (DGT-GPS-003). */
export const STALE_AFTER_MS = 5000;

/** good: within the threshold; marginal: up to twice it; poor: worse; no-fix: none, or stale. */
export type GpsQuality = 'good' | 'marginal' | 'poor' | 'no-fix';

export function classifyFix(
  fix: Fix | null,
  nowMs: number,
  thresholdM: number = DEFAULT_WARN_THRESHOLD_M,
): GpsQuality {
  if (fix === null || nowMs - fix.time > STALE_AFTER_MS) return 'no-fix';
  if (fix.accuracyM <= thresholdM) return 'good';
  if (fix.accuracyM <= 2 * thresholdM) return 'marginal';
  return 'poor';
}

/** A mark taken with accuracy worse than the threshold is flagged low quality (DGT-GPS-004, DGT-THR-003). */
export function isLowQuality(mark: Mark, thresholdM: number = DEFAULT_WARN_THRESHOLD_M): boolean {
  return mark.accuracyM > thresholdM;
}
