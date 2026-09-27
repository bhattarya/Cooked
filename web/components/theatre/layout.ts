// Pure layout maths for the stage: where the ring, orb and node cards go for a given
// viewport and step count. Kept free of React so it is easy to reason about and test.

export interface NodePos {
  x: number;
  y: number;
  /** radians clockwise from twelve o'clock */
  angle: number;
  side: "l" | "r";
  /** top edge of the node's card */
  cardTop: number;
}

export interface OrbitalLayout {
  kind: "orbital";
  w: number;
  h: number;
  /** centre of the ring, and of the orb (shifted up a little to leave room for the caption) */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  orb: number;
  orbY: number;
  bead: number;
  cardW: number;
  cardH: number;
  compact: boolean;
  /** bottom edge of the title block (estimated), which left-hand cards must clear */
  headerBottom: number;
  evidence: { x: number; w: number } | null;
  nodes: NodePos[];
}

export interface TimelineLayout {
  kind: "timeline";
  w: number;
  h: number;
  /** orb column beside the list (short landscape screens) instead of above it */
  split: boolean;
  orb: number;
  compact: boolean;
}

export type StageLayout = OrbitalLayout | TimelineLayout;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const angleOf = (i: number, n: number) => (i / n) * Math.PI * 2;

export function pointOn(l: Pick<OrbitalLayout, "cx" | "cy" | "rx" | "ry">, angle: number) {
  return { x: l.cx + l.rx * Math.sin(angle), y: l.cy - l.ry * Math.cos(angle) };
}

// One calm, legible stage: a title + orb beside (wide screens) or above (narrow/tall screens) a single
// vertical list of steps, one thing animating at a time. No ring, no simultaneous constellation of motion.
export function computeLayout(w: number, h: number, n: number): StageLayout {
  const count = Math.max(1, n);
  const split = w >= 760 && w > h * 1.05;
  const compact = count >= 8 || (h < 700 && count >= 6);
  const orb = split ? clamp(h * 0.4, 140, 230) : compact ? 92 : clamp(Math.min(w, h) * 0.22, 108, 168);
  return { kind: "timeline", w, h, split, orb, compact };
}

// A polyline along the ring between two angles, for SVG `d`.
export function ringPath(l: Pick<OrbitalLayout, "cx" | "cy" | "rx" | "ry">, a0: number, a1: number) {
  const steps = Math.max(2, Math.ceil(((a1 - a0) * 180) / Math.PI / 3));
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const p = pointOn(l, a0 + ((a1 - a0) * i) / steps);
    d += `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return d;
}

// An arc of a circle (the orb's bezel), for SVG `d`.
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => `${(cx + r * Math.sin(a)).toFixed(1)} ${(cy - r * Math.cos(a)).toFixed(1)}`;
  return `M${p(a0)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
}
