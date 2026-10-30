import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fromLocal } from './geo.ts';
import {
  crossRangeSigmaAt,
  type CentreLine,
  lineDirectionSigmaRad,
  makeCentreLine,
  measureThrow,
  MIN_BASELINE_M,
} from './geometry.ts';
import type { LatLon } from './types.ts';
import { feet } from './units.ts';

const TEE: LatLon = { lat: 47.6062, lon: -122.3321 };

function near(actual: number, expected: number, tol = 1e-3): void {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
}

/** A point given in throw coordinates relative to a line from TEE at `bearing`. */
function pointAt(bearing: number, downrange: number, crossRange: number): LatLon {
  const b = (bearing * Math.PI) / 180;
  const ue = Math.sin(b);
  const un = Math.cos(b);
  // right-hand normal is (un, -ue)
  return fromLocal(TEE, { east: downrange * ue + crossRange * un, north: downrange * un - crossRange * ue });
}

function lineAt(bearing: number, baseline = 60): CentreLine {
  const r = makeCentreLine(TEE, pointAt(bearing, baseline, 0));
  assert.ok(r.ok);
  return r.line;
}

test('DGT-THR-005: a disc on the centre line has zero cross range and downrange equal to total', () => {
  const m = measureThrow(lineAt(0), pointAt(0, 95, 0));
  near(m.downrangeM, 95);
  near(m.crossRangeM, 0);
  near(m.totalM, 95);
});

test('DGT-THR-005: cross range is positive to the right of the line and negative to the left', () => {
  const line = lineAt(0); // pointing north: right is east
  const right = measureThrow(line, fromLocal(TEE, { east: 5, north: 80 }));
  near(right.downrangeM, 80);
  near(right.crossRangeM, 5);
  near(right.totalM, Math.hypot(5, 80));
  const left = measureThrow(line, fromLocal(TEE, { east: -7, north: 80 }));
  near(left.crossRangeM, -7);
});

test('DGT-THR-005: measurements are the same for any line bearing', () => {
  for (const bearing of [0, 37, 90, 143.5, 180, 237, 300, 359]) {
    const m = measureThrow(lineAt(bearing), pointAt(bearing, 88.2, -6.3));
    near(m.downrangeM, 88.2);
    near(m.crossRangeM, -6.3);
  }
});

test('DGT-THR-005: a disc behind the tee has negative downrange', () => {
  const m = measureThrow(lineAt(90), pointAt(90, -4, 2));
  near(m.downrangeM, -4);
  near(m.crossRangeM, 2);
});

test('DGT-THR-005: only the line direction matters, not how far the aim point is', () => {
  const disc = pointAt(210, 70, 3);
  const a = measureThrow(lineAt(210, 30), disc);
  const b = measureThrow(lineAt(210, 120), disc);
  near(a.downrangeM, b.downrangeM);
  near(a.crossRangeM, b.crossRangeM);
});

test('DGT-THR-006: Set Line is refused under 30 ft and warns under 300 ft', () => {
  const tooShort = makeCentreLine(TEE, pointAt(45, feet(29), 0));
  assert.equal(tooShort.ok, false);
  const coincident = makeCentreLine(TEE, TEE);
  assert.equal(coincident.ok, false);

  const short = makeCentreLine(TEE, pointAt(45, feet(250), 0));
  assert.ok(short.ok && short.shortBaseline);
  const long = makeCentreLine(TEE, pointAt(45, feet(350), 0));
  assert.ok(long.ok && !long.shortBaseline);
  near(long.ok ? long.line.bearingDeg : NaN, 45, 1e-6);
  near(long.ok ? long.line.baselineM : NaN, feet(350));

  assert.ok(MIN_BASELINE_M > 9.14 && MIN_BASELINE_M < 9.15);
});

test('DGT-GPS-005: line uncertainty matches the requirements Section 6 table', () => {
  // 3 m accuracy at both ends; cross-range error at a 300 ft throw.
  const rows: [baselineFt: number, sigmaDeg: number, crossFt: number][] = [
    [100, 7.9, 42],
    [200, 4.0, 21],
    [300, 2.7, 14],
  ];
  for (const [baselineFt, sigmaDeg, crossFt] of rows) {
    const s = lineDirectionSigmaRad(3, 3, feet(baselineFt));
    near((s * 180) / Math.PI, sigmaDeg, 0.1);
    near(crossRangeSigmaAt(s, feet(300)) / feet(1), crossFt, 1);
  }
});
