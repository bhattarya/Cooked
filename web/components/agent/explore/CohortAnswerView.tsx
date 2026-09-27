"use client";

import { AnswerChart } from "./AnswerChart";
import { MIN_N, caveats, fmtN, fmtValue, read, smallNote, takeaway, type CohortAnswer } from "./model";

interface Props {
  answer: CohortAnswer;
  idea?: string;
  onIdea: (question: string) => void;
  narration: { available: boolean; speaking: boolean; onSpeak: () => void; onStop: () => void };
}

/** One database value and one chart. Refusal states never promote a thin group into a headline. */
export function CohortAnswerView({ answer, idea, onIdea, narration }: Props) {
  const reading = read(answer);
  const eligible = reading.rows.filter(row => row.value !== null && (answer.unit === "people" ? !/^no response$/i.test(row.label) : row.n >= MIN_N));
  const lead = reading.kind === "refusal" || reading.kind === "empty" ? null : answer.topic === "cost"
    ? eligible.reduce<typeof eligible[number] | null>((latest, row) => !latest || Number(row.label) > Number(latest.label) ? row : latest, null)
    : eligible.reduce<typeof eligible[number] | null>((best, row) => !best || (row.value ?? -Infinity) > (best.value ?? -Infinity) ? row : best, null);
  const label = lead ? answer.topic === "cost" ? `Latest available year · ${lead.label}` : `${lead.label} · ${answer.measure}` : null;

  return <article className="h-full overflow-y-auto px-4 py-5 sm:px-8 lg:px-12">
    <div className="mx-auto max-w-6xl">
      <p className="label !text-gold">Ask the cohort</p>
      <p className="mt-2 text-sm text-muted">“{answer.question}”</p>
      <h1 className="display mt-3 max-w-4xl text-3xl font-bold text-cream sm:text-4xl">{answer.title}</h1>
      {lead && <div className="mt-7 border-l-2 border-gold pl-4">
        <p className="num text-5xl font-semibold tracking-tight text-gold sm:text-6xl">{fmtValue(lead.value, answer.unit)}</p>
        <p className="mt-2 text-sm text-text">{label}</p>
        <p className="num mt-1 text-xs text-muted">{fmtN(lead.n)} in this group</p>
      </div>}
      {!lead && <p className="mt-6 text-base text-ember">{reading.reason ?? "No result to chart."}</p>}
      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">{takeaway(answer)}</p>
      <section className="mt-6 rounded-xl border border-line bg-panel p-4 sm:p-6" aria-label={`${answer.measure} by ${answer.dimension}`}>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-medium text-text">{answer.measure}</h2><p className="label">by {answer.dimension}</p></div>
        <AnswerChart a={answer} r={reading} height={350} />
      </section>
      <div className="mt-5 max-w-4xl space-y-2 text-xs leading-relaxed text-muted">
        {answer.detail !== takeaway(answer) && <p>{answer.detail}</p>}
        {smallNote(answer) && <p className="text-ember">{smallNote(answer)}</p>}
        <p>{answer.disclaimer}</p>
        <p>{caveats(answer).join(" · ")}</p>
        <p className="num text-dim">{answer.source} · fixed query: {answer.topic} · {answer.router === "gemini" ? "AI routed" : "keyword routed"} · {answer.tool_result_id}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3 pb-8">
        {idea && <button type="button" onClick={() => onIdea(idea)} className="rounded-lg border border-line-2 px-4 py-2 text-sm text-gold hover:border-gold">Ask next: {idea}</button>}
        {narration.available && <button type="button" onClick={narration.speaking ? narration.onStop : narration.onSpeak} className="rounded-lg border border-line-2 px-4 py-2 text-sm text-muted hover:text-text">{narration.speaking ? "Stop reading" : "Read aloud"}</button>}
      </div>
    </div>
  </article>;
}
