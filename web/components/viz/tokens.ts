// Design tokens for the chart library. SVG/HTML can use the `var(--…)` strings directly;
// canvas cannot, so `cssVar()` resolves a token to its literal value (with a static fallback
// that mirrors globals.css so SSR and tests still get real colours).

export const FONT_NUM = "var(--f-mono), ui-monospace, monospace";
export const FONT_DISPLAY = 'var(--f-display), "Arial Narrow", sans-serif';
export const FONT_SANS = "var(--f-sans), system-ui, sans-serif";

/** The eight categorical hues in their fixed assignment order. Never generate a ninth: fold to "Other". */
export const VIZ = [
  "var(--viz-1)",
  "var(--viz-2)",
  "var(--viz-3)",
  "var(--viz-4)",
  "var(--viz-5)",
  "var(--viz-6)",
  "var(--viz-7)",
  "var(--viz-8)",
] as const;

// Default order for unassigned series. Validated on the panel surface (scripts/validate_palette.js): with
// violet (--viz-3) directly beside ice (--viz-4) the pair scores CVD deltaE 0.6 and normal-vision 8.6 (hard
// floor is 15), so ember (--viz-5) is seated between them. Slots 1-6 then clear CVD deltaE 8. Colour still
// follows the entity: pass `color` explicitly for anything with a fixed identity (see PATTERN_COLORS).
const ORDER = [0, 1, 2, 4, 3, 5, 6, 7];
/** Default categorical colour for series `i` (0-based). Beyond eight it wraps; fold the tail into "Other" instead. */
export const viz = (i: number): string => VIZ[ORDER[((i % ORDER.length) + ORDER.length) % ORDER.length]];

/** Sequential ramp, low to high (dark amber to pale gold). */
export const SEQ = ["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)"] as const;

const FALLBACK: Record<string, string> = {
  "--bg": "#0a0805",
  "--panel": "#13100a",
  "--panel-2": "#1a150d",
  "--line": "rgba(255, 220, 140, 0.08)",
  "--line-2": "rgba(255, 220, 140, 0.16)",
  "--text": "#f8f1e1",
  "--muted": "#a89f8a",
  "--dim": "#6f6858",
  "--gold": "#f6b41a",
  "--gold-hi": "#ffd15c",
  "--gold-lo": "#b97a06",
  "--ember": "#ff7a1a",
  "--cream": "#fff8e7",
  "--hot": "#ff4a3d",
  "--cool": "#3ddbb4",
  "--ice": "#7fb8ff",
  "--violet": "#b7a1ff",
  "--rose": "#ff6b9a",
  "--viz-1": "#f6b41a",
  "--viz-2": "#3ddbb4",
  "--viz-3": "#b7a1ff",
  "--viz-4": "#7fb8ff",
  "--viz-5": "#ff7a1a",
  "--viz-6": "#ff6b9a",
  "--viz-7": "#b5e05a",
  "--viz-8": "#e8d9b0",
  "--seq-1": "#2a1f0a",
  "--seq-2": "#6b4a0a",
  "--seq-3": "#b97a06",
  "--seq-4": "#f6b41a",
  "--seq-5": "#ffe08a",
  "--div-good": "#3ddbb4",
  "--div-mid": "#f6b41a",
  "--div-bad": "#ff4a3d",
};

const cache = new Map<string, string>();

/** Resolve a CSS custom property to its literal value. Accepts `--name`, `name` or `var(--name)`. */
export function cssVar(name: string, fallback?: string): string {
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(name.trim());
  const key = m ? m[1] : name.startsWith("--") ? name : `--${name}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
    if (v) {
      cache.set(key, v);
      return v;
    }
  }
  return fallback ?? m?.[2] ?? FALLBACK[key] ?? "#ffffff";
}

/** Resolve any colour string that may be a `var(--x)` reference to a literal colour (for canvas / interpolation). */
export const resolveColor = (c: string): string => (c.startsWith("var(") ? cssVar(c) : c);

/** Translucent version of any colour, `var()` included, for inline styles and SVG `style` props. */
export const alpha = (color: string, a: number): string => `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, transparent)`;

/** Risk thresholds shared by every risk visual: below 20% low, 20-50% elevated, 50%+ high (cooked). */
export const RISK_THRESHOLDS = { elevated: 0.2, high: 0.5 } as const;
export type RiskLevel = "low" | "elevated" | "high";

export const riskLevel = (v: number): RiskLevel => (v >= RISK_THRESHOLDS.high ? "high" : v >= RISK_THRESHOLDS.elevated ? "elevated" : "low");
const RISK_TONE: Record<RiskLevel, string> = { low: "var(--cool)", elevated: "var(--gold)", high: "var(--hot)" };
/** Red = risk, gold = watch, teal = safe. Pair with `riskLevel()` text so colour is never the only channel. */
export const riskTone = (v: number): string => RISK_TONE[riskLevel(v)];

/** Trajectory-cluster colours: semantic where the meaning is obvious (smooth = safe, spiral = risk). */
export const PATTERN_COLORS: Record<string, string> = {
  smooth: "var(--viz-2)",
  "rough patch": "var(--viz-1)",
  "part-time grind": "var(--viz-3)",
  "withdrawal spiral": "var(--hot)",
  "stop-out": "var(--viz-4)",
};
export const patternColor = (name: string, fallbackIndex = 0): string => PATTERN_COLORS[name] ?? viz(fallbackIndex);

/** WCAG relative luminance (0-1) of a literal colour, to pick readable text over a fill. */
export function luminance(color: string): number {
  const c = resolveColor(color);
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  let r = 0;
  let g = 0;
  let b = 0;
  if (m) {
    const n = parseInt(m[1], 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  } else {
    const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c);
    if (rgb) [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
