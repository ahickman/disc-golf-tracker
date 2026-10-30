import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fromLocal } from './geo.ts';
import type { LatLon, Mark } from './types.ts';
import { feet } from './units.ts';
import { initialWorkflow, step, type WorkflowState } from './workflow.ts';

const TEE: LatLon = { lat: 47.6, lon: -122.3 };

function markAt(east: number, north: number, spreadM = 0.5, fixCount = 5): Mark {
  return { ...fromLocal(TEE, { east, north }), accuracyM: 4, spreadM, fixCount, time: 0 };
}

/** Tee set and a 150 m line due north accepted. */
function ready(): WorkflowState {
  let s = step(initialWorkflow(), { type: 'tee-marked', mark: markAt(0, 0) });
  s = step(s, { type: 'aim-marked', mark: markAt(0, 150) });
  assert.equal(s.stage.name, 'throw');
  return s;
}

test('DGT-SES-001: Set Tee then Set Line leads to throwing', () => {
  let s = initialWorkflow();
  assert.equal(s.stage.name, 'tee');
  s = step(s, { type: 'tee-marked', mark: markAt(0, 0) });
  assert.equal(s.stage.name, 'line');
  assert.equal(s.notice, null);
  s = step(s, { type: 'aim-marked', mark: markAt(0, 150) });
  assert.equal(s.stage.name, 'throw');
});

test('DGT-THR-006: too short a line is refused; a short one asks to accept or redo', () => {
  let s = step(initialWorkflow(), { type: 'tee-marked', mark: markAt(0, 0) });
  const refused = step(s, { type: 'aim-marked', mark: markAt(0, 5) });
  assert.equal(refused.stage.name, 'line');
  assert.equal(refused.notice?.kind, 'baseline-too-short');

  s = step(s, { type: 'aim-marked', mark: markAt(0, feet(100)) });
  assert.equal(s.stage.name, 'short-line');
  assert.equal(step(s, { type: 'redo-line' }).stage.name, 'line');
  assert.equal(step(s, { type: 'accept-line' }).stage.name, 'throw');
});

test('DGT-GPS-004: an unsteady tee or aim mark raises a notice but does not block', () => {
  const s = step(initialWorkflow(), { type: 'tee-marked', mark: markAt(0, 0, 5) });
  assert.equal(s.stage.name, 'line');
  assert.deepEqual(s.notice, { kind: 'mark-quality', what: 'tee', quality: 'unsteady', spreadM: 5 });
  assert.equal(step(s, { type: 'dismiss-notice' }).notice, null);
});

test('DGT-THR-001: Mark Disc measures the throw for review', () => {
  const s = step(ready(), { type: 'disc-marked', mark: markAt(4, 87) });
  assert.equal(s.stage.name, 'review');
  if (s.stage.name !== 'review') return;
  assert.ok(Math.abs(s.stage.measurement.downrangeM - 87) < 1e-3);
  assert.ok(Math.abs(s.stage.measurement.crossRangeM - 4) < 1e-3);
  assert.equal(s.stage.quality, 'steady');
});

test('DGT-THR-002: confirm and discard both return to throwing', () => {
  const review = step(ready(), { type: 'disc-marked', mark: markAt(0, 80) });
  assert.equal(step(review, { type: 'confirm' }).stage.name, 'throw');
  assert.equal(step(review, { type: 'discard' }).stage.name, 'throw');
});

test('DGT-SES-004, DGT-SES-005: restore resumes throwing; reset goes back to Set Tee', () => {
  const s = step(initialWorkflow(), { type: 'restore', tee: markAt(0, 0), aim: markAt(30, 30) });
  assert.equal(s.stage.name, 'throw');
  assert.equal(step(s, { type: 'reset-tee' }).stage.name, 'tee');
});

test('events for another stage are ignored', () => {
  const s = initialWorkflow();
  assert.equal(step(s, { type: 'confirm' }), s);
  assert.equal(step(s, { type: 'disc-marked', mark: markAt(0, 1) }), s);
  assert.equal(step(ready(), { type: 'tee-marked', mark: markAt(0, 0) }).stage.name, 'throw');
});

test('a failed mark raises a notice and stays put', () => {
  const s = step(ready(), { type: 'mark-failed', what: 'disc' });
  assert.equal(s.stage.name, 'throw');
  assert.deepEqual(s.notice, { kind: 'no-fixes', what: 'disc' });
});
