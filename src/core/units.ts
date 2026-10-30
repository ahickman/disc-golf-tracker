// Display units and formatting (DGT-UNI-001..003). Everything is stored in metres; conversion happens only here.

export type DistanceUnit = 'm' | 'ft';

export const METRES_PER_FOOT = 0.3048;

export function feet(n: number): number {
  return n * METRES_PER_FOOT;
}

/** Distance in the display unit, rounded to the display resolution: nearest metre or nearest foot (DGT-UNI-003). */
export function roundedDistance(metres: number, unit: DistanceUnit): number {
  const v = Math.round(unit === 'ft' ? metres / METRES_PER_FOOT : metres);
  return v === 0 ? 0 : v; // no "-0"
}

export function formatDistance(metres: number, unit: DistanceUnit): string {
  return `${roundedDistance(metres, unit)} ${unit}`;
}

/** Cross range as a magnitude with a side, e.g. "4 m right" (positive = right of the line, see geometry.ts). */
export function formatCrossRange(metres: number, unit: DistanceUnit): string {
  const v = roundedDistance(Math.abs(metres), unit);
  if (v === 0) return `0 ${unit}`;
  return `${v} ${unit} ${metres > 0 ? 'right' : 'left'}`;
}

export function formatAccuracy(metres: number, unit: DistanceUnit): string {
  return `±${roundedDistance(metres, unit)} ${unit}`;
}
