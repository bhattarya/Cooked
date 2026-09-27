"use client";

// DEV-ONLY (served at /dev/explore, 404 in production). Every number here is FAKE: it exists to exercise chart
// branches the real six queries never hit (refusal, empty, many long labels, small-sample gaps, failed provenance).
import { useState } from "react";
import { AppChrome } from "@/components/scenes";
import { AnswerScene } from "./AnswerScene";
import type { CohortAnswer, CohortRow } from "./model";

const tr = "tr_fake000000";
const rows = (list: [string, number, number | null, number?][]): CohortRow[] => list.map(([label, n, value, unknown]) => ({ label, n, value, ...(unknown ? { unknown } : {}), tool_result_id: tr }));
const base = { router: "local" as const, source: "Tiger Data · FAKE", tool_result_id: tr, disclaimer: "FAKE data for layout testing only. Not the HackUMBC dataset.", narration: { text: "FAKE narration. Group A averaged 1.00 years, while group B averaged 2.00 years. This is observational.", provenance: { ok: true } } };

const CASES: Record<string, CohortAnswer> = {
  "many long labels (horizontal bars)": { ...base, question: "FAKE: many groups with long labels", topic: "work", title: "FAKE long labels", detail: "FAKE detail text describing what the bars measure.", measure: "Years to degree", dimension: "fake group", unit: "years", rows: rows([["Computer Science, transfer students", 420, 4.12], ["Information Systems, transfer students", 310, 4.4], ["Computer Science, first-time freshmen", 1200, 3.8], ["Information Systems, first-time freshmen", 800, 3.95], ["Undeclared engineering pathway", 95, 4.7], ["Cybersecurity certificate track", 45, 4.2]]) },
  "refusal: every group under 30": { ...base, question: "FAKE: too few alumni", topic: "load", title: "FAKE tiny groups", detail: "FAKE: five groups, none with 30 alumni.", measure: "Years to degree", dimension: "credits / term", unit: "years", rows: rows([["≤7", 9, 6.1], ["8–9", 14, 5.2], ["10–11", 11, 4.4], ["12–13", 22, 4.0], ["14+", 6, 3.6]]) },
  "empty: no rows": { ...base, question: "FAKE: nothing came back", topic: "majors", title: "FAKE empty", detail: "FAKE: the query returned nothing.", measure: "Years to degree", dimension: "major", unit: "years", rows: [] },
  "one group": { ...base, question: "FAKE: a single group", topic: "majors", title: "FAKE one group", detail: "FAKE: only one comparable group.", measure: "Years to degree", dimension: "major", unit: "years", rows: rows([["Computer Science", 250, 3.9]]) },
  "line with small-n years (gaps)": { ...base, question: "FAKE: trend with thin years", topic: "cost", title: "FAKE thin years", detail: "FAKE: years with under 30 alumni become gaps.", measure: "Cost ÷ first salary", dimension: "graduation year", unit: "ratio", rows: rows([["2015", 165, 0.38], ["2016", 20, 0.31], ["2017", 145, 0.4], ["2018", 158, 0.39], ["2019", 12, 0.37], ["2020", 196, 0.43], ["2021", 172, 0.43]]) },
  "narration failed provenance": { ...base, question: "FAKE: narration failed its check", topic: "work", title: "FAKE provenance", detail: "FAKE: falls back to the query description because the narration failed its provenance check.", measure: "Years to degree", dimension: "work / week", unit: "years", narration: { text: "FAKE narration that must not be shown.", provenance: { ok: false } }, rows: rows([["0 h", 150, 3.5], ["1–10 h", 1500, 3.6], ["11–20 h", 1200, 4.1]]) },
  "internships shape (unknown column)": { ...base, question: "FAKE: unknown excluded", topic: "internships", title: "FAKE internships", detail: "FAKE: still-seeking share; No Response excluded.", measure: "Still seeking", dimension: "internships", unit: "%", rows: rows([["0", 640, 14.2, 130], ["1", 1170, 9.4, 200], ["2", 730, 6.3, 110], ["3+", 180, 4.4, 40]]) },
};

export function ExplorePlayground() {
  const names = Object.keys(CASES);
  const [k, setK] = useState(names[0]);
  return (
    <AppChrome user={{ name: "Dev", firstName: "Dev", guest: true }} active="explore" right={<span className="num rounded-full border border-hot/40 px-2 py-0.5 text-[10px] text-hot">FAKE DATA · dev playground</span>}>
      <div className="flex shrink-0 flex-wrap gap-1.5 px-6 pt-3">
        {names.map((n) => (
          <button key={n} onClick={() => setK(n)} aria-pressed={k === n} className={`rounded-full border px-3 py-1 text-[11px] ${k === n ? "border-gold/60 bg-gold/10 text-gold" : "border-line text-muted"}`}>
            {n}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0" key={k}>
          <AnswerScene answer={CASES[k]} idea="FAKE: next idea question" onIdea={() => {}} narration={{ available: true, speaking: false, onSpeak: () => {}, onStop: () => {} }} />
        </div>
      </div>
    </AppChrome>
  );
}
