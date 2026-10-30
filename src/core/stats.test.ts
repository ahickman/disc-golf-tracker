import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sessionStats, summarize, type ThrowRecord } from './stats.ts';

function t(downrangeM: number, crossRangeM: number, extra: Partial<ThrowRecord> = {}): ThrowRecord {
  return { downrangeM, crossRangeM, lowQuality: false, deleted: false, ...extra };
}

function near(actual: number | null | undefined, expected: number, tol = 1e-9): void {
  assert.ok(actual != null && Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
}

test('DGT-RPT-002: downrange and cross-range statistics over a session', () => {
  const s = summarize([t(80, 2), t(90, -4), t(100, 8), t(70, 0)], 5);
  assert.equal(s.count, 4);
  near(s.downrange?.max, 100);
  near(s.downrange?.mean, 85);
  near(s.downrange?.median, 85);
  near(s.downrange?.sd, Math.sqrt(500 / 3)); // deviations -5, 5, 15, -15
  near(s.crossRange?.mean, 1.5);
  near(s.crossRange?.meanAbs, 3.5);
  near(s.crossRange?.sd, Math.sqrt((0.25 + 30.25 + 42.25 + 2.25) / 3));
  near(s.withinCorridorPct, 75); // |8| > 5
});

test('DGT-RPT-002: odd-count median, single throw, and empty session', () => {
  near(summarize([t(50, 0), t(10, 0), t(30, 0)]).downrange?.median, 30);
  const one = summarize([t(60, 1)]);
  assert.equal(one.downrange?.sd, null);
  assert.equal(one.crossRange?.sd, null);
  const none = summarize([]);
  assert.deepEqual(none, { count: 0, downrange: null, crossRange: null, withinCorridorPct: null });
});

test('DGT-RPT-002: the default corridor is ±20 ft', () => {
  near(summarize([t(80, 6.0), t(80, -6.2)]).withinCorridorPct, 50);
});

test('DGT-THR-004: deleted throws are excluded from statistics', () => {
  const s = sessionStats([t(80, 0), t(200, 0, { deleted: true })]);
  assert.equal(s.count, 1);
  near(s.downrange?.max, 80);
});

test('DGT-GPS-004: low-quality throws can be excluded', () => {
  const throws = [t(80, 0), t(90, 0, { lowQuality: true })];
  assert.equal(sessionStats(throws).count, 2);
  assert.equal(sessionStats(throws, { includeLowQuality: false }).count, 1);
});
