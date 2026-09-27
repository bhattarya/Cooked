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

export interface HeaderText {
  title: string;
  subtitle?: string;
}

// Where the title block ends, estimated from its text (Big Shoulders runs about half an em per capital).
function headerBottom(w: number, arenaW: number, { title, subtitle }: HeaderText) {
  const fs = clamp(w * 0.044, 38, 67);
  const maxW = Math.max(280, arenaW * 0.36);
  const lines = Math.max(1, Math.ceil((title.length * fs * 0.52) / maxW));
  const sub = subtitle ? 10 + 20 * Math.max(1, Math.ceil((subtitle.length * 7.2) / Math.min(maxW, 290))) : 0;
  return 28 + 14 + 8 + lines * fs * 0.92 + sub;
}

export function computeLayout(w: number, h: number, n: number, header: HeaderText): StageLayout {
  const count = Math.max(1, n);
  if (w < 900 || h < 560) {
    const split = w >= 640 && w > h;
    const compact = count >= 8 || (h < 700 && count >= 6);
    return { kind: "timeline", w, h, split, orb: split ? clamp(h * 0.36, 120, 200) : compact ? 88 : clamp(h * 0.17, 96, 140), compact };
  }

  const compact = count >= 8;
  const evW = w >= 1120 ? clamp(w * 0.235, 300, 360) : 0;
  const arenaW = w - evW;
  const ringTop = 60;
  const footerH = 30;
  const bead = compact ? 42 : 50;
  const cardH = compact ? 100 : 120;
  const cardW = clamp(arenaW * 0.2, 184, 240);
  const gap = 14;

  const rx = Math.max(150, arenaW / 2 - (bead / 2 + gap + cardW) - 18);
  // a very tall ring reads as an egg, so the height is capped relative to the width
  const ry = Math.max(150, Math.min((h - ringTop - footerH) / 2 - bead / 2 - 4, rx * 1.15));
  const cx = arenaW / 2;
  const cy = ringTop + (h - ringTop - footerH) / 2;
  const hb = headerBottom(w, arenaW, header);
  const orb = Math.round(clamp(Math.min(ry * 0.92, rx * 0.86), 110, 300));
  const orbY = cy - Math.min(30, orb * 0.12);

  const base = Array.from({ length: count }, (_, i) => {
    const angle = angleOf(i, count);
    const p = pointOn({ cx, cy, rx, ry }, angle);
    // a node exactly on the vertical axis reads as "right" so the first step's card sits beside it
    const side: "l" | "r" = Math.sin(angle) < -1e-6 ? "l" : "r";
    // cards sit radially outside the ring where it runs across them: up in the top half, down in the bottom
    return { ...p, angle, side, cardTop: p.y - cardH / 2 - Math.cos(angle) * cardH * 0.4 };
  });

  // cards on the same side must not overlap: honour the title block, push down, then pull the stack back up if it overflows
  const bottom = h - footerH + 4;
  for (const side of ["l", "r"] as const) {
    const col = base.filter((b) => b.side === side).sort((a, b) => a.y - b.y);
    if (!col.length) continue;
    col[0].cardTop = Math.max(col[0].cardTop, side === "l" ? hb + 8 : 12);
    for (let i = 1; i < col.length; i++) col[i].cardTop = Math.max(col[i].cardTop, col[i - 1].cardTop + cardH + 4);
    for (let i = col.length - 1; i >= 0; i--) {
      const room = i === col.length - 1 ? bottom - cardH : col[i + 1].cardTop - cardH - 4;
      col[i].cardTop = Math.min(col[i].cardTop, room);
    }
  }

  return { kind: "orbital", w, h, cx, cy, rx, ry, orb, orbY, bead, cardW, cardH, compact, headerBottom: hb, evidence: evW ? { x: arenaW, w: evW } : null, nodes: base };
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
