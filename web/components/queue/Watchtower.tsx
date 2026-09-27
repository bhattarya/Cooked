"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Bars, int, pct } from "@/components/viz";
import { CLASSES, NO_PATTERN, fmtDay, levelOf, type Snapshot, type Student } from "./model";

const SHOW = 60;

/** Counts come from the queue response; individual rows exist only when the API and sign-in gate allow them. */
export function Watchtower({ snap, canSeeRows, staff, onStaff }: { snap: Snapshot; canSeeRows: boolean; staff: boolean; onStaff: (on: boolean) => void }) {
  const patterns = [...snap.patterns].sort((a, b) => b.atRisk - a.atRisk);
  return <main className="h-full overflow-y-auto px-4 py-6 sm:px-8 lg:px-12">
    <div className="mx-auto max-w-6xl">
      <p className="label !text-gold">Watchtower · current students</p>
      <h1 className="display mt-3 text-3xl font-bold text-cream sm:text-4xl">Students over the line</h1>
      <div className="mt-6 border-l-2 border-gold pl-4">
        <p className="num text-6xl font-semibold tracking-tight text-gold sm:text-7xl">{int(snap.atRisk)}</p>
        <p className="mt-2 text-sm text-text">of {int(snap.scored)} current students scored at or above the {pct(snap.threshold)} {snap.source === "model" ? "alarm" : "flag"} line</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        {snap.source === "model" ? <span>Trained risk model {snap.version}</span> : <span>Local matched-alumni engine · trained model API unavailable</span>}
        {snap.openAlarms !== null && <span>{int(snap.openAlarms)} open alarms in the log</span>}
        {snap.latestAlarmDay && <span>Latest alarm activity {fmtDay(snap.latestAlarmDay)}</span>}
        {snap.tr && <span className="num">Response {snap.tr}</span>}
      </div>
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-dim">These are synthetic students. Scores prompt advisor review; no action is taken automatically. An open alarm count can differ from the number currently over the line.</p>

      <section className="mt-8 rounded-xl border border-line bg-panel p-4 sm:p-6" aria-label="Students over the line by trajectory pattern">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-medium text-text">Where the risk sits</h2><p className="label">students by trajectory pattern</p></div>
        {patterns.length ? <Bars data={patterns.map(p => ({ key: p.name, label: p.name, value: p.atRisk, n: p.scored, color: "var(--gold)" }))} orientation="horizontal" format={v => int(v)} height={Math.max(230, patterns.length * 48 + 40)} unit="students over the line" label={`Students over the ${pct(snap.threshold)} line by pattern: ${patterns.map(p => `${p.name}, ${p.atRisk} of ${p.scored}`).join("; ")}.`} /> : <p className="py-8 text-sm text-muted">No pattern counts were returned.</p>}
        <p className="mt-2 text-xs text-muted">Each bar counts students at or above the {pct(snap.threshold)} line. Group sizes: {patterns.map(p => `${p.name} ${int(p.scored)}`).join(" · ")}.</p>
      </section>

      <div className="mt-7 border-t border-line pt-5">
        {canSeeRows ? <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-text">Student detail</h2><p className="mt-1 text-xs text-muted">Available to Google signed-in advisors.</p></div><div role="group" aria-label="View" className="inline-flex rounded-lg border border-line-2 p-1 text-xs"><button type="button" aria-pressed={!staff} onClick={() => onStaff(false)} className={`rounded px-3 py-1.5 ${!staff ? "bg-gold/15 text-gold" : "text-muted"}`}>Counts only</button><button type="button" aria-pressed={staff} onClick={() => onStaff(true)} className={`rounded px-3 py-1.5 ${staff ? "bg-gold/15 text-gold" : "text-muted"}`}>Student rows</button></div></div> : <div><p className="text-sm text-muted">Individual student rows require Google sign-in. Guests see counts only; the API enforces the same access rule.</p><Link href="/" className="mt-3 inline-block rounded-lg border border-gold/50 px-4 py-2 text-sm text-gold hover:border-gold">Sign in with Google →</Link></div>}
        {staff && canSeeRows && snap.students && <StudentTable snap={snap} students={snap.students} />}
      </div>
    </div>
  </main>;
}

function StudentTable({ snap, students }: { snap: Snapshot; students: Student[] }) {
  const [pat, setPat] = useState("All");
  const [cls, setCls] = useState<(typeof CLASSES)[number]>("All");
  const [show, setShow] = useState(SHOW);
  const flagged = useMemo(() => students.filter(s => levelOf(s.risk) !== "fine").sort((a,b) => b.risk-a.risk), [students]);
  const rows = flagged.filter(s => (pat === "All" || (s.pattern ?? NO_PATTERN) === pat) && (cls === "All" || s.cls === cls));
  return <section className="mt-5" aria-label="Ranked students">
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="text-muted">Pattern <select value={pat} onChange={e => {setPat(e.target.value); setShow(SHOW);}} className="ml-2 rounded border border-line-2 bg-panel px-2 py-1.5 text-text"><option>All</option>{snap.patterns.filter(p => p.atRisk > 0).map(p => <option key={p.name}>{p.name}</option>)}</select></label>
      <label className="text-muted">Class <select value={cls} onChange={e => {setCls(e.target.value as typeof cls); setShow(SHOW);}} className="ml-2 rounded border border-line-2 bg-panel px-2 py-1.5 text-text">{CLASSES.map(c => <option key={c}>{c}</option>)}</select></label>
      <span className="num text-dim">{int(rows.length)} at 20% or higher</span>
    </div>
    <div className="mt-4 overflow-x-auto rounded-xl border border-line">
      <table className="num w-full min-w-[650px] text-left text-xs"><caption className="sr-only">Current students with at least 20% risk, highest risk first</caption><thead className="bg-panel text-dim"><tr><th className="px-4 py-3 font-normal">Student</th><th className="px-3 py-3 font-normal">Pattern</th><th className="px-3 py-3 text-right font-normal">Risk</th><th className="px-3 py-3 text-right font-normal">Credits / term</th><th className="px-3 py-3 text-right font-normal">Work h / week</th><th className="px-4 py-3 text-right font-normal">Lead terms</th></tr></thead>
      <tbody>{rows.slice(0,show).map((s,i,shown) => <Fragment key={s.id}>{i > 0 && shown[i-1].risk >= snap.threshold && s.risk < snap.threshold && <tr><td colSpan={6} className="border-y border-gold/40 px-4 py-2 text-center text-xs text-gold">{snap.source === "model" ? "Alarm" : "Flag"} line · {pct(snap.threshold)} · watch list below</td></tr>}<tr className="border-t border-line"><td className="px-4 py-3 text-text">{s.id}<span className="block font-sans text-xs text-dim">{s.major} · {s.cls}</span></td><td className="px-3 py-3 text-muted">{s.pattern ?? NO_PATTERN}</td><td className={`px-3 py-3 text-right ${s.risk >= snap.threshold ? "text-gold" : "text-muted"}`}>{pct(s.risk)}</td><td className="px-3 py-3 text-right text-muted">{s.avgCredits.toFixed(1)}</td><td className="px-3 py-3 text-right text-muted">{s.work}</td><td className="px-4 py-3 text-right text-muted">{s.lead}</td></tr></Fragment>)}</tbody></table>
      {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">No students match these filters.</p>}
      {show < rows.length && <button type="button" onClick={() => setShow(n => n+SHOW)} className="w-full border-t border-line py-3 text-xs text-gold">Show more ({int(rows.length-show)} left)</button>}
    </div>
  </section>;
}
