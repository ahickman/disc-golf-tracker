// GPS test analysis (DGT-GPS-007). The player stands on one spot while every fix is recorded; the recording is then
// replayed as if a mark had been taken every 30 s with different hold times. Because the spot never moved, any
// difference between those marks is GPS error: exactly the mark-to-mark swing that ends up in measured distances.

import { toLocal } from './geo.ts';
import { averageFixes } from './marks.ts';
import type { Fix, LatLon, Local } from './types.ts';

/** Marks are simulated this far apart, like walking between tee and disc. */
export const MARK_SPACING_MS = 30_000;
/** Hold times compared. */
export const HOLDS_MS = [5_000, 15_000, 30_000] as const;
/** Shorter recordings cannot give at least two 30 s marks. */
export const MIN_TEST_MS = 60_000;

export interface Scatter {
  /** RMS distance of the marks from their centre: the typical error of one mark. */
  rmsM: number;
  /** Largest distance between any two marks: the worst swing seen. */
  worstSwingM: number;
}

export interface HoldResult extends Scatter {
  holdMs: number;
  marks: number;
}

export interface GpsTestResult {
  durationMs: number;
  fixCount: number;
  holds: HoldResult[];
  /** Distance between the first and last 30 s averages: slow drift over the whole test. */
  driftM: number;
}

/** Scatter of points about their centroid, or null for fewer than two points. */
export function scatter(points: readonly LatLon[]): Scatter | null {
  if (points.length < 2) return null;
  const origin = points[0];
  const local = points.map((p) => toLocal(origin, p));
  const cx = local.reduce((a, p) => a + p.east, 0) / local.length;
  const cy = local.reduce((a, p) => a + p.north, 0) / local.length;
  const rmsM = Math.sqrt(local.reduce((a, p) => a + (p.east - cx) ** 2 + (p.north - cy) ** 2, 0) / local.length);
  let worstSwingM = 0;
  for (let i = 0; i < local.length; i++) {
    for (let j = i + 1; j < local.length; j++) {
      worstSwingM = Math.max(worstSwingM, Math.hypot(local[i].east - local[j].east, local[i].north - local[j].north));
    }
  }
  return { rmsM, worstSwingM };
}

function window(fixes: readonly Fix[], startMs: number, lengthMs: number): Fix[] {
  return fixes.filter((f) => f.time >= startMs && f.time < startMs + lengthMs);
}

/** Marks as if taken every `spacingMs` with a hold of `holdMs`, using only windows that fit in the recording. */
export function simulateMarks(fixes: readonly Fix[], holdMs: number, spacingMs: number = MARK_SPACING_MS): LatLon[] {
  if (fixes.length === 0) return [];
  const start = fixes[0].time;
  const end = fixes[fixes.length - 1].time;
  const marks: LatLon[] = [];
  for (let t = start; t + holdMs <= end + 1000; t += spacingMs) {
    const m = averageFixes(window(fixes, t, holdMs));
    if (m) marks.push(m);
  }
  return marks;
}

/** Analyse a recording made standing on one spot; null if it is shorter than MIN_TEST_MS. */
export function analyseGpsTest(recorded: readonly Fix[]): GpsTestResult | null {
  const fixes = [...recorded].sort((a, b) => a.time - b.time);
  if (fixes.length < 2) return null;
  const durationMs = fixes[fixes.length - 1].time - fixes[0].time;
  if (durationMs < MIN_TEST_MS) return null;

  const holds: HoldResult[] = [];
  for (const holdMs of HOLDS_MS) {
    const marks = simulateMarks(fixes, holdMs);
    const s = scatter(marks);
    if (s) holds.push({ holdMs, marks: marks.length, ...s });
  }

  const first = averageFixes(window(fixes, fixes[0].time, MARK_SPACING_MS));
  const last = averageFixes(window(fixes, fixes[fixes.length - 1].time - MARK_SPACING_MS, MARK_SPACING_MS + 1));
  const drift = first && last ? toLocal(first, last) : { east: 0, north: 0 };
  return { durationMs, fixCount: fixes.length, holds, driftM: Math.hypot(drift.east, drift.north) };
}

/** Points relative to their centroid, metres, for drawing the scatter. */
export function centred(points: readonly LatLon[]): Local[] {
  if (points.length === 0) return [];
  const origin = points[0];
  const local = points.map((p) => toLocal(origin, p));
  const cx = local.reduce((a, p) => a + p.east, 0) / local.length;
  const cy = local.reduce((a, p) => a + p.north, 0) / local.length;
  return local.map((p) => ({ east: p.east - cx, north: p.north - cy }));
}
