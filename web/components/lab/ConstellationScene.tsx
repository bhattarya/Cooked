"use client";

import { useMemo } from "react";
import type { ArenaReport } from "@/lib/arena-types";
import { PATTERN_COLORS, Scatter, patternColor, pct, useChartSize, useTween, type ScatterGroup, type ScatterPoint } from "@/components/viz";
import { FieldSlider } from "./ControlPanel";
import { RAIL_GUTTER, SceneTitle, Tag } from "./frame";
import type { LabSim } from "./useLabSim";

const NAMES: Record<string, string> = { smooth: "Smooth", "rough patch": "Rough patch", "part-time grind": "Part-time grind", "withdrawal spiral": "Withdrawal spiral", "stop-out": "Stop-out" };
const ORDER = Object.keys(PATTERN_COLORS);

/** How the constellation sees the scenario: the pattern, its share of the sample, and whether the dot fits on the map. */
export function constellationFacts(sim: LabSim, arena: ArenaReport | null) {
  const r = sim.result;
  const cloud = sim.cloud;
  if (!r || !cloud) return null;
  const pattern = r.constellation.you.pattern;
  const same = pattern ? cloud.filter((p) => p.pattern === pattern).length : 0;
  const xs = cloud.map((p) => p.x);
  const ys = cloud.map((p) => p.y);
  const padX = (Math.max(...xs) - Math.min(...xs)) * 0.06;
  const padY = (Math.max(...ys) - Math.min(...ys)) * 0.08;
  const dom = { x: [Math.min(...xs) - padX, Math.max(...xs) + padX] as [number, number], y: [Math.min(...ys) - padY, Math.max(...ys) + padY] as [number, number] };
  const you = r.constellation.you;
  const off = you.x < dom.x[0] || you.x > dom.x[1] || you.y < dom.y[0] || you.y > dom.y[1];
  return { r, cloud, pattern, same, share: cloud.length ? same / cloud.length : 0, n: cloud.length, alumni: arena?.dataset.alumni ?? null, dom, off, you };
}

export function ConstellationScene({ sim, arena }: { sim: LabSim; arena: ArenaReport | null }) {
  const f = constellationFacts(sim, arena);
  const [ref, box] = useChartSize<HTMLDivElement>("fill");
  const cloud = sim.cloud;

  const points = useMemo<ScatterPoint[]>(() => (cloud ?? []).map((p) => ({ x: p.x, y: p.y, group: p.pattern })), [cloud]);
  const groups = useMemo<ScatterGroup[]>(() => {
    const present = new Set((cloud ?? []).map((p) => p.pattern));
    return ORDER.filter((k) => present.has(k)).map((k) => ({ key: k, label: NAMES[k] ?? k, color: patternColor(k) }));
  }, [cloud]);

  // the dot glides between answers instead of teleporting; off-map scenarios pin to the edge of the map
  const clamp = (v: number, [a, b]: [number, number]) => Math.max(a, Math.min(b, v));
  const target = f ? [clamp(f.you.x, f.dom.x), clamp(f.you.y, f.dom.y)] : [0, 0];
  const [yx, yy] = useTween(target, { duration: 520, from: (_, t) => t });

  const noHistory = sim.scenario.completed_terms === 0;
  const label = noHistory ? "No history yet" : f?.off ? "Off the map" : f?.pattern ? `You · ${f.pattern}` : "You are here";
  const you = f ? { x: yx, y: yy, label } : undefined;

  return (
    <section className={`grid h-full min-h-0 grid-cols-1 gap-4 overflow-y-auto px-4 pb-4 pt-3 sm:px-6 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:gap-8 lg:overflow-hidden lg:pb-2 lg:pr-8 ${RAIL_GUTTER}`}>
      <header className="flex min-h-0 flex-col justify-center gap-4">
        <SceneTitle kicker="Trajectory constellation" title="You are" accent="here" />
        <p className="serif max-w-md text-[clamp(1.15rem,2.9vh,1.6rem)] leading-snug text-muted">
          {!f ? (
            "Placing the scenario among the alumni."
          ) : noHistory ? (
            "With no completed terms there is no history to place. Slide terms done up and the dot lands somewhere."
          ) : f.off ? (
            <>No sampled alumnus looks like this scenario, so the dot is pinned to the edge of the map.</>
          ) : (
            <>
              Your history follows the <span className="text-cream">{f.pattern}</span> pattern. {pct(f.share)} of the {f.n} sampled alumni did too.
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Tag title="The constellation plots a stride sample of the synthetic alumni">
            n={f?.n ?? "…"}
            {f?.alumni ? ` of ${f.alumni.toLocaleString("en-US")} alumni` : ""}
          </Tag>
          <Tag>synthetic data</Tag>
          {f?.pattern && <Tag tone="gold">{f.pattern}</Tag>}
        </div>
        <div className="panel grid grid-cols-2 gap-x-4 gap-y-[clamp(14px,2.3vh,22px)] p-3.5 pb-4">
          <FieldSlider field="completed_terms" sim={sim} />
          <FieldSlider field="credits_per_term" sim={sim} />
          <FieldSlider field="withdrawals" sim={sim} />
          <FieldSlider field="failures" sim={sim} label="Failed courses" />
          <FieldSlider field="enrollment_gaps" sim={sim} label="Enrollment gaps" />
          <FieldSlider field="earned_ratio" sim={sim} />
        </div>
        <p className="text-[10.5px] leading-snug text-dim">Each dot is one alumnus, projected from course load, withdrawals, repeats and gaps (a PCA: the axes carry no units). Grouped by trajectory pattern.</p>
      </header>
      <div className="panel relative min-h-[380px] min-w-0 overflow-hidden p-3 lg:min-h-0">
        <div ref={ref} className="absolute inset-3">
          {f && box.height > 0 && (
            <Scatter
              points={points}
              groups={groups}
              you={you}
              hulls
              hideAxes
              xDomain={f.dom.x}
              yDomain={f.dom.y}
              xLabel="history axis 1"
              yLabel="history axis 2"
              height={Math.max(220, box.height - 44)}
              label={`Constellation of ${f.n} sampled alumni by trajectory pattern. Your scenario is ${noHistory ? "not placed: no completed terms" : (f.pattern ?? "unplaced")}.`}
              tooltip={(p, g) => ({ title: g.label, rows: [{ label: "of the sample", value: pct(points.filter((q) => q.group === p.group).length / points.length), color: g.color, swatch: "dot", strong: true }], note: "one synthetic alumnus" })}
            />
          )}
        </div>
      </div>
    </section>
  );
}
