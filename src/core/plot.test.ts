import assert from 'node:assert/strict';
import { test } from 'node:test';

import { gridLines, MIN_DOWNRANGE_M, plotFrame, THROW_RAMP, throwColour, toScreen } from './plot.ts';

test('DGT-PLT-001: the tee is at the bottom centre and downrange points straight up', () => {
  const f = plotFrame([{ downrangeM: 80, crossRangeM: 0 }], 360, 320);
  assert.equal(f.teeX, 180);
  const p = toScreen(f, { downrangeM: 50, crossRangeM: 0 });
  assert.equal(p.x, 180);
  assert.ok(p.y < f.teeY);
  const right = toScreen(f, { downrangeM: 50, crossRangeM: 5 });
  assert.ok(right.x > 180); // right of the line is drawn to the right
});

test('DGT-PLT-006: every point fits inside the plot', () => {
  const points = [
    { downrangeM: 112, crossRangeM: -9 },
    { downrangeM: 95, crossRangeM: 31 },
    { downrangeM: -2, crossRangeM: 1 },
  ];
  for (const [w, h] of [
    [360, 320],
    [400, 200],
    [300, 600],
  ]) {
    const f = plotFrame(points, w, h);
    for (const pt of points) {
      const { x, y } = toScreen(f, pt);
      assert.ok(x > 0 && x < w && y > 0 && y < h, `${JSON.stringify(pt)} at ${x},${y} in ${w}x${h}`);
    }
  }
});

test('DGT-PLT-001: the scale is the same both ways, and an empty plot shows a sensible minimum', () => {
  const f = plotFrame([], 360, 320);
  assert.ok(f.maxDownrangeM >= MIN_DOWNRANGE_M);
  const a = toScreen(f, { downrangeM: 10, crossRangeM: 0 });
  const b = toScreen(f, { downrangeM: 0, crossRangeM: 10 });
  assert.ok(Math.abs(f.teeY - a.y - (b.x - f.teeX)) < 1e-9);
});

test('DGT-PLT-001: grid lines use round steps in the display unit', () => {
  assert.deepEqual(
    gridLines(105, 'm').map((l) => l.label),
    [20, 40, 60, 80, 100],
  );
  assert.deepEqual(
    gridLines(45, 'm').map((l) => l.label),
    [10, 20, 30, 40],
  );
  const ft = gridLines(100, 'ft'); // 328 ft
  assert.deepEqual(
    ft.map((l) => l.label),
    [100, 200, 300],
  );
  assert.ok(Math.abs(ft[0].meters - 30.48) < 1e-9);
});

test('DGT-PLT-008: throw colours run from the lightest ramp step (first) to the darkest (latest)', () => {
  assert.equal(throwColour(1, 10), THROW_RAMP[0]);
  assert.equal(throwColour(10, 10), THROW_RAMP[3]);
  assert.equal(throwColour(1, 1), THROW_RAMP[3]);
  assert.equal(throwColour(2, 4), THROW_RAMP[1]);
  const mid = throwColour(5, 9); // halfway: between steps 1 and 2
  assert.match(mid, /^#[0-9a-f]{6}$/);
  assert.notEqual(mid, THROW_RAMP[1]);
  assert.notEqual(mid, THROW_RAMP[2]);
});
