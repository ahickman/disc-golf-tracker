// Conversion between latitude/longitude and a local east-north plane (DGT-THR-005).
//
// Points go to Earth-centred coordinates on the WGS-84 ellipsoid and are then rotated into the tangent plane at
// the origin. Altitude is ignored (DGT-POS-005): both points are taken at the ellipsoid surface and only the east
// and north components are kept. Within 1 km of the origin this differs from the true ground distance by
// micrometers.

import type { LatLon, Local } from './types.ts';

const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);

const DEG = Math.PI / 180;

function toEcef(p: LatLon): [number, number, number] {
  const phi = p.lat * DEG;
  const lam = p.lon * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
  return [n * cosPhi * Math.cos(lam), n * cosPhi * Math.sin(lam), n * (1 - WGS84_E2) * sinPhi];
}

/** Position of `p` in the east-north tangent plane at `origin`, in meters. */
export function toLocal(origin: LatLon, p: LatLon): Local {
  const [x0, y0, z0] = toEcef(origin);
  const [x, y, z] = toEcef(p);
  const dx = x - x0;
  const dy = y - y0;
  const dz = z - z0;
  const phi = origin.lat * DEG;
  const lam = origin.lon * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLam = Math.sin(lam);
  const cosLam = Math.cos(lam);
  return {
    east: -sinLam * dx + cosLam * dy,
    north: -sinPhi * cosLam * dx - sinPhi * sinLam * dy + cosPhi * dz,
  };
}

/** Radii of curvature at a latitude: meridional (north-south) and prime vertical (east-west), meters. */
function radiiOfCurvature(latDeg: number): { meridional: number; primeVertical: number } {
  const s = Math.sin(latDeg * DEG);
  const w = 1 - WGS84_E2 * s * s;
  return { meridional: (WGS84_A * (1 - WGS84_E2)) / (w * Math.sqrt(w)), primeVertical: WGS84_A / Math.sqrt(w) };
}

/** Inverse of `toLocal`: the latitude/longitude whose local position about `origin` is `local`. */
export function fromLocal(origin: LatLon, local: Local): LatLon {
  const { meridional, primeVertical } = radiiOfCurvature(origin.lat);
  const metersPerDegLat = meridional * DEG;
  const metersPerDegLon = primeVertical * Math.cos(origin.lat * DEG) * DEG;
  let p: LatLon = { lat: origin.lat + local.north / metersPerDegLat, lon: origin.lon + local.east / metersPerDegLon };
  // Newton-style refinement; the first guess is already within millimeters at 1 km, so a few rounds suffice.
  for (let i = 0; i < 4; i++) {
    const got = toLocal(origin, p);
    p = {
      lat: p.lat + (local.north - got.north) / metersPerDegLat,
      lon: p.lon + (local.east - got.east) / metersPerDegLon,
    };
  }
  return p;
}

/** Compass bearing of a local vector, degrees clockwise from true north in [0, 360). */
export function bearingDeg(v: Local): number {
  const b = Math.atan2(v.east, v.north) / DEG;
  return b < 0 ? b + 360 : b;
}
