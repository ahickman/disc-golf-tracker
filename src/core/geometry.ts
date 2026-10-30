// Centre line and throw measurement (DGT-THR-005, DGT-THR-006, DGT-GPS-005).
//
// Downrange is the distance along the centre line; cross range is the signed perpendicular distance from it,
// positive to the RIGHT of the line as seen from the tee looking downfield (decided 2026-10-30).

import { bearingDeg, toLocal } from './geo.ts';
import type { LatLon } from './types.ts';
import { feet } from './units.ts';

/** Set Line is refused when the aim point is closer than this to the tee (DGT-THR-006). */
export const MIN_BASELINE_M = feet(30);
/** Set Line warns, but accepts, below this baseline (DGT-THR-006, default). */
export const DEFAULT_SHORT_BASELINE_M = feet(150);

export interface CentreLine {
  tee: LatLon;
  /** Unit vector along the line, east and north components. */
  unitEast: number;
  unitNorth: number;
  /** Tee to aim point distance, meters. */
  baselineM: number;
  bearingDeg: number;
}

export type CentreLineResult =
  | { ok: true; line: CentreLine; shortBaseline: boolean }
  | { ok: false; reason: 'baseline-too-short'; baselineM: number };

export function makeCentreLine(
  tee: LatLon,
  aim: LatLon,
  shortBaselineM: number = DEFAULT_SHORT_BASELINE_M,
): CentreLineResult {
  const v = toLocal(tee, aim);
  const baselineM = Math.hypot(v.east, v.north);
  if (!(baselineM >= MIN_BASELINE_M)) return { ok: false, reason: 'baseline-too-short', baselineM };
  return {
    ok: true,
    line: { tee, unitEast: v.east / baselineM, unitNorth: v.north / baselineM, baselineM, bearingDeg: bearingDeg(v) },
    shortBaseline: baselineM < shortBaselineM,
  };
}

export interface ThrowMeasurement {
  /** Distance along the centre line; negative if the disc is behind the tee. */
  downrangeM: number;
  /** Signed distance from the centre line; positive = right. */
  crossRangeM: number;
  /** Straight-line distance from the tee. */
  totalM: number;
}

export function measureThrow(line: CentreLine, disc: LatLon): ThrowMeasurement {
  const d = toLocal(line.tee, disc);
  return {
    downrangeM: d.east * line.unitEast + d.north * line.unitNorth,
    // Dot product with the right-hand normal (unitNorth, -unitEast).
    crossRangeM: d.east * line.unitNorth - d.north * line.unitEast,
    totalM: Math.hypot(d.east, d.north),
  };
}

/**
 * Rough uncertainty of the centre line's direction, radians (DGT-GPS-005), from the jitter of the tee and aim-point
 * marks. A steady offset shared by both marks does not turn the line, so only their jitter counts. Drift of the
 * offset between the two marks is not visible here; the tee check (DGT-GPS-006) catches it.
 */
export function lineDirectionSigmaRad(teeJitterM: number, aimJitterM: number, baselineM: number): number {
  return Math.atan(Math.hypot(teeJitterM, aimJitterM) / baselineM);
}

/** Cross-range error caused by the line's direction uncertainty alone, at a given downrange distance. */
export function crossRangeSigmaAt(lineSigmaRad: number, downrangeM: number): number {
  return Math.abs(downrangeM) * Math.tan(lineSigmaRad);
}
