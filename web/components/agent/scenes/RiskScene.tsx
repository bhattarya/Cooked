"use client";

import { Bars, type BarItem } from "@/components/viz";
import { Chip, Provenance } from "@/components/scenes";
import type { SponsorLive } from "../Sponsors";
import { riskTakeaway } from "./copy";
import { Action, Sponsors } from "./kit";
import { pct, verdictOf, type Journey } from "./model";

/** The trained risk score, with the decision line used by the actual verdict. */
export function RiskScene({ j, live, canHear, onHear, onAsk, onAskAbout, onNext }: { j: Journey; live: SponsorLive; canHear: boolean; onHear: () => void; onAsk: () => void; onAskAbout: (question: string) => void; onNext: () => void }) {
  const { st } = j;
  const risk = st.risk.value;
  const data: BarItem[] = [{ label: "Your model score", value: risk }];
  return (
    <section className="grid h-full min-h-0 grid-cols-1 content-start gap-8 overflow-y-auto px-5 pb-8 pt-6 sm:px-8 lg:grid-cols-2 lg:content-center lg:items-center lg:gap-14 lg:px-12">
      <header className="min-w-0">
        <div className="label text-gold">{st.major} · {st.track} · {st.entry_type === "Transfer" ? "transfer" : "first-time"}</div>
        <h2 className="display mt-5 text-[clamp(3.5rem,7vw,7rem)] font-bold leading-none text-text">{pct(risk)}</h2>
        <p className="mt-3 text-lg text-gold">{verdictOf(risk)} · trained risk model</p>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">{riskTakeaway(j)}</p>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-text">Your audit records {st.credits_earned} of {st.credits_required} required credits earned and {st.courses_in_progress.length} courses in progress. In-progress credits are not counted as earned.</p>
        {j.auditWarnings.some(note => note.includes("entry type")) && <p className="mt-3 max-w-xl border-l-2 border-gold pl-3 text-xs leading-relaxed text-muted">{j.auditWarnings.find(note => note.includes("entry type"))}</p>}
        {j.auditWarnings.length > 0 && <details className="mt-4 text-xs text-muted"><summary className="cursor-pointer text-gold">Audit reading notes</summary><ul className="mt-2 list-disc space-y-1 pl-5">{j.auditWarnings.map(note => <li key={note}>{note}</li>)}</ul></details>}
        {st.terms_done.value === 0 && <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">No completed regular terms were found in this audit. This score uses the model’s starting-stage inputs; it does not measure a term-by-term record yet.</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Provenance n={st.time_to_degree.support} tr={st.risk.tool_result_id} />
          <Chip title="Training rows for this model stage">synthetic training data</Chip>
          <Sponsors live={live} keys={["model", "tiger"]} />
        </div>
        <p className="mt-5 text-sm text-muted">Want to go deeper? Use the microphone below to ask COOKED about your schedule, or type a question.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {canHear && <Action onClick={onHear}>Hear the answer</Action>}
          <Action onClick={() => onAskAbout("How many credits have I earned, and which courses are in progress this fall?")}>Check this fall</Action>
          <Action onClick={onAsk}>Ask anything</Action>
          <Action primary onClick={onNext}>See timing →</Action>
        </div>
      </header>
      <div className="min-w-0 rounded-2xl border border-line p-5 sm:p-7">
        <div className="label mb-4">Where the score sits</div>
        <Bars data={data} domain={[0, 1]} format={pct} axisFormat={pct} unit="model risk" baseline={{ value: 0.5, label: "high-risk line", tone: "risk" }} height={160} />
        <p className="mt-3 text-sm leading-relaxed text-muted">The trained model sets this score. The high-risk line starts at 50%; the watch line starts at 20%. {st.risk_is_probability ? "The score is calibrated as a probability." : "This score is not a calibrated personal probability."}</p>
        <details className="mt-4 border-t border-line pt-3 text-xs text-muted"><summary className="cursor-pointer text-gold">What the model read</summary><p className="mt-2 leading-relaxed">It scored your {st.terms_done.value} completed regular terms, {st.avg_credits.value} attempted credits per term, {st.w_total.value} withdrawals, {st.work_hours} work hours per week, major and entry type. It also uses earned, failed and repeated course patterns from completed terms. These are inputs, not a causal explanation of the score.</p></details>
      </div>
    </section>
  );
}
