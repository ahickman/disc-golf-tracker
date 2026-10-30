import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatAccuracy, formatCrossRange, formatDistance, roundedDistance } from './units.ts';

test('DGT-UNI-003: distances round to the nearest meter or foot', () => {
  assert.equal(formatDistance(87.4, 'm'), '87 m');
  assert.equal(formatDistance(87.5, 'm'), '88 m');
  assert.equal(formatDistance(87.4, 'ft'), '287 ft'); // 286.75 ft
  assert.equal(formatDistance(0.3048 * 300, 'ft'), '300 ft');
});

test('DGT-UNI-003: tiny negative values do not show as "-0"', () => {
  assert.equal(roundedDistance(-0.2, 'm'), 0);
  assert.equal(formatDistance(-0.2, 'm'), '0 m');
});

test('DGT-UNI-001: the same stored value formats in either unit', () => {
  const meters = 100;
  assert.equal(formatDistance(meters, 'm'), '100 m');
  assert.equal(formatDistance(meters, 'ft'), '328 ft');
});

test('DGT-THR-001: cross range shows a magnitude and a side', () => {
  assert.equal(formatCrossRange(4.2, 'm'), '4 m right');
  assert.equal(formatCrossRange(-3.6, 'm'), '4 m left');
  assert.equal(formatCrossRange(-3, 'ft'), '10 ft left');
  assert.equal(formatCrossRange(0.4, 'm'), '0 m');
  assert.equal(formatCrossRange(-0.4, 'm'), '0 m');
});

test('DGT-GPS-001: accuracy formats with a ± sign', () => {
  assert.equal(formatAccuracy(2.2, 'm'), '±2 m');
  assert.equal(formatAccuracy(3.048, 'ft'), '±10 ft');
});
