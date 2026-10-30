import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_JITTER_LIMIT_M,
  gpsStatus,
  isLowQuality,
  markQuality,
  NO_LOCK_ACCURACY_M,
  STALE_AFTER_MS,
} from './gps.ts';
import type { Fix, Mark } from './types.ts';

const fix = (accuracyM: number, time = 0): Fix => ({ lat: 0, lon: 0, accuracyM, time });
const mark = (spreadM: number, fixCount = 5, accuracyM = 4): Mark => ({
  lat: 0,
  lon: 0,
  accuracyM,
  spreadM,
  fixCount,
  time: 0,
});

test('DGT-GPS-002: the jitter limit defaults to 10 ft', () => {
  assert.ok(Math.abs(DEFAULT_JITTER_LIMIT_M - 3.048) < 1e-12);
});

test('DGT-GPS-002: a phone stuck at ±3-10 m reported accuracy is still OK; only loss of lock warns', () => {
  assert.equal(gpsStatus(fix(3), 0), 'ok');
  assert.equal(gpsStatus(fix(9), 0), 'ok');
  assert.equal(gpsStatus(fix(NO_LOCK_ACCURACY_M), 0), 'ok');
  assert.equal(gpsStatus(fix(40), 0), 'no-lock');
});

test('DGT-GPS-003: no fix, or a stale fix, is "no-fix"', () => {
  assert.equal(gpsStatus(null, 0), 'no-fix');
  assert.equal(gpsStatus(fix(3, 1000), 1000 + STALE_AFTER_MS), 'ok');
  assert.equal(gpsStatus(fix(3, 1000), 1001 + STALE_AFTER_MS), 'no-fix');
});

test('DGT-GPS-004: mark quality comes from jitter, not reported accuracy', () => {
  assert.equal(markQuality(mark(0.5, 5, 9)), 'steady'); // poor absolute accuracy, steady readings
  assert.equal(markQuality(mark(3.0)), 'steady');
  assert.equal(markQuality(mark(3.1)), 'unsteady');
  assert.equal(markQuality(mark(0.5, 2)), 'unchecked');
  assert.equal(markQuality(mark(0.5, 5, 30)), 'no-lock');
  assert.equal(markQuality(mark(4), 5), 'steady'); // custom limit
});

test('DGT-THR-003: anything but a steady mark is low quality', () => {
  assert.equal(isLowQuality(mark(1)), false);
  assert.equal(isLowQuality(mark(5)), true);
  assert.equal(isLowQuality(mark(1, 1)), true);
});
