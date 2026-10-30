import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fromLocal, toLocal } from './geo.ts';
import { averageFixes, isMarkComplete, MAX_SETTLE_MS, teeDriftM } from './marks.ts';
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
  const m = averageFixes([fixAt(0, 0, 3, 1000), fixAt(2, 0, 3, 2000), fixAt(1, 3, 3, 3000)]);
  assert.ok(m);
  const p = localOf(m);
  assert.ok(Math.abs(p.east - 1) < 1e-3 && Math.abs(p.north - 1) < 1e-3);
  assert.equal(m.fixCount, 3);
  assert.equal(m.time, 3000);
  assert.ok(Math.abs(m.accuracyM - 3) < 1e-9);
});

test('DGT-POS-002: more accurate fixes carry more weight (1/accuracy²)', () => {
  const m = averageFixes([fixAt(0, 0, 3), fixAt(10, 0, 6)]);
  assert.ok(m);
  // weights 1/9 and 1/36: east = 10 * (1/36) / (5/36) = 2
  assert.ok(Math.abs(localOf(m).east - 2) < 1e-3);
});

test('DGT-GPS-004: spread measures jitter about the mean', () => {
  // Four fixes at distance 1 m around (5, 5): RMS distance 1.
  const m = averageFixes([fixAt(6, 5, 3), fixAt(4, 5, 3), fixAt(5, 6, 3), fixAt(5, 4, 3)]);
  assert.ok(m);
  assert.ok(Math.abs(m.spreadM - 1) < 1e-3, `spread ${m.spreadM}`);
  const still = averageFixes([fixAt(5, 5, 8), fixAt(5, 5, 8), fixAt(5, 5, 8)]);
  assert.ok(still);
  assert.ok(still.spreadM < 1e-6);
});

test('DGT-GPS-002: fixes without satellite lock are dropped when locked ones exist', () => {
  const m = averageFixes([fixAt(0, 0, 4), fixAt(80, 80, 50), fixAt(1, 0, 5)]);
  assert.ok(m);
  assert.equal(m.fixCount, 2);
  assert.ok(localOf(m).east < 1);
  const none = averageFixes([fixAt(0, 0, 40), fixAt(2, 0, 60)]);
  assert.ok(none);
  assert.equal(none.fixCount, 2);
  assert.ok(none.accuracyM > 15);
});

test('DGT-POS-004: unusable fixes are ignored and no usable fixes gives null', () => {
  assert.equal(averageFixes([]), null);
  const bad: Fix[] = [
    { lat: NaN, lon: 0, accuracyM: 3, time: 0 },
    { lat: 0, lon: 0, accuracyM: 0, time: 0 },
    { lat: 0, lon: 0, accuracyM: -1, time: 0 },
    { lat: 91, lon: 0, accuracyM: 3, time: 0 },
  ];
  assert.equal(averageFixes(bad), null);
  const m = averageFixes([...bad, fixAt(3, 4, 3)]);
  assert.ok(m);
  assert.equal(m.fixCount, 1);
});

test('DGT-POS-005: altitude is averaged when present but plays no part in position', () => {
  const m = averageFixes([fixAt(0, 0, 3, 0, 100), fixAt(0, 0, 3, 0), fixAt(0, 0, 3, 0, 110)]);
  assert.ok(m);
  assert.equal(m.altitudeM, 105);
  const none = averageFixes([fixAt(0, 0, 3)]);
  assert.ok(none);
  assert.equal(none.altitudeM, undefined);
});

test('DGT-POS-002: the settling window waits for 5 s and 3 fixes, at most 15 s', () => {
  assert.equal(isMarkComplete(10, 4999), false);
  assert.equal(isMarkComplete(3, 5000), true);
  assert.equal(isMarkComplete(2, 9000), false);
  assert.equal(isMarkComplete(0, MAX_SETTLE_MS), true);
  assert.equal(isMarkComplete(3, 2000, 2000), true);
});

test('DGT-GPS-006: tee drift is the distance between the tee and a re-check on it', () => {
  const tee = averageFixes([fixAt(0, 0, 3)]);
  const recheck = averageFixes([fixAt(3, 4, 3)]);
  assert.ok(tee && recheck);
  assert.ok(Math.abs(teeDriftM(tee, recheck) - 5) < 1e-3);
});
