const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 0.427 -> "43%". */
export const pct = (v: number, digits = 0): string => `${(v * 100).toFixed(digits)}%`;
/** 1234.5 -> "1,235". */
export const int = (v: number): string => intFmt.format(v);
/** 12900 -> "12.9K". */
export const compact = (v: number): string => compactFmt.format(v);
/** Nominal dollars: 74500 -> "$75k", 1.2M -> "$1.2M". */
export const money = (v: number): string => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);
/** 4.25 -> "4.3y". */
export const years = (v: number, digits = 1): string => `${v.toFixed(digits)}y`;
/** Signed number: 3 -> "+3", -0.4 -> "-0.4". */
export const signed = (v: number, digits = 0): string => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
/** Escape-free "n=1,234" caption. */
export const nOf = (n: number): string => `n=${intFmt.format(n)}`;
