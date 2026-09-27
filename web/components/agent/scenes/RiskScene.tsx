"use client";

import { motion } from "motion/react";
import { RiskMeter, Stat, patternColor, riskTone } from "@/components/viz";
import { Chip, Provenance } from "@/components/scenes";
import type { SponsorLive } from "../Sponsors";
import { riskTakeaway } from "./copy";
import { Action, Sponsors, Stage, rise } from "./kit";
import { verdictOf, type Journey } from "./model";

/** Scene 1: the verdict. A giant ring sweeps to the model's risk; the word says what it means. */
export function RiskScene({ j, live, canHear, onHear, onAsk, onNext }: { j: Journey; live: SponsorLive; canHear: boolean; onHear: () => void; onAsk: () => void; onNext: () => void }) {
  const { st } = j;
  const risk = st.risk.value;
  const verdict = verdictOf(risk);
  const tone = riskTone(risk);
  const share = st.twin_cooked_share?.value ?? null;
  const pattern = st.pattern;

  return (
    <section className="grid h-full min-h-0 grid-cols-1 content-start gap-6 overflow-y-auto px-5 pb-6 pt-4 sm:px-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:content-center lg:items-center lg:gap-10 lg:overflow-hidden lg:px-10 xl:gap-14 xl:px-14">
      <header className="min-w-0">
        <motion.div {...rise(0)} className="label !text-gold">
          {st.major} · {st.track} · {st.entry_type === "Transfer" ? "transfer" : "first-time"}
        </motion.div>
        <motion.div {...rise(1)} className="display mt-3 text-[1.7rem] font-bold text-muted xl:text-[2.1rem]">
          {j.name ? `${j.name}, you're` : "You're"}
        </motion.div>
        <motion.h2 initial={{ opacity: 0, y: 24, filter: "blur(10px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ delay: 0.3, duration: 0.9, ease: [0.16, 1, 0.3, 1] }} className="display whitespace-nowrap text-[3.4rem] font-black leading-[0.86] sm:text-[4.6rem] xl:text-[5.25rem]" style={{ color: tone, textShadow: `0 0 46px color-mix(in srgb, ${tone} 45%, transparent)` }}>
          {verdict}.
        </motion.h2>
        {pattern && (
          <motion.div {...rise(3)} className="mt-3 inline-flex items-center gap-2 rounded-full border border-line-2 px-3 py-1 text-[12px] text-muted">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: patternColor(pattern) }} />
            trajectory: <span className="text-text">{pattern}</span>
          </motion.div>
        )}
        <motion.p {...rise(4)} className="serif mt-4 max-w-md text-[1.1rem] leading-snug text-muted lg:text-[1.28rem]">
          {riskTakeaway(j)}
        </motion.p>
        <motion.div {...rise(5)} className="mt-5 flex flex-wrap gap-1.5">
          <Provenance n={st.time_to_degree.support} tr={st.risk.tool_result_id} />
          <Chip tone={st.twins.refused ? "hot" : "dim"} title="alumni matched to you on work hours and credit load">
            {st.twins.refused ? "twins refused" : `${st.twins.n} twins`}
          </Chip>
          {j.alarm?.fires && (
            <Chip tone="hot" title="the Watchtower opened an alarm for this student">
              alarm #{j.alarm.id} open
            </Chip>
          )}
          <Sponsors live={live} keys={["model", "tiger"]} />
        </motion.div>
        <motion.div {...rise(6)} className="mt-6 flex flex-wrap gap-2">
          {canHear && <Action onClick={onHear}>▶ Hear the narrator</Action>}
          <Action onClick={onAsk}>
            Ask a question <kbd className="num rounded border border-line-2 px-1.5 text-[10px] text-dim">/</kbd>
          </Action>
          <Action primary onClick={onNext}>
            Timeline →
          </Action>
        </motion.div>
      </header>

      {/* RiskMeter (number + label + n) renders taller than the old needle gauge did; the single-column
          reserved height needs to clear it or the header row below starts overlapping it. */}
      <div className="relative order-first min-h-[420px] min-w-0 lg:order-none lg:h-full lg:max-h-[min(640px,100%)] lg:min-h-0">
        <Stage>
          {(box) => {
            const ring = box.desk ? Math.max(220, Math.min(box.w, box.h - 108, 540)) : Math.min(box.w, 270);
            return (
              <div className="flex h-full flex-col items-center justify-center gap-4">
                <RiskMeter value={risk} size={ring} label="model risk of getting cooked" n={st.time_to_degree.support} />
                <div className="grid w-full max-w-[34rem] grid-cols-3 divide-x divide-line border-t border-line pt-3">
                  <div className="px-3 first:pl-0">
                    {share !== null ? (
                      <Stat label="twins cooked" value={share * 100} format={(v) => `${Math.round(v)}%`} size="md" caption={`of ${st.twins.n} matched`} tone={riskTone(share)} />
                    ) : (
                      <Stat label="twins" value={0} size="md" caption="refused: need 30 balanced" />
                    )}
                  </div>
                  <div className="px-3">{st.plan ? <Stat label="finish at your pace" value={st.plan.projected_years.value} format={(v) => v.toFixed(1)} unit="yrs" size="md" caption={`${st.plan.load} credits a term`} /> : <Stat label="credits a term" value={st.avg_credits.value} format={(v) => v.toFixed(1)} size="md" />}</div>
                  <div className="px-3">
                    <Stat label="credits earned" value={st.credits_earned} unit={`/ ${st.credits_required}`} size="md" caption={`${st.terms_done.value} terms done`} />
                  </div>
                </div>
              </div>
            );
          }}
        </Stage>
      </div>
    </section>
  );
}
