// Session statistics (DGT-RPT-002), for all throws and split by throw type (DGT-THR-009).

import type { ThrowType } from './types.ts';
import { feet } from './units.ts';

/** Throws within this distance of the line count as "in the corridor" (DGT-RPT-002, default ±20 ft). */
export const DEFAULT_CORRIDOR_M = feet(20);

export interface ThrowRecord {
  downrangeM: number;
  crossRangeM: number;
  throwType: ThrowType;
  lowQuality: boolean;
  deleted: boolean;
}

export interface Summary {
  count: number;
  /** Null when there are no throws. */
  downrange: { max: number; mean: number; median: number; sd: number | null } | null;
  /** mean is the left/right bias (positive = right); meanAbs is the typical miss either side. */
  crossRange: { mean: number; sd: number | null; meanAbs: number } | null;
  /** Percentage, 0-100; null when there are no throws. */
  withinCorridorPct: number | null;
}

export interface SessionStats {
  all: Summary;
  backhand: Summary;
  forehand: Summary;
}

export interface StatsOptions {
  corridorM?: number;
  /** Include throws whose marks had a GPS warning (DGT-GPS-004). Default true. */
  includeLowQuality?: boolean;
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n - 1); null below two values. */
function sampleSd(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1));
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Statistics over exactly the throws given (no filtering). */
export function summarize(throws: readonly ThrowRecord[], corridorM: number = DEFAULT_CORRIDOR_M): Summary {
  if (throws.length === 0) return { count: 0, downrange: null, crossRange: null, withinCorridorPct: null };
  const down = throws.map((t) => t.downrangeM);
  const cross = throws.map((t) => t.crossRangeM);
  const inCorridor = cross.filter((c) => Math.abs(c) <= corridorM).length;
  return {
    count: throws.length,
    downrange: { max: Math.max(...down), mean: mean(down), median: median(down), sd: sampleSd(down) },
    crossRange: { mean: mean(cross), sd: sampleSd(cross), meanAbs: mean(cross.map(Math.abs)) },
    withinCorridorPct: (100 * inCorridor) / throws.length,
  };
}

/** Session statistics: deleted throws excluded (DGT-THR-004), low-quality ones optionally. */
export function sessionStats(throws: readonly ThrowRecord[], options: StatsOptions = {}): SessionStats {
  const corridorM = options.corridorM ?? DEFAULT_CORRIDOR_M;
  const includeLowQuality = options.includeLowQuality ?? true;
  const kept = throws.filter((t) => !t.deleted && (includeLowQuality || !t.lowQuality));
  return {
    all: summarize(kept, corridorM),
    backhand: summarize(kept.filter((t) => t.throwType === 'backhand'), corridorM),
    forehand: summarize(kept.filter((t) => t.throwType === 'forehand'), corridorM),
  };
}
