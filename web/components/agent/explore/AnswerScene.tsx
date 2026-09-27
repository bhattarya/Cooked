"use client";

import { useRef } from "react";
import { Chip, Provenance, SceneFrame } from "@/components/scenes";
import { ThinkingChip } from "@/components/theatre";
import { AnswerChart } from "./AnswerChart";
import styles from "./explore.module.css";
import { caveats, read, smallNote, splitTitle, takeaway, type CohortAnswer } from "./model";
import { useBox, useDesktop } from "./useBox";

export interface NarrationUi {
  /** Reading aloud is possible: the live voice agent is not already talking. */
  available: boolean;
  speaking: boolean;
  onSpeak: () => void;
  onStop: () => void;
}

const tier = (title: string) => (title.length <= 16 ? "" : title.length <= 26 ? styles.t2 : styles.t3);

/** One answer, one scene: the question as kicker, the API's title and one-line takeaway, the hero chart, and its receipts. */
export function AnswerScene({ answer: a, idea, onIdea, narration }: { answer: CohortAnswer; idea?: string; onIdea: (q: string) => void; narration: NarrationUi }) {
  const r = read(a);
  const t = splitTitle(a.title);
  const stage = useRef<HTMLDivElement>(null);
  const box = useBox(stage);
  const desktop = useDesktop();
  const note = r.kind === "refusal" || r.kind === "empty" ? null : smallNote(a, r.kind === "line" ? "left as gaps in the line" : "greyed out");
  const q = a.question.length > 110 ? `${a.question.slice(0, 109).trimEnd()}…` : a.question;

  const receipts = (
    <>
      <Provenance n={r.total} tr={a.tool_result_id} />
      <Chip tone="dim" title={a.source}>
        {a.source.split("·")[0].trim()}
      </Chip>
      <Chip tone="dim" title="one of six fixed aggregate queries; the model only picks which, Tiger Data computes the numbers">
        query · {a.topic}
      </Chip>
      <Chip tone={a.router === "gemini" ? "gold" : "dim"} title={a.router === "gemini" ? "Gemini picked the query" : "Gemini did not route this question, so the keyword router did"}>
        {a.router === "gemini" ? "routed by Gemini" : "keyword-routed"}
      </Chip>
      {caveats(a).map((c) => (
        <Chip key={c} tone="dim">
          {c}
        </Chip>
      ))}
      <p className="mt-1 basis-full text-[11.5px] leading-relaxed text-dim">{a.disclaimer}</p>
    </>
  );
  const actions = (
    <>
      {idea && (
        <button onClick={() => onIdea(idea)} className="group max-w-full rounded-2xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-left text-[13px] leading-snug text-gold transition hover:border-gold/70 hover:bg-gold/15">
          <span className="num mr-2 text-[10px] uppercase tracking-[0.14em] text-gold/70">next</span>
          {idea}
          <span aria-hidden className="ml-1.5 inline-block transition group-hover:translate-x-0.5">
            →
          </span>
        </button>
      )}
      {narration.speaking ? (
        <div className="flex items-center gap-2">
          <ThinkingChip state="composing" label="Reading it aloud" />
          <button onClick={narration.onStop} className="rounded-full border border-line-2 px-3 py-1.5 text-[12px] text-muted transition hover:text-text">
            Stop
          </button>
        </div>
      ) : (
        narration.available && (
          <button onClick={narration.onSpeak} className="rounded-full border border-line-2 px-4 py-2 text-[12.5px] text-muted transition hover:border-gold/50 hover:text-text">
            Read it aloud
          </button>
        )
      )}
    </>
  );

  // On phones the chart comes right after the takeaway and the receipts follow it; from `lg` up they sit in the text column.
  return (
    <div className={`${styles.frame} h-full min-h-0 ${tier(a.title)}`}>
      <SceneFrame
        kicker={`“${q}”`}
        title={t.top}
        accent={t.accent}
        takeaway={takeaway(a)}
        meta={<div className="hidden lg:contents">{receipts}</div>}
        actions={<div className="hidden lg:contents">{actions}</div>}
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="label !text-cream">{a.measure}</span>
            <span className="label text-dim">by {a.dimension}</span>
          </div>
          <div ref={stage} className="min-w-0 lg:min-h-0 lg:flex-1">
            <AnswerChart a={a} r={r} height={desktop ? Math.round(box.h || 300) : 300} />
          </div>
          <div className="space-y-1">
            {a.detail !== takeaway(a) && <p className="text-[12.5px] leading-snug text-muted">{a.detail}</p>}
            {note && <p className="text-[12px] leading-snug text-ember">{note}</p>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 lg:hidden">{receipts}</div>
          <div className="mt-2 flex flex-wrap gap-2 lg:hidden">{actions}</div>
        </div>
      </SceneFrame>
    </div>
  );
}
