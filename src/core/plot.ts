// Layout for the throw plot (DGT-PLT-001, DGT-PLT-006): throw coordinates drawn with the tee at the bottom centre
// and the centre line pointing up, at the same scale both ways so the picture is true to the field.

import { type DistanceUnit, METRES_PER_FOOT } from './units.ts';

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
  /** Pixels per metre, the same both ways. */
  scale: number;
  teeX: number;
  teeY: number;
  /** Distance shown from the tee to the top edge, and from the centre line to each side, metres. */
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
 * `maxLines` lines. Returns each line's distance in metres and its label value in the display unit.
 */
export function gridLines(
  maxDownrangeM: number,
  unit: DistanceUnit,
  maxLines = 6,
): { metres: number; label: number }[] {
  const perUnit = unit === 'ft' ? METRES_PER_FOOT : 1;
  const range = maxDownrangeM / perUnit;
  let step = 1;
  for (let power = 1; ; power *= 10) {
    const found = [1, 2, 5].map((m) => m * power).find((s) => range / s <= maxLines);
    if (found !== undefined) {
      step = found;
      break;
    }
  }
  const lines: { metres: number; label: number }[] = [];
  for (let v = step; v <= range; v += step) lines.push({ metres: v * perUnit, label: v });
  return lines;
}
