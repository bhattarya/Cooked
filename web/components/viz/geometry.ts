export type Side = "top" | "bottom" | "left" | "right" | "none";
export type Orientation = "vertical" | "horizontal";

/** Point on a circle. 0 degrees is 12 o'clock, clockwise (matches d3-shape's arc angles once converted). */
export const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  // rounded so server and client Math.sin/cos agree to the last digit (no hydration mismatch)
  return [Math.round((cx + r * Math.cos(a)) * 1000) / 1000, Math.round((cy + r * Math.sin(a)) * 1000) / 1000];
};
export const rad = (deg: number): number => (deg * Math.PI) / 180;
export const deg = (r: number): number => (r * 180) / Math.PI;

/**
 * A rounded rectangle with only the `end` side rounded (the data end). The baseline side stays square
 * so bars grow from a single straight baseline.
 */
export function barPath(x: number, y: number, w: number, h: number, r: number, end: Side): string {
  if (w <= 0 || h <= 0) return "";
  const rr = Math.max(0, Math.min(r, w / 2, h));
  const rh = Math.max(0, Math.min(r, h / 2, w));
  const R = end === "top" || end === "bottom" ? rr : rh;
  const x2 = x + w;
  const y2 = y + h;
  switch (end) {
    case "top":
      return `M${x},${y2}V${y + R}A${R},${R} 0 0 1 ${x + R},${y}H${x2 - R}A${R},${R} 0 0 1 ${x2},${y + R}V${y2}Z`;
    case "bottom":
      return `M${x},${y}V${y2 - R}A${R},${R} 0 0 0 ${x + R},${y2}H${x2 - R}A${R},${R} 0 0 0 ${x2},${y2 - R}V${y}Z`;
    case "right":
      return `M${x},${y}H${x2 - R}A${R},${R} 0 0 1 ${x2},${y + R}V${y2 - R}A${R},${R} 0 0 1 ${x2 - R},${y2}H${x}Z`;
    case "left":
      return `M${x2},${y}H${x + R}A${R},${R} 0 0 0 ${x},${y + R}V${y2 - R}A${R},${R} 0 0 0 ${x + R},${y2}H${x2}Z`;
    default:
      return `M${x},${y}H${x2}V${y2}H${x}Z`;
  }
}

/** Rectangle for a bar spanning value pixels [v0, v1] inside a category band centred on `pos`. */
export function bandRect(o: Orientation, pos: number, thick: number, v0: number, v1: number) {
  const lo = Math.min(v0, v1);
  const len = Math.abs(v1 - v0);
  return o === "vertical" ? { x: pos - thick / 2, y: lo, w: thick, h: len } : { x: lo, y: pos - thick / 2, w: len, h: thick };
}

/** Which side of a bar is its data end, given the direction the value axis grows. */
export const endSide = (o: Orientation, v0: number, v1: number): Side => (o === "vertical" ? (v1 <= v0 ? "top" : "bottom") : v1 >= v0 ? "right" : "left");

/* Cheap text measurement: good enough to budget label columns without a canvas round trip. */
export const monoWidth = (text: string, size: number): number => text.length * size * 0.6;
export const sansWidth = (text: string, size: number): number => text.length * size * 0.54;

/** Truncate with an ellipsis so the text fits `maxPx` at the given size (sans metrics). */
export function ellipsize(text: string, maxPx: number, size: number, factor = 0.54): string {
  const max = Math.max(1, Math.floor(maxPx / (size * factor)));
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** Break a label into at most `lines` lines of about `maxChars` characters; any overflow is folded into the last line and clipped with an ellipsis. */
export function wrapLabel(text: string, maxChars: number, lines = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if (`${cur} ${w}`.length <= maxChars) cur += ` ${w}`;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  const clip = (l: string) => (l.length > maxChars ? `${l.slice(0, Math.max(1, maxChars - 1))}\u2026` : l);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = `${kept[lines - 1]} ${out.slice(lines).join(" ")}`;
    return kept.map(clip);
  }
  return out.map(clip);
}

/** Linear interpolation of a sorted polyline at x (clamped to the ends). */
export function interpAt(points: readonly (readonly [number, number])[], x: number): number {
  if (!points.length) return NaN;
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= x) lo = mid;
    else hi = mid;
  }
  const [x0, y0] = points[lo];
  const [x1, y1] = points[hi];
  return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

/** Trapezoidal area under a polyline (used for AUC when a curve arrives without one). */
export function trapezoid(points: readonly (readonly [number, number])[]): number {
  let a = 0;
  for (let i = 1; i < points.length; i++) a += ((points[i][0] - points[i - 1][0]) * (points[i][1] + points[i - 1][1])) / 2;
  return a;
}
