// Ink ramps for the orb. The engine hands every dot a `white` value (0 = nearest and
// brightest, 1 = farthest); we map it along pale gold -> gold-hi -> gold -> gold-lo -> ember-black
// so depth reads as molten gold rather than the library's flat white. The nearest dots stop
// short of cream on purpose: dense modes (shaping, composing) would bloom to pure white.
export type OrbTone = "gold" | "ember" | "hot" | "cool";
type RGB = [number, number, number];

const STOPS: Record<OrbTone, RGB[]> = {
  gold: [[255, 228, 140], [255, 200, 64], [246, 172, 20], [172, 110, 6], [52, 32, 4]],
  ember: [[255, 214, 160], [255, 158, 70], [255, 118, 22], [168, 72, 6], [56, 26, 4]],
  hot: [[255, 196, 186], [255, 112, 92], [255, 70, 56], [164, 32, 24], [58, 14, 10]],
  cool: [[190, 250, 232], [104, 232, 196], [61, 219, 180], [24, 130, 106], [6, 42, 34]],
};

export const LUT_SIZE = 48;

export function buildLut(tone: OrbTone): RGB[] {
  const stops = STOPS[tone];
  return Array.from({ length: LUT_SIZE }, (_, i) => {
    const p = (i / (LUT_SIZE - 1)) * (stops.length - 1);
    const a = stops[Math.min(stops.length - 2, Math.floor(p))];
    const b = stops[Math.min(stops.length - 1, Math.floor(p) + 1)];
    const f = p - Math.min(stops.length - 2, Math.floor(p));
    return [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * f)) as RGB;
  });
}

export const lutIndex = (white: number) => Math.round(Math.min(1, Math.max(0, white)) * (LUT_SIZE - 1));

export const rgb = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;
