"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ManualAudit } from "@/lib/agentApi";

const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "W", "P"];
const COURSE_ID = /^[A-Za-z]{2,5}\s?\d{3}[A-Za-z]?$/;
const MAJORS = ["Computer Science", "Information Systems"] as const;

interface CourseRow {
  id: string;
  credits: string;
  grade: string;
}
interface TermRow {
  key: number;
  label: string;
  mode: "summary" | "courses";
  attempted: string;
  earned: string;
  withdrawals: string;
  courses: CourseRow[];
}
export interface ManualDraft {
  firstName?: string;
  major?: string;
  entry?: "Transfer" | "First-Time Freshman";
  residency?: "" | "In-State" | "Out-of-State";
  creditsRequired?: number;
  terms?: { label: string; attempted: number; earned: number; withdrawals: number }[];
  inProgress?: string[];
}

let seq = 0;
const blankTerm = (n: number): TermRow => ({ key: ++seq, label: `Term ${n}`, mode: "summary", attempted: "", earned: "", withdrawals: "0", courses: [] });
const blankCourse = (): CourseRow => ({ id: "", credits: "3", grade: "A" });

const field = "num w-full rounded-lg border border-line-2 bg-transparent px-3 py-2 text-sm text-text outline-none transition placeholder:text-dim focus:border-gold/70 aria-[invalid=true]:border-hot/70";
const lab = "label !text-[10px] mb-1 block";

function Seg<T extends string>({ value, options, onChange, name }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-1 rounded-full border border-line-2 p-0.5">
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)} className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition ${value === o.v ? "bg-gold font-medium text-bg" : "text-muted hover:text-text"}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

/** Enter the audit by hand. Used when a file can't be read, or to correct what was read: the terms are the model's inputs. */
export function ManualForm({ draft, onSubmit, onClose }: { draft?: ManualDraft; onSubmit: (body: ManualAudit) => void; onClose: () => void }) {
  const [firstName, setFirstName] = useState(draft?.firstName ?? "");
  const [major, setMajor] = useState<string>(draft?.major ?? MAJORS[0]);
  const [entry, setEntry] = useState<"Transfer" | "First-Time Freshman">(draft?.entry ?? "First-Time Freshman");
  const [residency, setResidency] = useState<"" | "In-State" | "Out-of-State">(draft?.residency ?? "");
  const [required, setRequired] = useState(String(draft?.creditsRequired ?? 120));
  const [terms, setTerms] = useState<TermRow[]>(() =>
    draft?.terms?.length ? draft.terms.map((t, i) => ({ ...blankTerm(i + 1), label: t.label, attempted: String(t.attempted), earned: String(t.earned), withdrawals: String(t.withdrawals) })) : [blankTerm(1)],
  );
  const [inProgress, setInProgress] = useState((draft?.inProgress ?? []).join(", "));
  const [tried, setTried] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const req = num(required);
    if (!(req >= 30 && req <= 200)) e.required = "30 to 200 credits";
    if (!terms.length) e.terms = "Add at least one term";
    terms.forEach((t) => {
      const k = `t${t.key}`;
      if (!t.label.trim()) e[`${k}.label`] = "Name the term";
      if (t.mode === "summary") {
        const a = num(t.attempted);
        const ea = num(t.earned);
        const w = num(t.withdrawals);
        if (!(a >= 0 && a <= 30)) e[`${k}.attempted`] = "0 to 30";
        if (!(ea >= 0 && ea <= (Number.isNaN(a) ? 30 : a))) e[`${k}.earned`] = "0 to attempted";
        if (!(Number.isInteger(w) && w >= 0 && w <= 10)) e[`${k}.withdrawals`] = "0 to 10";
      } else {
        if (!t.courses.length) e[`${k}.courses`] = "Add a course, or switch to totals";
        t.courses.forEach((c, i) => {
          if (!COURSE_ID.test(c.id.trim())) e[`${k}.c${i}.id`] = "like CMSC201";
          const cr = num(c.credits);
          if (!(cr >= 0 && cr <= 12)) e[`${k}.c${i}.credits`] = "0 to 12";
        });
      }
    });
    const ip = inProgress.split(/[\s,;]+/).filter(Boolean);
    if (ip.some((c) => !COURSE_ID.test(c))) e.ip = `Not a course id: ${ip.filter((c) => !COURSE_ID.test(c)).join(", ")}`;
    return e;
  }, [terms, required, inProgress]);
  const bad = Object.keys(errors).length;
  const show = (k: string) => (tried ? errors[k] : undefined);

  const setTerm = (key: number, p: Partial<TermRow>) => setTerms((ts) => ts.map((t) => (t.key === key ? { ...t, ...p } : t)));
  const setCourse = (key: number, i: number, p: Partial<CourseRow>) => setTerms((ts) => ts.map((t) => (t.key === key ? { ...t, courses: t.courses.map((c, j) => (j === i ? { ...c, ...p } : c)) } : t)));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTried(true);
    if (bad) return;
    const clean = (id: string) => id.trim().toUpperCase().replace(/\s+/g, "");
    onSubmit({
      ...(firstName.trim() ? { first_name: firstName.trim() } : {}),
      major,
      entry_type: entry,
      ...(residency ? { residency } : {}),
      credits_required: Number(required),
      terms: terms.map((t) =>
        t.mode === "summary"
          ? { label: t.label.trim(), credits_attempted: Number(t.attempted), credits_earned: Number(t.earned), withdrawals: Number(t.withdrawals) }
          : { label: t.label.trim(), courses: t.courses.map((c) => ({ id: clean(c.id), credits: Number(c.credits), grade: c.grade })) },
      ),
      in_progress: inProgress.split(/[\s,;]+/).filter(Boolean).map(clean),
    });
  };

  const err = (k: string) => (show(k) ? <span className="num mt-0.5 block text-[10px] text-hot">{show(k)}</span> : null);

  return (
    <motion.div role="dialog" aria-modal="true" aria-label="Enter your terms by hand" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="fixed inset-0 z-[60] grid place-items-center bg-bg/70 p-3 backdrop-blur-sm sm:p-6">
      <motion.form onSubmit={submit} noValidate initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 190, damping: 24 }} className="glass flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-[24px] shadow-[0_30px_90px_rgba(0,0,0,0.6)]">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 pb-4 pt-5 sm:px-7">
          <div>
            <div className="label !text-gold">{draft?.terms ? "fix what we read" : "no file needed"}</div>
            <h2 className="display mt-1 text-[1.8rem] font-extrabold leading-none text-cream sm:text-[2.2rem]">Enter your terms</h2>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted">The model reads the same numbers as it would from a file: credits attempted and earned each term, withdrawals, and what you&apos;re taking now. Nothing is stored beyond this session&apos;s profile.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full border border-line-2 px-3 py-1 text-xs text-muted transition hover:text-text">
            Esc
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7">
          <section aria-label="Program" className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={lab}>First name (optional)</span>
              <input ref={first} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" className={field} placeholder="Ada" />
            </label>
            <label className="block">
              <span className={lab}>Major</span>
              <select value={major} onChange={(e) => setMajor(e.target.value)} className={field}>
                {MAJORS.map((m) => (
                  <option key={m} value={m} className="bg-panel">
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className={lab}>How you entered</span>
              <Seg name="Entry type" value={entry} onChange={setEntry} options={[{ v: "First-Time Freshman", l: "First-time" }, { v: "Transfer", l: "Transfer" }]} />
            </div>
            <div>
              <span className={lab}>Residency (optional)</span>
              <Seg name="Residency" value={residency} onChange={setResidency} options={[{ v: "", l: "Skip" }, { v: "In-State", l: "In-state" }, { v: "Out-of-State", l: "Out-of-state" }]} />
            </div>
            <label className="block">
              <span className={lab}>Credits required for your degree</span>
              <input value={required} onChange={(e) => setRequired(e.target.value)} inputMode="numeric" aria-invalid={!!show("required")} className={field} />
              {err("required")}
            </label>
          </section>

          <section aria-label="Terms">
            <div className="flex items-baseline justify-between">
              <h3 className="label !text-gold">Terms you finished</h3>
              <span className="text-[11px] text-dim">regular terms, oldest first · skip summer and winter</span>
            </div>
            {err("terms")}
            <ol className="mt-3 space-y-3">
              <AnimatePresence initial={false}>
                {terms.map((t, ti) => (
                  <motion.li key={t.key} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-xl border border-line bg-panel/50 p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <input aria-label={`Term ${ti + 1} name`} value={t.label} onChange={(e) => setTerm(t.key, { label: e.target.value })} aria-invalid={!!show(`t${t.key}.label`)} className={`${field} !w-36`} />
                      <div role="radiogroup" aria-label={`Term ${ti + 1} input style`} className="flex gap-1 rounded-full border border-line-2 p-0.5 text-[12px]">
                        {(["summary", "courses"] as const).map((m) => (
                          <button key={m} type="button" role="radio" aria-checked={t.mode === m} onClick={() => setTerm(t.key, { mode: m, courses: m === "courses" && !t.courses.length ? [blankCourse()] : t.courses })} className={`rounded-full px-3 py-1 transition ${t.mode === m ? "bg-gold/20 text-gold" : "text-dim hover:text-text"}`}>
                            {m === "summary" ? "Totals" : "Course by course"}
                          </button>
                        ))}
                      </div>
                      <button type="button" onClick={() => setTerms((ts) => ts.filter((x) => x.key !== t.key))} aria-label={`Remove term ${ti + 1}`} className="ml-auto rounded-full px-2 py-1 text-xs text-dim transition hover:text-hot">
                        Remove
                      </button>
                    </div>
                    {err(`t${t.key}.label`)}
                    {t.mode === "summary" ? (
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        {(["attempted", "earned", "withdrawals"] as const).map((f) => (
                          <label key={f} className="block">
                            <span className={lab}>{f === "withdrawals" ? "Withdrawals (courses)" : `Credits ${f}`}</span>
                            <input value={t[f]} onChange={(e) => setTerm(t.key, { [f]: e.target.value })} inputMode="numeric" aria-invalid={!!show(`t${t.key}.${f}`)} className={field} />
                            {err(`t${t.key}.${f}`)}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {t.courses.map((c, i) => (
                          <div key={i} className="grid grid-cols-[1fr_4.5rem_4.5rem_auto] items-start gap-2">
                            <div>
                              <input aria-label="Course id" value={c.id} onChange={(e) => setCourse(t.key, i, { id: e.target.value })} placeholder="CMSC201" aria-invalid={!!show(`t${t.key}.c${i}.id`)} className={`${field} uppercase`} />
                              {err(`t${t.key}.c${i}.id`)}
                            </div>
                            <div>
                              <input aria-label="Credits" value={c.credits} onChange={(e) => setCourse(t.key, i, { credits: e.target.value })} inputMode="numeric" aria-invalid={!!show(`t${t.key}.c${i}.credits`)} className={field} />
                              {err(`t${t.key}.c${i}.credits`)}
                            </div>
                            <select aria-label="Grade" value={c.grade} onChange={(e) => setCourse(t.key, i, { grade: e.target.value })} className={field}>
                              {GRADES.map((g) => (
                                <option key={g} className="bg-panel">
                                  {g}
                                </option>
                              ))}
                            </select>
                            <button type="button" aria-label="Remove course" onClick={() => setTerm(t.key, { courses: t.courses.filter((_, j) => j !== i) })} className="px-1 py-2 text-dim transition hover:text-hot">
                              ×
                            </button>
                          </div>
                        ))}
                        {err(`t${t.key}.courses`)}
                        <button type="button" onClick={() => setTerm(t.key, { courses: [...t.courses, blankCourse()] })} className="text-[13px] text-gold underline-offset-4 hover:underline">
                          + Add a course
                        </button>
                      </div>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
            <button
              type="button"
              onClick={() => {
                setTerms((ts) => [...ts, blankTerm(ts.length + 1)]);
                setTimeout(() => bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
              }}
              className="mt-3 rounded-full border border-dashed border-gold/50 px-4 py-2 text-[13px] text-gold transition hover:bg-gold/10"
            >
              + Add a term
            </button>
          </section>

          <section aria-label="In progress">
            <label className="block">
              <span className={lab}>Taking right now (optional)</span>
              <input value={inProgress} onChange={(e) => setInProgress(e.target.value)} placeholder="CMSC341, MATH152, ENGL393" aria-invalid={!!show("ip")} className={`${field} uppercase`} />
              {err("ip")}
              <span className="mt-1 block text-[11px] text-dim">Course ids separated by commas or spaces.</span>
            </label>
          </section>
          <div ref={bottom} />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-7">
          <p aria-live="polite" className="text-xs text-hot">
            {tried && bad ? `${bad} ${bad === 1 ? "field needs" : "fields need"} a look.` : ""}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-full border border-line-2 px-4 py-2 text-sm text-muted transition hover:text-text">
              Cancel
            </button>
            <button type="submit" className="rounded-full bg-gold px-5 py-2 text-sm font-medium text-bg transition hover:bg-gold-hi">
              Read my terms →
            </button>
          </div>
        </footer>
      </motion.form>
    </motion.div>
  );
}
