"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { ArenaReport, CalibrationCurve, CareerCandidate, CareerClass, Family, QuantileMetrics, QuantileScatter, RiskCandidate, TaskId } from "@/lib/arena-types";
import { CAREER_CLASSES, CAREER_COLOR, FAMILIES, FAMILY_COLOR, FAMILY_FULL, FAMILY_NAME, pct0, usd, usdK } from "@/lib/labModel";
import { ChartShell, ConfusionMatrix, RocCurve, Scatter, alpha, pct, useChart, useChartSize, type RocSeries, type ScatterGroup, type ScatterPoint } from "@/components/viz";
import { Segmented } from "./Segmented";
import { Crown } from "./parts";

type Sub = "roc" | "calibration" | "confusion" | "ovr";

const SUBS: Record<TaskId, { id: Sub; label: string }[]> = {
  risk: [{ id: "roc", label: "ROC curves" }, { id: "calibration", label: "Calibration" }],
  time_to_degree: [],
  career: [{ id: "confusion", label: "Confusion" }, { id: "ovr", label: "One vs rest" }],
  salary: [],
};

const TITLE: Record<TaskId, string> = {
  risk: "Can it tell who got cooked?",
  time_to_degree: "Predicted against actual years",
  career: "Does it know where alumni went?",
  salary: "Predicted against actual salary",
};

/** A family picker whose chips carry the family colour and the champion's crown. */
function FamilyChips({ value, onChange, champion }: { value: Family; onChange: (f: Family) => void; champion: Family }) {
  return (
    <div role="radiogroup" aria-label="Model family" className="flex flex-wrap gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
      {FAMILIES.map((f) => {
        const on = f === value;
        return (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(f)}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-none transition focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold"
            style={{ borderColor: on ? FAMILY_COLOR[f] : "var(--line-2)", color: on ? "var(--text)" : "var(--muted)", background: on ? alpha(FAMILY_COLOR[f], 0.14) : "transparent" }}
          >
            <i className="size-2 rounded-full" style={{ background: f === "baseline" ? "transparent" : FAMILY_COLOR[f], border: f === "baseline" ? `1.5px dashed ${FAMILY_COLOR.baseline}` : undefined }} />
            {FAMILY_NAME[f]}
            {f === champion && <Crown size={10} className="text-gold" />}
          </button>
        );
      })}
    </div>
  );
}

export function Evidence({ arena, task, stage }: { arena: ArenaReport; task: TaskId; stage: number }) {
  const subs = SUBS[task];
  const [sub, setSub] = useState<Sub>(subs[0]?.id ?? "roc");
  const [family, setFamily] = useState<Family>(arena.tasks[task].champion.family);
  const [cls, setCls] = useState<CareerClass>("Continuing education");
  const [ref, box] = useChartSize<HTMLDivElement>("fill");
  const champion = arena.tasks[task].champion.family;
  const h = Math.max(200, box.height);
  const view = task === "risk" || task === "career" ? sub : "scatter";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="serif text-[clamp(1.05rem,2.5vh,1.35rem)] leading-tight text-cream">{TITLE[task]}</h3>
        {subs.length > 0 && <Segmented label="Evidence view" value={sub} onChange={setSub} options={subs.map((s) => ({ value: s.id, label: s.label }))} className="min-w-[190px]" />}
      </div>
      <div ref={ref} className="relative min-h-[240px] flex-1 lg:min-h-0">
        <div className="absolute inset-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${task}-${view}-${view === "confusion" ? family : view === "ovr" ? cls : view === "scatter" ? family : stage}`} className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
              {task === "risk" && view === "roc" && <RiskRoc arena={arena} stage={stage} height={h} />}
              {task === "risk" && view === "calibration" && <Calibration arena={arena} stage={stage} height={h} />}
              {task === "career" && view === "confusion" && <CareerConfusion arena={arena} family={family} onFamily={setFamily} champion={champion} height={h} />}
              {task === "career" && view === "ovr" && <CareerOvr arena={arena} cls={cls} onCls={setCls} height={h - 40} />}
              {(task === "time_to_degree" || task === "salary") && <PredActual arena={arena} task={task} family={family} onFamily={setFamily} champion={champion} height={h - 74} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- risk */

function RiskRoc({ arena, stage, height }: { arena: ArenaReport; stage: number; height: number }) {
  const t = arena.tasks.risk;
  const series: RocSeries[] = (t.candidates as RiskCandidate[]).map((c) => {
    const curve = c.curves.roc[String(stage)];
    return { key: c.family, label: FAMILY_NAME[c.family], color: FAMILY_COLOR[c.family], points: curve.fpr.map((x, i) => [x, curve.tpr[i]] as [number, number]), auc: curve.auc, n: c.metrics.n_test, emphasis: c.is_champion };
  });
  return <RocCurve series={series} height={height} legend={false} label={`ROC curves at ${stage} completed terms: ${series.map((s) => `${s.label} AUC ${s.auc?.toFixed(3)}`).join(", ")}. A coin flip scores 0.500.`} />;
}

function Calibration({ arena, stage, height }: { arena: ArenaReport; stage: number; height: number }) {
  const cands = arena.tasks.risk.candidates as RiskCandidate[];
  const series = cands.map((c) => ({ family: c.family, curve: c.curves.calibration[String(stage)] as CalibrationCurve }));
  const label = `Calibration: for each band of predicted risk, the share of alumni who really got cooked. Points on the diagonal are honest probabilities.`;
  return (
    <ChartShell height={height} label={label} legend={null} hint="Hover a point for the band.">
      <CalBody series={series} />
    </ChartShell>
  );
}

function CalBody({ series }: { series: { family: Family; curve: CalibrationCurve }[] }) {
  const { width: W, height: H, show, hide, inView } = useChart();
  const [hover, setHover] = useState<string | null>(null);
  const m = { l: 44, r: 14, t: 14, b: 40 };
  const side = Math.max(120, Math.min(W - m.l - m.r, H - m.t - m.b));
  const ox = m.l + Math.max(0, (W - m.l - m.r - side) / 2);
  const top = Math.max(0.2, Math.ceil(Math.max(...series.flatMap((s) => [...s.curve.predicted, ...s.curve.observed])) * 10) / 10);
  const sx = (v: number) => ox + (v / top) * side;
  const sy = (v: number) => m.t + side - (v / top) * side;
  const ticks = [0, top / 2, top];
  const maxN = Math.max(...series.flatMap((s) => s.curve.n));
  return (
    <svg width={W} height={H} aria-hidden="true" onPointerLeave={() => { setHover(null); hide(); }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={ox} x2={ox + side} y1={sy(t)} y2={sy(t)} stroke="var(--line)" />
          <line x1={sx(t)} x2={sx(t)} y1={m.t} y2={m.t + side} stroke="var(--line)" />
          <text x={ox - 8} y={sy(t)} dy="0.34em" textAnchor="end" style={{ font: "10px var(--f-mono), monospace", fill: "var(--dim)" }}>{pct0(t)}</text>
          <text x={sx(t)} y={m.t + side + 16} textAnchor="middle" style={{ font: "10px var(--f-mono), monospace", fill: "var(--dim)" }}>{pct0(t)}</text>
        </g>
      ))}
      <rect x={ox} y={m.t} width={side} height={side} fill="none" stroke="var(--line-2)" />
      <line x1={sx(0)} y1={sy(0)} x2={sx(top)} y2={sy(top)} stroke="var(--dim)" strokeWidth={1.2} strokeDasharray="5 5" />
      <text x={ox + side} y={m.t + side + 32} textAnchor="end" style={{ font: "9.5px var(--f-mono), monospace", letterSpacing: "0.12em", fill: "var(--faint, var(--dim))", textTransform: "uppercase" }}>predicted risk {"→"}</text>
      <text x={ox - 34} y={m.t - 2} style={{ font: "9.5px var(--f-mono), monospace", letterSpacing: "0.12em", fill: "var(--faint, var(--dim))", textTransform: "uppercase" }}>{"↑"} really cooked</text>
      {series.map((s) => {
        const pts = s.curve.predicted.map((p, i) => [sx(p), sy(s.curve.observed[i]), s.curve.n[i]] as const);
        const on = hover === null || hover === s.family;
        return (
          <g key={s.family} style={{ opacity: on ? 1 : 0.2, transition: "opacity .2s" }}>
            {pts.length > 1 && <path d={pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join("")} fill="none" stroke={FAMILY_COLOR[s.family]} strokeWidth={1.8} strokeLinejoin="round" opacity={inView ? 0.9 : 0} style={{ transition: "opacity .6s" }} />}
            {pts.map((p, i) => (
              <circle
                key={i}
                cx={p[0]}
                cy={p[1]}
                r={3 + (p[2] / maxN) * 5}
                fill={FAMILY_COLOR[s.family]}
                stroke="var(--panel)"
                strokeWidth={1.5}
                onPointerEnter={() => {
                  setHover(s.family);
                  show(p[0], p[1] - 4, { title: FAMILY_FULL[s.family], rows: [{ label: "predicted", value: pct(s.curve.predicted[i], 1), color: FAMILY_COLOR[s.family], swatch: "dot" }, { label: "really cooked", value: pct(s.curve.observed[i], 1), strong: true }], note: `n=${s.curve.n[i].toLocaleString("en-US")} alumni in this band` });
                }}
              />
            ))}
          </g>
        );
      })}
      <g transform={`translate(${ox + 8} ${m.t + 8})`}>
        {series.map((s, i) => (
          <g key={s.family} transform={`translate(0 ${i * 15})`}>
            <line x1={0} x2={12} y1={0} y2={0} stroke={FAMILY_COLOR[s.family]} strokeWidth={2.4} strokeLinecap="round" />
            <text x={18} y={0} dy="0.34em" style={{ font: "10.5px var(--f-sans), sans-serif", fill: "var(--muted)" }}>{FAMILY_NAME[s.family]}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ----------------------------------------------------------------- career */

function CareerConfusion({ arena, family, onFamily, champion, height }: { arena: ArenaReport; family: Family; onFamily: (f: Family) => void; champion: Family; height: number }) {
  const cand = (arena.tasks.career.candidates as CareerCandidate[]).find((c) => c.family === family) ?? (arena.tasks.career.candidates as CareerCandidate[])[0];
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <FamilyChips value={family} onChange={onFamily} champion={champion} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <ConfusionMatrix labels={cand.confusion.labels} counts={cand.confusion.counts} actualTitle="Actual" predictedTitle="Predicted" maxCell={Math.max(34, Math.min(92, Math.floor((height - 90 - 88) / 3)))} label={`Confusion matrix of the ${FAMILY_FULL[family]} on ${cand.metrics.n_test} holdout alumni.`} />
      </div>
      <p className="text-[11px] leading-snug text-muted">
        {family === "baseline" || cand.confusion.row_normalised.every((row) => row.indexOf(Math.max(...row)) === 0) ? (
          <>Every row lands in the Employed column: it says <span className="text-cream">Employed</span> for everyone. That is why macro-F1 never moves.</>
        ) : (
          <>Read each row across: where alumni who really went there were sent.</>
        )}
      </p>
    </div>
  );
}

function CareerOvr({ arena, cls, onCls, height }: { arena: ArenaReport; cls: CareerClass; onCls: (c: CareerClass) => void; height: number }) {
  const cands = arena.tasks.career.candidates as CareerCandidate[];
  const series: RocSeries[] = cands.map((c) => ({ key: c.family, label: FAMILY_NAME[c.family], color: FAMILY_COLOR[c.family], points: c.roc[cls].fpr.map((x, i) => [x, c.roc[cls].tpr[i]] as [number, number]), auc: c.roc[cls].auc, n: c.metrics.n_test, emphasis: c.is_champion }));
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div role="radiogroup" aria-label="Destination" className="flex flex-wrap gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
        {CAREER_CLASSES.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={c === cls} onClick={() => onCls(c)} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-none transition focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold" style={{ borderColor: c === cls ? CAREER_COLOR[c] : "var(--line-2)", color: c === cls ? "var(--text)" : "var(--muted)", background: c === cls ? alpha(CAREER_COLOR[c], 0.14) : "transparent" }}>
            <i className="size-2 rounded-full" style={{ background: CAREER_COLOR[c] }} />
            {c}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <RocCurve series={series} height={Math.max(180, height)} legend={false} label={`One-versus-rest ROC for ${cls}: ${series.map((s) => `${s.label} AUC ${s.auc?.toFixed(3)}`).join(", ")}. A coin flip scores 0.500.`} />
      </div>
    </div>
  );
}

/* --------------------------------------------------- time and money scatter */

const DIAG = 48;

function PredActual({ arena, task, family, onFamily, champion, height }: { arena: ArenaReport; task: "time_to_degree" | "salary"; family: Family; onFamily: (f: Family) => void; champion: Family; height: number }) {
  const t = arena.tasks[task];
  const sc = t.scatter as QuantileScatter;
  const money = task === "salary";
  const fmt = money ? usdK : (v: number) => v.toFixed(1);
  const cand = (t.candidates as { family: Family; metrics: QuantileMetrics }[]).find((c) => c.family === family);
  const pred = sc.families[family].mid;

  const { points, dom } = useMemo(() => {
    const all = [...sc.actual, ...pred];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = (hi - lo) * 0.05;
    const d: [number, number] = [lo - pad, hi + pad];
    const pts: ScatterPoint[] = [
      ...Array.from({ length: DIAG }, (_, i) => ({ x: d[0] + ((d[1] - d[0]) * i) / (DIAG - 1), y: d[0] + ((d[1] - d[0]) * i) / (DIAG - 1), group: "diag" })),
      ...sc.actual.map((a, i) => ({ x: a, y: pred[i], group: "pred" })),
    ];
    return { points: pts, dom: d };
  }, [sc.actual, pred]);
  const groups: ScatterGroup[] = [
    { key: "diag", label: "Perfect prediction", color: "var(--cream)" },
    { key: "pred", label: FAMILY_FULL[family], color: FAMILY_COLOR[family] },
  ];
  const m = cand?.metrics;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <FamilyChips value={family} onChange={onFamily} champion={champion} />
      <div className="min-h-0 flex-1">
        <Scatter
          points={points}
          groups={groups}
          xDomain={dom}
          yDomain={dom}
          xLabel={money ? "actual first salary" : "actual years to degree"}
          yLabel={money ? "predicted median" : "predicted median"}
          xFormat={fmt}
          yFormat={fmt}
          radius={2.6}
          legend={false}
          height={Math.max(180, height)}
          label={`Predicted median against actual ${money ? "first salary" : "years to degree"} for ${sc.n_shown} of ${sc.n_total} holdout alumni, ${FAMILY_FULL[family]}.`}
          tooltip={(p, g) => (g.key === "diag" ? { title: "Perfect prediction", rows: [{ label: "actual = predicted", value: fmt(p.x), color: g.color, swatch: "dot" }] } : { title: FAMILY_FULL[family], rows: [{ label: "actual", value: money ? usd(p.x) : `${p.x.toFixed(2)} y`, strong: true }, { label: "predicted", value: money ? usd(p.y) : `${p.y.toFixed(2)} y`, color: g.color, swatch: "dot" }], note: `${sc.n_shown} of ${sc.n_total.toLocaleString("en-US")} holdout alumni shown` })}
        />
      </div>
      {m && (
        <p className="text-[11px] leading-snug text-muted">
          Median is off by <span className="num text-cream">{money ? usd(Math.abs(m.bias)) : `${Math.abs(m.bias).toFixed(2)} y`}</span> {m.bias < 0 ? "too low" : "too high"} on average
          {money && m.bias < -1000 ? <span className="text-ember"> (pay rose after the training years)</span> : null}; <span className="num text-cream">{Math.round(m.interval_coverage * 100)}%</span> of actuals fall inside its p25 to p75 range (about half is ideal). {"·"} n={sc.n_shown} of {sc.n_total.toLocaleString("en-US")} shown
        </p>
      )}
    </div>
  );
}
