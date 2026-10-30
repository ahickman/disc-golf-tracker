// Display units and formatting (DGT-UNI-001..003). Everything is stored in meters; conversion happens only here.

export type DistanceUnit = 'm' | 'ft';

export const METERS_PER_FOOT = 0.3048;

export function feet(n: number): number {
  return n * METERS_PER_FOOT;
}

/** Distance in the display unit, rounded to the display resolution: nearest meter or nearest foot (DGT-UNI-003). */
export function roundedDistance(meters: number, unit: DistanceUnit): number {
  const v = Math.round(unit === 'ft' ? meters / METERS_PER_FOOT : meters);
  return v === 0 ? 0 : v; // no "-0"
}

export function formatDistance(meters: number, unit: DistanceUnit): string {
  return `${roundedDistance(meters, unit)} ${unit}`;
}

/** Cross range as a magnitude with a side, e.g. "4 m right" (positive = right of the line, see geometry.ts). */
export function formatCrossRange(meters: number, unit: DistanceUnit): string {
  const v = roundedDistance(Math.abs(meters), unit);
  if (v === 0) return `0 ${unit}`;
  return `${v} ${unit} ${meters > 0 ? 'right' : 'left'}`;
}

export function formatAccuracy(meters: number, unit: DistanceUnit): string {
  return `±${roundedDistance(meters, unit)} ${unit}`;
}
