"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Fragment, useMemo, useState } from "react";
import { Chip, Provenance } from "@/components/scenes";
import { Bars, CountUp, LineChart, alpha, int, pct, patternColor, riskTone, type BarGroup } from "@/components/viz";
import { BAND, CLASSES, NO_PATTERN, bandShares, fmtDay, levelOf, type PatternStat, type Snapshot, type Student } from "./model";

const SHOW = 60;

const headline = (s: Snapshot) => (s.source === "model" && s.openAlarms !== null ? { value: s.openAlarms, label: "open alarms" } : { value: s.atRisk, label: s.source === "model" ? "at or over the alarm line" : "flagged students" });

function takeaway(s: Snapshot): string {
  const line = s.threshold.toFixed(2);
  if (s.source === "local") return `The in-browser engine flags ${int(s.atRisk)} of ${int(s.scored)} current students against matched alumni. The trained model isn't reachable right now.`;
  if (s.openAlarms === null) return `${int(s.atRisk)} of ${int(s.scored)} current students score at or above the ${line} alarm line.`;
  return `${int(s.atRisk)} of ${int(s.scored)} current students score at or above the ${line} alarm line, and ${int(s.openAlarms)} alarms are open in the Watchtower's log.`;
}

/** The Watchtower: one instrument, no page scroll. Headline count, where the risk sits, and (for signed-in advisors) the ranked students. */
export function Watchtower({ snap, canSeeRows, staff, onStaff }: { snap: Snapshot; canSeeRows: boolean; staff: boolean; onStaff: (on: boolean) => void }) {
  const h = headline(snap);
  return (
    <div className="grid h-full min-h-0 grid-cols-1 content-start gap-7 overflow-y-auto px-5 pb-6 pt-5 sm:px-8 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:content-center lg:items-center lg:gap-10 lg:overflow-hidden lg:px-10 xl:gap-14 xl:px-14">
      <header className="min-w-0">
        <div className="label !text-gold">Watchtower · current students</div>
        <h1 className="mt-3">
          <CountUp value={h.value} format={(v) => int(Math.round(v))} className="display text-gold-grad block text-[6.5rem] font-black leading-[0.82] sm:text-[8rem] xl:text-[9.5rem]" />
          <span className="display mt-1 block text-3xl font-extrabold text-cream sm:text-4xl xl:text-[2.6rem]">{h.label}</span>
        </h1>
        <p className="serif mt-4 max-w-md text-xl leading-snug text-muted sm:text-2xl">{takeaway(snap)}</p>
        <div className="mt-5 flex flex-wrap gap-1.5">
          <Provenance n={snap.scored} tr={snap.tr} />
          {snap.version && (
            <Chip tone="gold" title="the trained model that scored every current student">
              model {snap.version}
            </Chip>
          )}
          {snap.latestAlarmDay && <Chip title="newest day with alarm activity in the Watchtower log">alarms {fmtDay(snap.latestAlarmDay)}</Chip>}
          {snap.source === "local" && <Chip title="the API is unreachable, so this is the in-browser engine">local engine</Chip>}
          <Chip title={snap.source === "model" ? "an alarm opens when risk reaches this line" : "students at or above this risk are flagged"}>{snap.source === "model" ? "alarm line" : "flag line"} ≥ {snap.threshold.toFixed(2)}</Chip>
        </div>
        <p className="mt-3 max-w-md text-[12px] leading-relaxed text-dim">It prompts advisors; it never acts on its own. All students are synthetic.</p>
        <div className="mt-5">
          {canSeeRows ? (
            <div role="group" aria-label="View" className="inline-flex rounded-full border border-line-2 bg-panel/70 p-0.5 text-[12.5px]">
              {[
                { on: false, label: "Counts" },
                { on: true, label: "Student rows" },
              ].map((o) => (
                <button key={o.label} aria-pressed={staff === o.on} onClick={() => onStaff(o.on)} className={`rounded-full px-4 py-1.5 transition ${staff === o.on ? "bg-gold/15 text-gold shadow-[inset_0_0_0_1px_rgba(246,180,26,0.4)]" : "text-muted hover:text-text"}`}>
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-[13px] text-gold transition hover:border-gold/70 hover:bg-gold/15">
              Sign in with Google to see student rows <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      </header>

      <div className="min-h-0 min-w-0 lg:h-full lg:max-h-[min(700px,100%)]">
        {staff && snap.students ? <StaffStage snap={snap} students={snap.students} /> : <CountsStage snap={snap} canSeeRows={canSeeRows} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- counts (everyone)

function CountsStage({ snap, canSeeRows }: { snap: Snapshot; canSeeRows: boolean }) {
  const patterns = [...snap.patterns].sort((a, b) => b.atRisk - a.atRisk);
  const over = snap.source === "model" ? `at or above ${snap.threshold.toFixed(2)}` : `at or above ${snap.threshold.toFixed(2)} (flag line)`;
  const groups: BarGroup[] = patterns.map((p) => ({ key: p.name, label: p.name, values: [p.atRisk, Math.max(0, p.scored - p.atRisk)], n: p.scored }));
  return (
    <motion.div key="counts" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="label !text-cream">Who is over the line</span>
          <span className="label text-dim">students by trajectory pattern</span>
        </div>
        <div className="mt-2">
          <Bars
            groups={groups}
            series={[
              { key: "over", label: over, color: "var(--hot)" },
              { key: "under", label: "below the line", color: "rgba(168,159,138,0.34)" },
            ]}
            mode="stacked"
            orientation="horizontal"
            height={patterns.length * 40 + 34}
            unit="students"
            label={`Students by pattern: ${patterns.map((p) => `${p.name}, ${p.atRisk} of ${p.scored} ${over}`).join("; ")}.`}
          />
        </div>
      </div>
      <Ledger snap={snap} patterns={patterns} />
      {!canSeeRows && <p className="text-[12.5px] leading-relaxed text-dim">Per-student rows are for advisors signed in with Google. Guests see counts only; the API enforces the same rule.</p>}
    </motion.div>
  );
}

function Ledger({ snap, patterns }: { snap: Snapshot; patterns: PatternStat[] }) {
  const model = snap.source === "model";
  return (
    <div className="min-h-0 overflow-x-auto">
      <table className="num w-full min-w-[440px] text-left text-[12px]">
        <caption className="sr-only">Students by pattern: scored, at or over the line, average risk and open alarms</caption>
        <thead>
          <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.1em] text-dim">
            <th scope="col" className="py-2 pr-3 font-normal">
              Pattern
            </th>
            <th scope="col" className="px-2 py-2 text-right font-normal">
              Scored
            </th>
            <th scope="col" className="px-2 py-2 text-right font-normal">
              Over line
            </th>
            <th scope="col" className="px-2 py-2 text-right font-normal">
              Avg risk
            </th>
            {model && (
              <>
                <th scope="col" className="px-2 py-2 text-right font-normal">
                  Open alarms
                </th>
                <th scope="col" className="py-2 pl-2 text-right font-normal">
                  Avg risk, open
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {patterns.map((p) => (
            <tr key={p.name} className="border-b border-line/60">
              <th scope="row" className="py-2 pr-3 font-normal">
                <PatternTag name={p.name} />
              </th>
              <td className="px-2 py-2 text-right text-muted">{int(p.scored)}</td>
              <td className="px-2 py-2 text-right text-text">
                {int(p.atRisk)} <span className="text-dim">({pct(p.atRisk / Math.max(1, p.scored))})</span>
              </td>
              <td className="px-2 py-2 text-right" style={{ color: p.avgRisk >= snap.threshold ? riskTone(p.avgRisk) : "var(--muted)" }}>
                {pct(p.avgRisk)}
              </td>
              {model && (
                <>
                  <td className="px-2 py-2 text-right text-text">{p.open === null ? "—" : int(p.open)}</td>
                  <td className="py-2 pl-2 text-right text-muted">{p.openAvgRisk === null ? "—" : pct(p.openAvgRisk)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PatternTag({ name }: { name: string }) {
  const c = name === NO_PATTERN ? "var(--dim)" : patternColor(name);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: alpha(c, 0.45), color: "var(--text)", background: alpha(c, 0.1) }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {name}
    </span>
  );
}

// ---------------------------------------------------------------- student rows (signed-in advisors)

function StaffStage({ snap, students }: { snap: Snapshot; students: Student[] }) {
  const [pat, setPat] = useState<string>("All");
  const [cls, setCls] = useState<(typeof CLASSES)[number]>("All");
  const [show, setShow] = useState(SHOW);

  const dist = useMemo(() => bandShares(students), [students]);
  const flagged = useMemo(() => students.filter((s) => levelOf(s.risk) !== "fine").sort((a, b) => b.risk - a.risk), [students]);
  const rows = useMemo(() => flagged.filter((s) => (pat === "All" || (s.pattern ?? NO_PATTERN) === pat) && (cls === "All" || s.cls === cls)), [flagged, pat, cls]);
  const line = snap.threshold;

  return (
    <motion.div key="staff" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="label !text-cream">Where each pattern sits on the risk scale</span>
          <span className="label hidden text-dim sm:inline">share of a pattern&apos;s students per {BAND}% band</span>
        </div>
        <LineChart
          x={dist.x}
          xFormat={(v) => `${v}%`}
          xTicks={[0, 20, 40, 60, 80]}
          series={dist.series.map((s) => ({ key: s.name, label: `${s.name} (${int(s.n)})`, color: s.name === NO_PATTERN ? "var(--dim)" : patternColor(s.name), y: s.y, area: true, format: (v: number) => pct(v, 1) }))}
          yFormat={(v) => pct(v)}
          yTicks={3}
          curve="monotone"
          thresholds={[]}
          events={[{ x: Math.round(line * 100), label: `${snap.source === "model" ? "alarm" : "flag"} line ${Math.round(line * 100)}%`, tone: "risk" }]}
          height={172}
          xLabel="risk"
          n={students.length}
        />
      </div>

      <section aria-label="Ranked students" className="panel flex min-h-[260px] min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {["All", ...snap.patterns.filter((p) => p.atRisk > 0).map((p) => p.name)].map((p) => (
              <button key={p} aria-pressed={pat === p} onClick={() => { setPat(p); setShow(SHOW); }} className={`rounded-full px-2.5 py-1 text-[11.5px] transition ${pat === p ? "bg-white/10 text-text" : "text-muted hover:text-text"}`}>
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 sm:ml-auto">
            {CLASSES.map((c) => (
              <button key={c} aria-pressed={cls === c} onClick={() => { setCls(c); setShow(SHOW); }} className={`rounded-full px-2 py-1 text-[11px] transition ${cls === c ? "bg-white/10 text-text" : "text-dim hover:text-muted"}`}>
                {c}
              </button>
            ))}
          </div>
          <span className="num text-[11px] text-dim">{int(rows.length)} at 20%+</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" tabIndex={0} aria-label="Students ranked by risk">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">No students match these filters.</p>
          ) : (
            <table className="num w-full text-left text-[12px]">
              <caption className="sr-only">Current students at 20% risk or higher, highest first</caption>
              <thead className="sticky top-0 z-10 bg-panel-2 text-[10.5px] uppercase tracking-[0.1em] text-dim">
                <tr>
                  <th scope="col" className="px-4 py-2 font-normal">
                    Student
                  </th>
                  <th scope="col" className="hidden px-2 py-2 font-normal sm:table-cell">
                    Pattern
                  </th>
                  <th scope="col" className="w-[34%] px-2 py-2 font-normal">
                    Risk
                  </th>
                  <th scope="col" className="hidden px-2 py-2 text-right font-normal md:table-cell">
                    cr/term
                  </th>
                  <th scope="col" className="hidden px-2 py-2 text-right font-normal md:table-cell">
                    h/wk
                  </th>
                  <th scope="col" className="hidden py-2 pl-2 pr-4 text-right font-normal xl:table-cell">
                    lead
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, show).map((s, i, arr) => (
                  <Fragment key={s.id}>
                    {i > 0 && arr[i - 1].risk >= line && s.risk < line && (
                      <tr aria-hidden>
                        <td colSpan={6} className="border-y border-dashed border-hot/40 bg-hot/[0.04] px-4 py-1 text-center text-[10.5px] uppercase tracking-[0.14em] text-hot/80">
                          {snap.source === "model" ? "alarm" : "flag"} line {line.toFixed(2)} · watch list below
                        </td>
                      </tr>
                    )}
                    <StudentRow s={s} line={line} />
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
          {show < rows.length && (
            <button onClick={() => setShow((n) => n + SHOW)} className="w-full py-3 text-[12px] text-muted hover:text-text">
              Show more ({int(rows.length - show)} left)
            </button>
          )}
        </div>
      </section>
    </motion.div>
  );
}

function StudentRow({ s, line }: { s: Student; line: number }) {
  const level = levelOf(s.risk);
  const tone = riskTone(s.risk);
  return (
    <tr className="border-b border-line/60 transition hover:bg-white/[0.025]">
      <td className="px-4 py-2">
        <div className="text-text">{s.id}</div>
        <div className="max-w-[16ch] truncate font-sans text-[11px] text-dim sm:max-w-[22ch]" title={`${s.major} · ${s.cls}`}>
          {s.major} · {s.cls}
        </div>
      </td>
      <td className="hidden px-2 py-2 sm:table-cell">
        <PatternTag name={s.pattern ?? NO_PATTERN} />
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          <span className="relative h-1.5 flex-1 rounded-full bg-white/[0.06]" aria-hidden>
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, s.risk * 100)}%`, background: tone }} />
            <span className="absolute -inset-y-0.5 w-px bg-cream/50" style={{ left: `${line * 100}%` }} />
          </span>
          <span className="w-9 text-right" style={{ color: tone }}>
            {Math.round(s.risk * 100)}%<span className="sr-only"> {level}</span>
          </span>
        </div>
      </td>
      <td className={`hidden px-2 py-2 text-right md:table-cell ${s.avgCredits < 12 ? "text-gold" : "text-muted"}`}>{s.avgCredits.toFixed(1)}</td>
      <td className={`hidden px-2 py-2 text-right md:table-cell ${s.work >= 20 ? "text-gold" : "text-muted"}`}>{s.work}</td>
      <td className="hidden py-2 pl-2 pr-4 text-right text-muted xl:table-cell">{s.lead}t</td>
    </tr>
  );
}
