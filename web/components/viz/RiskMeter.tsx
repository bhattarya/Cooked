"use client";

import { useRef } from "react";
import { arc as d3arc } from "d3";
import { easeOutExpo, useInView, useTween, useTweenValue } from "./hooks";
import { nOf } from "./format";
import { rad, wrapLabel } from "./geometry";
import { FONT_DISPLAY, riskLevel, riskTone } from "./tokens";
import s from "./viz.module.css";

export interface RiskMeterProps {
  /** Risk 0..1. */
  value: number;
  /** Model uncertainty around the value, drawn as a faint ghost arc. */
  range?: { low: number; high: number };
  /** Rendered pixel width (scales down to fit its container). Default 260. */
  size?: number;
  /** Caption under the number. Default "risk of getting cooked". */
  label?: string;
  /** Sample size, shown under the caption. */
  n?: number;
  className?: string;
}

const VB = 240;
const PAD = 12;
const SWEEP = 300; // degrees; a calm, near-complete ring rather than a speedometer's short arc
const LEVEL_WORD = { low: "Low risk", elevated: "Elevated", high: "High risk" } as const;

/**
 * Minimal risk display: one flat colour-filled arc (no needle, no tick marks, no speedometer
 * numerals) behind a single huge number. The number is the message; the arc is just a glance-read
 * of how far into the range it sits.
 */
export function RiskMeter({ value, range, size = 260, label = "risk of getting cooked", n, className }: RiskMeterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const v = Math.max(0, Math.min(1, value));
  const [tv, tlo, thi] = useTween([v, range?.low ?? v, range?.high ?? v], { enabled: inView, duration: 1100, ease: easeOutExpo });
  const shown = useTweenValue(v, { enabled: inView, duration: 1100, ease: easeOutExpo });
  const tone = riskTone(v);
  const level = riskLevel(v);
  const c = VB / 2;
  const R = 100;
  const w = 16;
  const A = (t: number) => -SWEEP / 2 + t * SWEEP;
  const arcGen = d3arc<{ startAngle: number; endAngle: number }>().innerRadius(R - w / 2).outerRadius(R + w / 2).cornerRadius(w / 2);
  const seg = (a: number, b: number) => ({ startAngle: rad(A(a)), endAngle: rad(A(b)) });
  const pctText = Math.round(shown * 100);
  const say = `${label}: ${Math.round(v * 100)} percent, ${LEVEL_WORD[level].toLowerCase()}${range ? `, model range ${Math.round(range.low * 100)} to ${Math.round(range.high * 100)} percent` : ""}${n ? `, based on ${n.toLocaleString("en-US")} cases` : ""}.`;

  return (
    <div ref={ref} className={`${s.root} ${className ?? ""}`} style={{ width: size, maxWidth: "100%" }}>
      <svg viewBox={`${-PAD} ${-PAD} ${VB + 2 * PAD} ${VB + 2 * PAD}`} width="100%" role="img" aria-label={say} style={{ display: "block", overflow: "visible" }}>
        {/* flat track, no thresholds marked on it: colour on the fill alone carries the meaning */}
        <path d={arcGen(seg(0, 1)) ?? ""} transform={`translate(${c} ${c})`} fill="var(--line-2)" opacity={0.6} />
        {range && tlo < thi && <path d={arcGen(seg(tlo, thi)) ?? ""} transform={`translate(${c} ${c})`} fill={tone} opacity={0.2} />}
        <path d={arcGen(seg(0, Math.max(0.004, tv))) ?? ""} transform={`translate(${c} ${c})`} style={{ fill: tone, transition: "fill .5s" }} />
        <text x={c} y={c + 16} textAnchor="middle" className={s.display} style={{ fontFamily: FONT_DISPLAY, fontSize: 80, fill: "var(--text)" }}>
          {pctText}
          <tspan style={{ fontSize: 32, fill: "var(--muted)" }} dx={2} dy={-26}>
            %
          </tspan>
        </text>
        <text x={c} y={c + 38} textAnchor="middle" className={s.cap} style={{ fill: tone, letterSpacing: "0.18em" }}>
          {LEVEL_WORD[level]}
        </text>
        <text textAnchor="middle" className={s.cap} fontSize={9}>
          {wrapLabel(label, 20, 2).map((ln, i) => (
            <tspan key={i} x={c} y={c + 56 + i * 11}>
              {ln}
            </tspan>
          ))}
        </text>
        {(range || n !== undefined) && (
          <text x={c} y={c + 90} textAnchor="middle" className={s.tick} fontSize={9.5}>
            {[range ? `range ${Math.round(range.low * 100)}–${Math.round(range.high * 100)}%` : "", n !== undefined ? nOf(n) : ""].filter(Boolean).join("  ·  ")}
          </text>
        )}
      </svg>
    </div>
  );
}
