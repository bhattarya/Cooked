"use client";

import type { ArenaReport } from "@/lib/arena-types";
import { Bars, pct } from "@/components/viz";
import { FieldSlider } from "./ControlPanel";
import { RAIL_GUTTER } from "./frame";
import type { LabSim } from "./useLabSim";

/** Trajectory pattern counts come from the alumni sample returned by simulate. */
export function constellationFacts(sim: LabSim, arena: ArenaReport | null) {
  const r = sim.result;
  const cloud = sim.cloud;
  if (!r || !cloud) return null;
  const pattern = r.constellation.you.pattern;
  const same = pattern ? cloud.filter(p => p.pattern === pattern).length : 0;
  return { r, cloud, pattern, same, share: cloud.length ? same / cloud.length : 0, n: cloud.length, alumni: arena?.dataset.alumni ?? null, off: false };
}

export function ConstellationScene({ sim, arena }: { sim: LabSim; arena: ArenaReport | null }) {
  const f = constellationFacts(sim, arena);
  const counts = new Map<string, number>();
  for (const p of f?.cloud ?? []) counts.set(p.pattern, (counts.get(p.pattern) ?? 0) + 1);
  const data = [...counts].sort((a,b) => b[1]-a[1]).map(([label,value]) => ({ key: label, label, value, color: label === f?.pattern ? "var(--gold)" : "var(--muted)" }));
  return <section className={`h-full overflow-y-auto px-4 py-5 sm:px-6 ${RAIL_GUTTER}`}>
    <div className="mx-auto max-w-5xl">
      <p className="label !text-gold">Trajectory</p>
      <h2 className="display mt-2 text-3xl font-bold">Patterns in the training sample</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{!f ? "Loading the alumni sample." : !f.pattern ? "No completed terms means there is no trajectory pattern yet." : <>{f.pattern}: {pct(f.share)} of {f.n.toLocaleString("en-US")} sampled alumni share this pattern. Pattern labels summarize histories; they are not outcomes.</>}</p>
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <div className="rounded-xl border border-line bg-panel p-4"><h3 className="label mb-4">Change the history</h3><div className="grid gap-5"><FieldSlider field="completed_terms" sim={sim} /><FieldSlider field="credits_per_term" sim={sim} /><FieldSlider field="withdrawals" sim={sim} /><FieldSlider field="failures" sim={sim} /><FieldSlider field="enrollment_gaps" sim={sim} /><FieldSlider field="earned_ratio" sim={sim} /></div></div>
        <div className="rounded-xl border border-line bg-panel p-4"><h3 className="label mb-4">Alumni by pattern · n={f?.n.toLocaleString("en-US") ?? "…"}</h3>{data.length > 0 && <Bars data={data} format={v => v.toLocaleString("en-US")} height={Math.max(260,data.length*48)} label="Sampled alumni by trajectory pattern" />}<p className="mt-3 text-xs leading-relaxed text-muted">A sample of synthetic alumni returned by the simulation API. {arena?.dataset.disclaimer}</p></div>
      </div>
    </div>
  </section>;
}
