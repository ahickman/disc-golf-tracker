import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bearingDeg, fromLocal, toLocal } from './geo.ts';
import type { LatLon } from './types.ts';
import { feet } from './units.ts';

// Independent reference: Vincenty's inverse formula for the geodesic distance on the WGS-84 ellipsoid.
function vincentyDistance(p1: LatLon, p2: LatLon): number {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const b = a * (1 - f);
  const rad = Math.PI / 180;
  const L = (p2.lon - p1.lon) * rad;
  const U1 = Math.atan((1 - f) * Math.tan(p1.lat * rad));
  const U2 = Math.atan((1 - f) * Math.tan(p2.lat * rad));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);
  let lambda = L;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let cos2Alpha = 0;
  let cos2SigmaM = 0;
  for (let i = 0; i < 200; i++) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.hypot(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
    if (sinSigma === 0) return 0;
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cos2Alpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cos2Alpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cos2Alpha;
    const C = (f / 16) * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));
    const prev = lambda;
    lambda =
      L +
      (1 - C) *
        f *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda - prev) < 1e-13) break;
  }
  const u2 = (cos2Alpha * (a * a - b * b)) / (b * b);
  const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  return b * A * (sigma - deltaSigma);
}

const ORIGINS: LatLon[] = [
  { lat: 0, lon: 0 },
  { lat: 47.6062, lon: -122.3321 },
  { lat: 64.84, lon: -147.72 },
  { lat: -33.8688, lon: 151.2093 },
  { lat: 51.5, lon: 179.9995 }, // just west of the antimeridian
];

test('DGT-THR-005: horizontal distance matches the WGS-84 geodesic to 0.1 ft within 1 km', () => {
  for (const origin of ORIGINS) {
    for (let bearing = 0; bearing < 360; bearing += 15) {
      for (const d of [10, 100, 300, 1000]) {
        const b = (bearing * Math.PI) / 180;
        const p = fromLocal(origin, { east: d * Math.sin(b), north: d * Math.cos(b) });
        const err = Math.abs(d - vincentyDistance(origin, p));
        assert.ok(err < feet(0.1), `origin ${JSON.stringify(origin)} bearing ${bearing} d ${d}: error ${err} m`);
      }
    }
  }
});

test('DGT-THR-005: fromLocal inverts toLocal to a millimeter', () => {
  for (const origin of ORIGINS) {
    for (const local of [
      { east: 0, north: 0 },
      { east: 123.4, north: -56.7 },
      { east: -800, north: 600 },
    ]) {
      const back = toLocal(origin, fromLocal(origin, local));
      assert.ok(Math.abs(back.east - local.east) < 1e-3);
      assert.ok(Math.abs(back.north - local.north) < 1e-3);
    }
  }
});

test('DGT-THR-005: a pure latitude change maps to north, a pure longitude change to east', () => {
  const origin = { lat: 45, lon: 10 };
  const n = toLocal(origin, { lat: 45.001, lon: 10 });
  assert.ok(Math.abs(n.east) < 1e-6);
  assert.ok(Math.abs(n.north - 111.13) < 0.01, `north ${n.north}`); // ~111.13 m per 0.001° latitude at 45°
  const e = toLocal(origin, { lat: 45, lon: 10.001 });
  assert.ok(e.east > 78.8 && e.east < 78.9, `east ${e.east}`); // ~78.85 m per 0.001° longitude at 45°
});

test('bearingDeg measures clockwise from north in [0, 360)', () => {
  assert.equal(bearingDeg({ east: 0, north: 1 }), 0);
  assert.equal(bearingDeg({ east: 1, north: 0 }), 90);
  assert.equal(bearingDeg({ east: 0, north: -1 }), 180);
  assert.equal(bearingDeg({ east: -1, north: 0 }), 270);
});
