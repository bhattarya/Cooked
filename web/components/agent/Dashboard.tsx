"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import type { Myths } from "@/lib/agentApi";
import type { ServerDrill, ServerRepair, ServerState } from "@/lib/live";
import type { Dataset, Term } from "@/lib/types";
import { RangeTile } from "../Gauges";
import { PrereqMap } from "../PrereqMap";
import { TrajectoryField } from "../TrajectoryField";
import { DrillView, RepairView } from "./AnswerCard";
import { SponsorChip, type SponsorLive } from "./Sponsors";

export type FullState = ServerState & {
  terms: { attempted: number; earned: number; withdrawals: number }[];
  courses_done: string[];
  courses_in_progress: string[];
  major: string;
  track: string;
  entry_type: string;
  credits_earned: number;
  credits_required: number;
  work_hours: number;
};

const riskCol = (r: number) => (r >= 0.5 ? "#ff2e4d" : r >= 0.2 ? "#ffb020" : "#2dd4bf");
const verdict = (r: number) => (r >= 0.5 ? "cooked" : r >= 0.2 ? "on watch" : "on track");

function Card({ title, sponsors, children, delay = 0, className = "" }: { title: string; sponsors?: React.ReactNode; children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className={`panel overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <h3 className="label">{title}</h3>
        <span className="ml-auto flex flex-wrap gap-1.5">{sponsors}</span>
      </div>
      {children}
    </motion.section>
  );
}

export function Dashboard({
  name,
  st,
  drill,
  repair,
  myths,
  ds,
  highlight,
  live,
}: {
  name: string | null;
  st: FullState;
  drill: ServerDrill | null;
  repair: ServerRepair | null;
  myths: Myths | null;
  ds: Dataset | null;
  highlight: string[];
  live: SponsorLive;
}) {
  const risk = st.risk.value;
  const col = riskCol(risk);
  const terms: Term[] = useMemo(() => st.terms.map((t) => [t.attempted, t.earned, t.withdrawals, 0, 0]), [st.terms]);
  const load = terms.length ? Math.round(terms.reduce((s, t) => s + t[0], 0) / terms.length) : 15;
  const twinIds = useMemo(() => new Set(st.twins.ids), [st.twins.ids]);
  const years = st.plan?.projected_years.value ?? null;

  return (
    <div className="space-y-5">
      {/* hero */}
      <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="relative overflow-hidden rounded-3xl border border-line bg-panel p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: `${col}33` }} />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="label">{st.major} · {st.track} · {st.entry_type === "Transfer" ? "transfer" : "first-time"}</div>
            <h1 className="display mt-2 text-4xl font-semibold leading-tight sm:text-5xl">
              {name ? `${name}, you're ` : "You're "}
              <span style={{ color: col }}>{verdict(risk)}</span>.
            </h1>
            <p className="mt-3 max-w-xl text-muted">
              {st.terms_done.value} terms in, averaging <span className="num text-text">{st.avg_credits.value}</span> credits a term with{" "}
              <span className="num text-text">{st.credits_earned}</span> of {st.credits_required} credits earned.{" "}
              {st.twins.refused ? "Not enough close matches for outcome ranges yet." : <>Compared against <span className="num text-text">{st.twins.n}</span> alumni who looked like you at this point.</>}
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <SponsorChip k="model" live={live.model} />
              <SponsorChip k="tiger" live={live.tiger} />
            </div>
          </div>
          <div className="flex items-end gap-8">
            <div>
              <div className="label">model risk</div>
              <div className="num text-6xl font-semibold" style={{ color: col, textShadow: `0 0 30px ${col}66` }}>
                {Math.round(risk * 100)}
                <span className="text-2xl">%</span>
              </div>
            </div>
            {years !== null && (
              <div>
                <div className="label">projected finish</div>
                <div className="num text-6xl font-semibold" style={{ color: years > 5 ? "#ff2e4d" : years > 4 ? "#ffb020" : "#2dd4bf" }}>
                  {years}
                  <span className="text-2xl text-muted"> yrs</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.section>

      <p className="rounded-xl border border-line bg-white/[0.02] px-4 py-2.5 text-[12px] leading-relaxed text-muted">
        Compared against <span className="text-text">synthetic</span> HackUMBC 2026 alumni (a simulation, not UMBC records). Nothing here is a fact about real UMBC
        graduates or a prediction about you; it shows what happened to similar simulated students.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <RangeTile label="Expected delay" lo={st.delay.low} mid={st.delay.mid} hi={st.delay.high} max={5} fmt={(x) => `+${x.toFixed(1)}y`} hint="beyond 4 years · model p25–p75" tr={st.delay.tool_result_id} n={st.delay.support} color={col} />
        {st.still_seeking_risk ? (
          <RangeTile label="Still seeking a job" lo={st.still_seeking_risk.low} mid={st.still_seeking_risk.mid} hi={st.still_seeking_risk.high} max={0.4} fmt={(x) => `${Math.round(x * 100)}%`} hint="at 6 months · matched twins, 90% interval · excludes No Response (outcome unknown)" tr={st.still_seeking_risk.tool_result_id} n={st.still_seeking_risk.support} color="#ffb020" />
        ) : (
          <div className="panel flex items-center p-4 text-sm text-muted">Job outcomes: not enough balanced twins.</div>
        )}
        {st.degree_burden ? (
          <RangeTile label="Degree burden" lo={st.degree_burden.low} mid={st.degree_burden.mid} hi={st.degree_burden.high} max={1.2} fmt={(x) => x.toFixed(2)} hint="net cost ÷ first salary · nominal dollars" tr={st.degree_burden.tool_result_id} n={st.degree_burden.support} color="#a78bfa" />
        ) : (
          <div className="panel flex items-center p-4 text-sm text-muted">Degree burden: not enough salaried twins.</div>
        )}
      </div>

      {ds && (
        <Card title="Your line against 3,200 alumni" delay={0.1} sponsors={<SponsorChip k="tiger" live={live.tiger} compact />}>
          <div className="p-5">
            <TrajectoryField alumni={ds.alumni} height={320} highlight={twinIds} focus={{ terms, planLoad: load, color: col }} intro={false} />
          </div>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {drill && (
          <Card title={`Stress test · ${drill.sims} simulated futures`} delay={0.15} sponsors={<><SponsorChip k="tiger" live={live.tiger} compact /><SponsorChip k="model" live={live.model} compact /></>}>
            <div className="p-5">
              <DrillView v={{ type: "drill", drill }} />
              <div className="num mt-2 text-[10.5px] text-dim">{drill.rows_stored} trajectories written to app.drill_trajectory</div>
            </div>
          </Card>
        )}
        {repair && (
          <Card title="The fix" delay={0.2} sponsors={<SponsorChip k="model" live={live.model} compact />}>
            <div className="p-5">
              <RepairView v={{ type: "repair", repair }} />
            </div>
          </Card>
        )}
      </div>

      {ds && (
        <Card title={`Your ${st.major} prerequisite map`} delay={0.25} sponsors={highlight.length ? <span className="text-[11px] text-heat">highlighting your last question</span> : undefined}>
          <div className="p-5">
            <PrereqMap catalog={ds.catalog} major={st.major} done={st.courses_done} ip={st.courses_in_progress} picks={highlight} />
          </div>
        </Card>
      )}

      {myths && (
        <Card title="What the data says" delay={0.3}>
          <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            {[...myths.held_up, ...myths.items.slice(0, 2)].map((m) => (
              <div key={m.title} className="bg-panel p-4">
                <div className={`num text-2xl font-semibold ${myths.held_up.includes(m) ? "text-cool" : "text-hot"}`}>{m.value}</div>
                <div className="mt-1 text-sm">{myths.held_up.includes(m) ? m.title : `Myth: ${m.title}`}</div>
                <div className="mt-1 text-[11px] leading-snug text-dim">{m.evidence}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
