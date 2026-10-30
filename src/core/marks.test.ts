import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fromLocal, toLocal } from './geo.ts';
import { averageFixes } from './marks.ts';
import type { Fix, LatLon } from './types.ts';

const ORIGIN: LatLon = { lat: 40, lon: -105 };

function fixAt(east: number, north: number, accuracyM: number, time = 0, altitudeM?: number): Fix {
  const f: Fix = { ...fromLocal(ORIGIN, { east, north }), accuracyM, time };
  if (altitudeM !== undefined) f.altitudeM = altitudeM;
  return f;
}

function localOf(p: LatLon): { east: number; north: number } {
  return toLocal(ORIGIN, p);
}

test('DGT-POS-002: equal-accuracy fixes average to their centroid', () => {
  const m = averageFixes([fixAt(0, 0, 2, 1000), fixAt(2, 0, 2, 2000), fixAt(1, 3, 2, 3000)]);
  assert.ok(m);
  const p = localOf(m);
  assert.ok(Math.abs(p.east - 1) < 1e-3 && Math.abs(p.north - 1) < 1e-3);
  assert.equal(m.fixCount, 3);
  assert.equal(m.time, 3000);
  assert.ok(Math.abs(m.accuracyM - 2) < 1e-9);
});

test('DGT-POS-002: more accurate fixes carry more weight (1/accuracy²)', () => {
  const m = averageFixes([fixAt(0, 0, 1), fixAt(10, 0, 2)]);
  assert.ok(m);
  // weights 1 and 1/4: east = 10 * 0.25 / 1.25 = 2
  assert.ok(Math.abs(localOf(m).east - 2) < 1e-3);
});

test('DGT-POS-002: fixes worse than the threshold are dropped when good ones exist', () => {
  const m = averageFixes([fixAt(0, 0, 2), fixAt(50, 50, 20), fixAt(1, 0, 2.5)], 3.048);
  assert.ok(m);
  assert.equal(m.fixCount, 2);
  assert.ok(localOf(m).east < 1);
});

test('DGT-POS-002: with no good fixes, all usable fixes are kept and the mark reports poor accuracy', () => {
  const m = averageFixes([fixAt(0, 0, 6), fixAt(2, 0, 8)], 3.048);
  assert.ok(m);
  assert.equal(m.fixCount, 2);
  assert.ok(m.accuracyM > 3.048);
});

test('DGT-POS-004: unusable fixes are ignored and no usable fixes gives null', () => {
  assert.equal(averageFixes([]), null);
  const bad: Fix[] = [
    { lat: NaN, lon: 0, accuracyM: 2, time: 0 },
    { lat: 0, lon: 0, accuracyM: 0, time: 0 },
    { lat: 0, lon: 0, accuracyM: -1, time: 0 },
    { lat: 91, lon: 0, accuracyM: 2, time: 0 },
  ];
  assert.equal(averageFixes(bad), null);
  const m = averageFixes([...bad, fixAt(3, 4, 2)]);
  assert.ok(m);
  assert.equal(m.fixCount, 1);
});

test('DGT-POS-005: altitude is averaged when present but plays no part in position', () => {
  const m = averageFixes([fixAt(0, 0, 2, 0, 100), fixAt(0, 0, 2, 0), fixAt(0, 0, 2, 0, 110)]);
  assert.ok(m);
  assert.equal(m.altitudeM, 105);
  const none = averageFixes([fixAt(0, 0, 2)]);
  assert.ok(none);
  assert.equal(none.altitudeM, undefined);
});
