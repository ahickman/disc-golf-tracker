import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fromLocal } from './geo.ts';
import { analyseGpsTest, centred, MIN_TEST_MS, scatter, simulateMarks } from './gpsTest.ts';
import type { Fix, LatLon } from './types.ts';

const SPOT: LatLon = { lat: 47.6, lon: -122.3 };

/** One fix per second for `seconds`, positioned by `offset(t)` in metres east/north of SPOT. */
function record(seconds: number, offset: (t: number) => { east: number; north: number }): Fix[] {
  const fixes: Fix[] = [];
  for (let t = 0; t <= seconds; t++) {
    fixes.push({ ...fromLocal(SPOT, offset(t)), accuracyM: 4, time: 1_000_000 + t * 1000 });
  }
  return fixes;
}

/** Deterministic pseudo-random numbers in [-1, 1). */
function noise(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s / 2147483648) * 2 - 1;
  };
}

test('DGT-GPS-007: scatter gives the RMS spread and the worst swing between points', () => {
  const pts = [
    fromLocal(SPOT, { east: -1, north: 0 }),
    fromLocal(SPOT, { east: 1, north: 0 }),
    fromLocal(SPOT, { east: 0, north: 1 }),
    fromLocal(SPOT, { east: 0, north: -1 }),
  ];
  const s = scatter(pts);
  assert.ok(s);
  assert.ok(Math.abs(s.rmsM - 1) < 1e-3);
  assert.ok(Math.abs(s.worstSwingM - 2) < 1e-3);
  assert.equal(scatter([SPOT]), null);
});

test('DGT-GPS-007: a perfectly steady recording shows no error', () => {
  const r = analyseGpsTest(record(300, () => ({ east: 0, north: 0 })));
  assert.ok(r);
  assert.equal(r.holds.length, 3);
  for (const h of r.holds) assert.ok(h.rmsM < 1e-6 && h.worstSwingM < 1e-6);
  assert.ok(r.driftM < 1e-6);
});

test('DGT-GPS-007: marks are simulated every 30 s, each hold fitting in the recording', () => {
  const fixes = record(300, () => ({ east: 0, north: 0 }));
  assert.equal(simulateMarks(fixes, 5000).length, 10); // t = 0, 30, ..., 270; a hold starting at 300 would not fit
  assert.equal(simulateMarks(fixes, 30000).length, 10); // the last 30 s window, 270-300, just fits
});

test('DGT-GPS-007: slow wander shows up as swing that a longer hold barely reduces', () => {
  // 4 m drift east over 5 minutes, the kind of slow error a 5 s average cannot remove.
  const r = analyseGpsTest(record(300, (t) => ({ east: (4 * t) / 300, north: 0 })));
  assert.ok(r);
  const [h5, , h30] = r.holds;
  assert.ok(h5.worstSwingM > 3.5, `swing ${h5.worstSwingM}`);
  assert.ok(h30.worstSwingM > 3, `swing ${h30.worstSwingM}`);
  assert.ok(Math.abs(r.driftM - 3.6) < 0.3, `drift ${r.driftM}`); // centre of first 30 s to centre of last 30 s
});

test('DGT-GPS-007: fast jitter is reduced by a longer hold', () => {
  const rand = noise(42);
  const r = analyseGpsTest(record(600, () => ({ east: 3 * rand(), north: 3 * rand() })));
  assert.ok(r);
  const [h5, h15, h30] = r.holds;
  assert.ok(h15.rmsM < h5.rmsM && h30.rmsM < h15.rmsM, `${h5.rmsM} ${h15.rmsM} ${h30.rmsM}`);
});

test('DGT-GPS-007: recordings under a minute are too short to analyse', () => {
  assert.equal(analyseGpsTest(record((MIN_TEST_MS - 2000) / 1000, () => ({ east: 0, north: 0 }))), null);
  assert.equal(analyseGpsTest([]), null);
});

test('centred points average to zero', () => {
  const c = centred([fromLocal(SPOT, { east: 2, north: 0 }), fromLocal(SPOT, { east: 4, north: 2 })]);
  assert.ok(Math.abs(c[0].east + 1) < 1e-3 && Math.abs(c[1].north - 1) < 1e-3);
});
