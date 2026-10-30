import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyFix, DEFAULT_WARN_THRESHOLD_M, isLowQuality, STALE_AFTER_MS } from './gps.ts';
import type { Fix, Mark } from './types.ts';

const fix = (accuracyM: number, time = 0): Fix => ({ lat: 0, lon: 0, accuracyM, time });

test('DGT-GPS-002: the default warning threshold is 10 ft', () => {
  assert.ok(Math.abs(DEFAULT_WARN_THRESHOLD_M - 3.048) < 1e-12);
});

test('DGT-GPS-001, DGT-GPS-002: quality bands relative to the threshold', () => {
  assert.equal(classifyFix(fix(2), 0), 'good');
  assert.equal(classifyFix(fix(3.048), 0), 'good');
  assert.equal(classifyFix(fix(3.1), 0), 'marginal');
  assert.equal(classifyFix(fix(6.096), 0), 'marginal');
  assert.equal(classifyFix(fix(6.2), 0), 'poor');
  assert.equal(classifyFix(fix(4), 0, 5), 'good');
});

test('DGT-GPS-003: no fix, or a stale fix, is "no-fix"', () => {
  assert.equal(classifyFix(null, 0), 'no-fix');
  assert.equal(classifyFix(fix(2, 1000), 1000 + STALE_AFTER_MS), 'good');
  assert.equal(classifyFix(fix(2, 1000), 1001 + STALE_AFTER_MS), 'no-fix');
});

test('DGT-GPS-004: marks worse than the threshold are low quality', () => {
  const mark = (accuracyM: number): Mark => ({ lat: 0, lon: 0, accuracyM, fixCount: 5, time: 0 });
  assert.equal(isLowQuality(mark(3)), false);
  assert.equal(isLowQuality(mark(3.1)), true);
});
