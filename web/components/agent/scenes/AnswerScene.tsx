"use client";

import { motion } from "motion/react";
import { Chip } from "@/components/scenes";
import type { Answer, Visual } from "@/lib/agentApi";
import type { Dataset } from "@/lib/types";
import { AnswerVisual, TOOL_LABEL } from "../AnswerCard";
import { AnswerChart } from "../explore/AnswerChart";
import { read, type CohortAnswer } from "../explore/model";
import { SponsorChip, type SponsorLive } from "../Sponsors";
import { answerTitle } from "./copy";
import { DrillStage } from "./DrillScene";
import { Action, AnswerText, Stage, rise, type Box } from "./kit";
import type { DeckScene, DrillFull, Journey, RepairFull } from "./model";
import { RepairStage } from "./RepairScene";

const HOME: Partial<Record<Answer["tool"], { scene: DeckScene; label: string }>> = {
  stress_test: { scene: "drill", label: "Open the fire drill" },
  find_fix: { scene: "repair", label: "Open the repair" },
};

// A cohort_pattern answer reuses the cohort explorer's own chart engine (same shape the
// /explore endpoint returns), so a "how do other students..." question never needs a tab
// switch away from the audit conversation.
function CohortStage({ v, box }: { v: Extract<Visual, { type: "cohort" }>; box: Box }) {
  const a = v as unknown as CohortAnswer;
  const r = read(a);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label !text-cream">{v.measure}</span>
        <span className="label text-dim">by {v.dimension}</span>
      </div>
      <div className="min-h-0 flex-1">
        <AnswerChart a={a} r={r} height={Math.max(200, box.h - 44)} />
      </div>
      <p className="text-[11px] leading-snug text-dim">{v.disclaimer}</p>
    </div>
  );
}

/**
 * Scene 7: the answer to the latest question, with its history one tap away. Answers run long, so
 * this scene sets its headline smaller than the others and keeps the whole sentence readable.
 */
export function AnswerScene({ answers, index, onSelect, j, ds, live, onAsk, onGo, onAskAbout }: { answers: Answer[]; index: number; onSelect: (i: number) => void; j: Journey; ds: Dataset | null; live: SponsorLive; onAsk: () => void; onGo: (s: DeckScene) => void; onAskAbout: (q: string) => void }) {
  const a = answers[index];
  if (!a) return null;
  const t = answerTitle(a);
  const home = HOME[a.tool];
  const v = a.visual;

  return (
    <section className="grid h-full min-h-0 grid-cols-1 content-start gap-6 overflow-y-auto px-5 pb-6 pt-4 sm:px-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:content-center lg:items-center lg:gap-10 lg:overflow-hidden lg:px-10 xl:gap-14 xl:px-14">
      <header className="min-w-0">
        <motion.div {...rise(0)} className="label !text-gold line-clamp-2">
          you asked · “{a.question}”
        </motion.div>
        <motion.h2 {...rise(1)} className="display mt-3 text-[2.6rem] font-extrabold leading-[0.92] sm:text-5xl xl:text-[3.6rem]">
          {t.title}
          <br />
          <span className="text-gold-grad">{t.accent}</span>
        </motion.h2>
        <motion.p {...rise(2)} className="serif mt-4 max-w-md text-[1.1rem] leading-snug text-muted lg:text-[1.2rem]">
          <AnswerText segments={a.segments} />
        </motion.p>
        <motion.div {...rise(3)} className="mt-5 flex flex-wrap gap-1.5">
          <Chip tone={a.provenance.ok ? "gold" : "hot"} title="every number in this answer must trace back to a tool result">
            {a.provenance.ok ? `✓ ${a.provenance.tokens} numbers traced` : "blocked: an untraced number"}
          </Chip>
          <Chip>{TOOL_LABEL[a.tool] ?? "Cohort explorer"}</Chip>
          <SponsorChip k="gemini" live={a.router === "gemini" && live.gemini} compact />
          {(a.tool === "stress_test" || a.tool === "explain_risk") && <SponsorChip k="tiger" live={live.tiger} compact />}
          <SponsorChip k="model" live={live.model} compact />
        </motion.div>
        <motion.div {...rise(4)} className="mt-5 flex flex-wrap gap-2">
          <Action primary onClick={onAsk}>
            Ask another <kbd className="num rounded border border-bg/30 px-1.5 text-[10px]">/</kbd>
          </Action>
          {home && <Action onClick={() => onGo(home.scene)}>{home.label} →</Action>}
        </motion.div>
      </header>

      <div className="relative min-h-[300px] min-w-0 lg:h-full lg:max-h-[min(640px,100%)] lg:min-h-0">
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="min-h-0 flex-1">
            <Stage>
              {(box) =>
                v.type === "drill" ? (
                  <DrillStage d={v.drill as DrillFull} box={box} />
                ) : v.type === "repair" ? (
                  <RepairStage j={{ ...j, repair: v.repair as RepairFull }} r={v.repair as RepairFull} box={box} onAskAbout={onAskAbout} />
                ) : v.type === "cohort" ? (
                  <CohortStage v={v} box={box} />
                ) : (
                  <AnswerVisual a={a} j={j} ds={ds} />
                )
              }
            </Stage>
          </div>
          {answers.length > 1 && (
            <div className="shrink-0">
              <div className="label mb-1.5">earlier questions</div>
              <ul className="flex flex-wrap gap-1.5">
                {answers.map((x, i) => (
                  <li key={`${x.question}-${i}`}>
                    <button type="button" onClick={() => onSelect(i)} aria-current={i === index} className={`max-w-[16rem] truncate rounded-full border px-3 py-1 text-[12px] transition ${i === index ? "border-gold/60 bg-gold/10 text-gold" : "border-line text-muted hover:border-line-2 hover:text-text"}`}>
                      {x.question}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
