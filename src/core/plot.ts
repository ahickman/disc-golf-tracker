// Layout for the throw plot (DGT-PLT-001, DGT-PLT-006): throw coordinates drawn with the tee at the bottom centre
// and the centre line pointing up, at the same scale both ways so the picture is true to the field.

import { type DistanceUnit, METERS_PER_FOOT } from './units.ts';

export interface PlotPoint {
  downrangeM: number;
  crossRangeM: number;
}

/** The plot always shows at least this much, so a first short throw is not drawn huge. */
export const MIN_DOWNRANGE_M = 40;
export const MIN_HALF_WIDTH_M = 10;
/** Room below the tee, pixels, for the tee marker and throws that landed slightly behind it. */
export const TEE_MARGIN_PX = 28;

export interface PlotFrame {
  widthPx: number;
  heightPx: number;
  /** Pixels per meter, the same both ways. */
  scale: number;
  teeX: number;
  teeY: number;
  /** Distance shown from the tee to the top edge, and from the centre line to each side, meters. */
  maxDownrangeM: number;
  halfWidthM: number;
}

/** A frame that fits every point (with a margin) in a widthPx x heightPx area at equal scale. */
export function plotFrame(points: readonly PlotPoint[], widthPx: number, heightPx: number): PlotFrame {
  let down = MIN_DOWNRANGE_M;
  let half = MIN_HALF_WIDTH_M;
  for (const p of points) {
    down = Math.max(down, p.downrangeM * 1.08);
    half = Math.max(half, Math.abs(p.crossRangeM) * 1.15);
  }
  const usableHeight = Math.max(1, heightPx - TEE_MARGIN_PX);
  const scale = Math.min(widthPx / (2 * half), usableHeight / down);
  return {
    widthPx,
    heightPx,
    scale,
    teeX: widthPx / 2,
    teeY: heightPx - TEE_MARGIN_PX,
    maxDownrangeM: usableHeight / scale,
    halfWidthM: widthPx / (2 * scale),
  };
}

export function toScreen(frame: PlotFrame, p: PlotPoint): { x: number; y: number } {
  return { x: frame.teeX + p.crossRangeM * frame.scale, y: frame.teeY - p.downrangeM * frame.scale };
}

/**
 * Downrange grid lines: a round step (1, 2 or 5 times a power of ten, in the display unit) giving at most
 * `maxLines` lines. Returns each line's distance in meters and its label value in the display unit.
 */
export function gridLines(
  maxDownrangeM: number,
  unit: DistanceUnit,
  maxLines = 6,
): { meters: number; label: number }[] {
  const perUnit = unit === 'ft' ? METERS_PER_FOOT : 1;
  const range = maxDownrangeM / perUnit;
  let step = 1;
  for (let power = 1; ; power *= 10) {
    const found = [1, 2, 5].map((m) => m * power).find((s) => range / s <= maxLines);
    if (found !== undefined) {
      step = found;
      break;
    }
  }
  const lines: { meters: number; label: number }[] = [];
  for (let v = step; v <= range; v += step) lines.push({ meters: v * perUnit, label: v });
  return lines;
}

/**
 * Blue ramp for throw numbers (DGT-PLT-008): ordinal, one hue, light to dark, validated with the dataviz
 * palette checks (monotone lightness, visible steps, lightest step 3.5:1 on white so white numbers stay legible).
 */
export const THROW_RAMP = ['#3987e5', '#256abf', '#184f95', '#0d366b'] as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Colour of throw `seq` (1-based) out of `count` in a session: the first throw lightest, the latest darkest. The
 * number drawn on each dot carries the identity; the colour shows early versus late at a glance.
 */
export function throwColour(seq: number, count: number): string {
  const t = count <= 1 ? 1 : Math.min(1, Math.max(0, (seq - 1) / (count - 1)));
  const x = t * (THROW_RAMP.length - 1);
  const i = Math.min(Math.floor(x), THROW_RAMP.length - 2);
  const f = x - i;
  const a = hexToRgb(THROW_RAMP[i]);
  const b = hexToRgb(THROW_RAMP[i + 1]);
  return `#${a
    .map((v, k) => Math.round(v + (b[k] - v) * f))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}
