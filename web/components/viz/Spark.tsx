"use client";

import { useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { curveMonotoneX, line as d3line, area as d3area, scaleLinear, extent } from "d3";
import { easeInOutCubic, easeOutExpo, useChartSize, useEntry, useInView, useTweenValue } from "./hooks";
import { FONT_NUM } from "./tokens";
import s from "./viz.module.css";

/* --------------------------------- CountUp --------------------------------- */

export interface CountUpProps {
  value: number;
  /** Formats the animated number. Default: rounded integer. */
  format?: (v: number) => string;
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

/** A number that rolls up from zero when it scrolls into view and re-rolls when the value changes. */
export function CountUp({ value, format = (v) => String(Math.round(v)), duration = 1100, className, style }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  const v = useTweenValue(value, { duration, enabled: inView, ease: easeOutExpo });
  return (
    <span ref={ref} className={className} style={style}>
      <span className={s.sr}>{format(value)}</span>
      <span aria-hidden="true">{format(v)}</span>
    </span>
  );
}

/* ---------------------------------- Delta ---------------------------------- */

export interface DeltaProps {
  /** Signed change. Zero renders a flat, neutral badge. */
  value: number;
  /** Formats the magnitude (sign is added for you). Default: `value.toFixed(digits)`. */
  format?: (magnitude: number) => string;
  digits?: number;
  /** Unit appended to the magnitude, e.g. "pts", "%", "y". */
  unit?: string;
  /** Which direction is an improvement. "down" for risk, "neutral" when direction has no verdict. */
  goodWhen?: "up" | "down" | "neutral";
  /** What it is measured against, e.g. "vs last term". Shown dim, and included in the aria label. */
  label?: string;
  size?: "sm" | "lg";
}

const TONE = { good: "var(--cool)", bad: "var(--hot)", neutral: "var(--muted)" } as const;

/** Change badge. Direction is a glyph AND a signed number AND a colour; colour is never the only channel. */
export function Delta({ value, format, digits = 1, unit = "", goodWhen = "up", label, size = "sm" }: DeltaProps) {
  const flat = Math.abs(value) < 10 ** -(digits + 1);
  const up = value > 0;
  const verdict = flat || goodWhen === "neutral" ? "neutral" : (up && goodWhen === "up") || (!up && goodWhen === "down") ? "good" : "bad";
  const mag = format ? format(Math.abs(value)) : Math.abs(value).toFixed(digits);
  const glyph = flat ? "▬" : up ? "▲" : "▼";
  const text = `${flat ? "" : up ? "+" : "−"}${mag}${unit ? ` ${unit}` : ""}`;
  const say = flat ? "no change" : `${up ? "up" : "down"} ${mag}${unit ? ` ${unit}` : ""}${verdict === "neutral" ? "" : verdict === "good" ? ", better" : ", worse"}`;
  return (
    <span className={s.delta} data-size={size} style={{ ["--tone" as string]: TONE[verdict] }} role="img" aria-label={label ? `${say} ${label}` : say}>
      <span aria-hidden="true" style={{ fontSize: "0.78em" }}>
        {glyph}
      </span>
      <span aria-hidden="true">{text}</span>
      {label && (
        <span aria-hidden="true" style={{ color: "var(--dim)", marginLeft: 2 }}>
          {label}
        </span>
      )}
    </span>
  );
}

/* -------------------------------- Sparkline -------------------------------- */

export interface SparklineProps {
  data: number[];
  /** Pixel width, or "fill" to take the container's width. Default 96. */
  width?: number | "fill";
  height?: number;
  color?: string;
  kind?: "line" | "bars";
  /** Faint wash under the line. */
  area?: boolean;
  /** Emphasise the latest point with a dot (default true). */
  highlightLast?: boolean;
  /** Value formatter for the hover readout and aria label. */
  format?: (v: number) => string;
  /** Names what the series is, for the aria label ("risk per term"). */
  label?: string;
  domain?: [number, number];
  className?: string;
}

/** Tiny trend line. Word-sized, with a hover readout and an aria summary (first, last, min, max). */
export function Sparkline({ data, width = 96, height = 28, color = "var(--viz-1)", kind = "line", area = false, highlightLast = true, format = (v) => String(Math.round(v * 100) / 100), label = "trend", domain, className }: SparklineProps) {
  const [boxRef, size] = useChartSize<HTMLSpanElement>(height);
  const w = width === "fill" ? size.width : width;
  const inView = useInView(boxRef);
  const p = useEntry(inView, { duration: 900, ease: easeInOutCubic });
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const pad = 4;

  const geo = useMemo(() => {
    const [lo, hi] = domain ?? (extent(data) as [number, number]);
    const y = scaleLinear()
      .domain([lo, hi === lo ? lo + 1 : hi])
      .range([height - pad, pad]);
    const x = scaleLinear()
      .domain([0, Math.max(1, data.length - 1)])
      .range([pad, Math.max(pad + 1, w - pad)]);
    const path = d3line<number>()
      .x((_, i) => x(i))
      .y((d) => y(d))
      .curve(curveMonotoneX)(data);
    const wash = d3area<number>()
      .x((_, i) => x(i))
      .y0(height - pad)
      .y1((d) => y(d))
      .curve(curveMonotoneX)(data);
    return { x, y, path: path ?? "", wash: wash ?? "" };
  }, [data, w, height, domain]);

  if (!data.length) return null;
  const last = data.length - 1;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const summary = `${label}: from ${format(data[0])} to ${format(data[last])}, low ${format(lo)}, high ${format(hi)}`;
  const hi_i = hover ?? last;
  const bw = Math.max(2, Math.min(8, (w - pad * 2) / data.length - 2));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(geo.x.invert(((e.clientX - r.left) / r.width) * w));
    setHover(Math.max(0, Math.min(last, i)));
  };

  return (
    <span ref={boxRef} className={className} style={{ display: width === "fill" ? "block" : "inline-block", position: "relative", width: width === "fill" ? "100%" : w, height, verticalAlign: "middle" }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={summary} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: "block", overflow: "visible" }}>
          <defs>
            <clipPath id={`sp${uid}`}>
              <rect x={0} y={-4} width={(w + 8) * p} height={height + 8} />
            </clipPath>
          </defs>
          <g clipPath={`url(#sp${uid})`}>
            {kind === "bars" ? (
              data.map((d, i) => {
                const y = geo.y(d);
                const base = height - pad;
                return <rect key={i} x={geo.x(i) - bw / 2} y={y} width={bw} height={Math.max(1.5, base - y)} rx={1.5} fill={color} opacity={i === hi_i ? 1 : 0.45} />;
              })
            ) : (
              <>
                {area && <path d={geo.wash} fill={color} opacity={0.12} />}
                <path d={geo.path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </>
            )}
          </g>
          {kind === "line" && highlightLast && p >= 0.98 && <circle cx={geo.x(hi_i)} cy={geo.y(data[hi_i])} r={3.5} fill={color} stroke="var(--panel)" strokeWidth={2} />}
        </svg>
      )}
      {hover !== null && (
        <span style={{ position: "absolute", right: 0, top: -18, fontFamily: FONT_NUM, fontSize: 10.5, color: "var(--text)", background: "rgba(19,16,10,.94)", border: "1px solid var(--line-2)", borderRadius: 6, padding: "1px 6px", pointerEvents: "none", whiteSpace: "nowrap" }} aria-hidden="true">
          {format(data[hover])}
        </span>
      )}
    </span>
  );
}

/* ----------------------------------- Stat ---------------------------------- */

export interface StatProps {
  label: string;
  value: number;
  format?: (v: number) => string;
  /** Small unit after the number (e.g. "years", "credits"). */
  unit?: string;
  delta?: DeltaProps;
  spark?: number[];
  sparkColor?: string;
  caption?: ReactNode;
  size?: "md" | "lg" | "hero";
  /** Tints the number. Reserve for risk figures (`riskTone(v)`); default is the text colour. */
  tone?: string;
  className?: string;
}

const STAT_PX = { md: 40, lg: 64, hero: 104 } as const;

/** Hero figure: label, Big Shoulders number that counts up, optional delta and sparkline. */
export function Stat({ label, value, format, unit, delta, spark, sparkColor, caption, size = "lg", tone, className }: StatProps) {
  return (
    <div className={`${s.stat}${className ? ` ${className}` : ""}`}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue} style={{ fontSize: `clamp(${Math.round(STAT_PX[size] * 0.66)}px, 9vw, ${STAT_PX[size]}px)`, color: tone }}>
        <CountUp value={value} format={format} />
        {unit && <span className={s.statUnit}>{unit}</span>}
      </div>
      {(delta || spark) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
          {delta && <Delta {...delta} />}
          {spark && <Sparkline data={spark} color={sparkColor} label={label} area />}
        </div>
      )}
      {caption && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{caption}</div>}
    </div>
  );
}
