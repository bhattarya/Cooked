"use client";

// The audit journey as a state machine: home -> processing theatre -> scene deck. It owns the real
// calls (audit intake, the analysis pipeline, questions, work-hours re-runs, the careers scenario)
// and reports them as awaited steps, so what the theatre shows is what the backend is doing.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askAgent, getArena, getReceipt, manualAudit, remember, sayLine, setWorkHours, simulateScenario, uploadAudit, type Answer, type Call, type Intake, type ManualAudit, type Receipt, type Reading } from "@/lib/agentApi";
import { auditLines, auditPdf, validateAuditFile } from "@/lib/audit";
import { loadDataset } from "@/lib/data";
import type { Dataset, Student } from "@/lib/types";
import type { SessionUser } from "@/lib/session";
import type { Step } from "../Pipeline";
import type { SponsorLive } from "../Sponsors";
import { issueFromIntake, issueOf, type AuditIssue } from "../audit/issues";
import { analyse, auditPipelineSteps } from "./analyse";
import { narrator } from "./narrator";
import { SAMPLES, careersInput, type CareersState, type DeckScene, type DrillFull, type Journey, type RepairFull } from "./model";

export type Phase = "home" | "theatre" | "deck";

export interface RunResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

export interface AskResult extends RunResult {
  answer?: Answer;
  /** The deck scene that now shows the answer. */
  scene?: DeckScene;
}

/** What the models read from the audit. `derived` = built from the state endpoint because the receipt endpoint isn't available. */
export type ReceiptState = { status: "idle" | "loading" } | { status: "ready"; data: Receipt; derived: boolean };

export const READ_HOW: Record<Reading["method"], string> = { text: "read directly from the PDF text", vision: "read by Gemini vision", sample: "sample audit · synthetic student", manual: "entered by hand" };
const secs = (ms: number) => (ms < 950 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

export const NO_STUDENT = "No student is loaded yet. Drop a degree audit or load a sample student first.";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (q: string) => (q.length > 48 ? `${q.slice(0, 46)}…` : q);

export function useJourney({ user, live }: { user: SessionUser; live: SponsorLive }) {
  const [phase, setPhase] = useState<Phase>("home");
  const [steps, setSteps] = useState<Step[]>([]);
  const [exiting, setExiting] = useState(false);
  const [issue, setIssue] = useState<AuditIssue | null>(null);
  const [receipt, setReceipt] = useState<ReceiptState>({ status: "idle" });
  const [askingWork, setAskingWork] = useState(false);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [overrides, setOverrides] = useState<{ drill?: Answer; repair?: Answer }>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [careers, setCareers] = useState<CareersState>({ status: "idle" });

  const journeyRef = useRef<Journey | null>(null);
  const liveRef = useRef(live);
  const running = useRef(false);
  const workResolve = useRef<((h: number) => void) | null>(null);
  const careersPromise = useRef<Promise<CareersState> | null>(null);
  const lastAttempt = useRef<(() => Promise<RunResult>) | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onLoaded = useRef<() => void>(() => {});
  useEffect(() => {
    liveRef.current = live;
  });
  const commit = useCallback((j: Journey | null) => {
    journeyRef.current = j;
    setJourney(j);
  }, []);

  const patch = useCallback((key: string, p: Partial<Step>) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, ...p } : x))), []);

  // ---------- spoken lines from the server ----------
  const sayServer = useCallback(
    (line: "greeting" | "thanks" | "ask_work" | "ready", name: string | null) =>
      sayLine(line, name ?? undefined)
        .then((c) => narrator.say(c.data.text))
        .catch(() => undefined),
    [],
  );

  // ---------- the careers scenario (built from the student's real record) ----------
  const loadCareers = useCallback((j: Journey): Promise<CareersState> => {
    const input = careersInput(j.st, j.sample);
    if (!input) {
      const s: CareersState = { status: "unavailable", reason: "This record can't be mapped onto the Model Lab scenario faithfully (its major, entry type or terms are outside what the models were trained on)." };
      setCareers(s);
      return Promise.resolve(s);
    }
    setCareers({ status: "loading" });
    const p = Promise.all([simulateScenario(input.scenario), getArena().catch(() => null)])
      .then(([sim, arena]): CareersState => {
        const tasks = arena?.data.tasks;
        const champion = <M,>(c: { is_champion: boolean; metrics: M; label: string }[] | undefined) => c?.find((x) => x.is_champion);
        const career = champion(tasks?.career.candidates);
        const salary = champion(tasks?.salary.candidates);
        return {
          status: "ready",
          data: {
            input,
            sim: sim.data,
            trust: {
              careerFamily: tasks?.career.champion.family ?? null,
              careerMacroF1: career?.metrics.macro_f1 ?? null,
              salaryBias: salary?.metrics.bias ?? null,
              salaryFamily: tasks?.salary.champion.family ?? null,
            },
          },
        };
      })
      .catch((): CareersState => ({ status: "unavailable", reason: "The Model Lab couldn't be reached, so there is no careers outlook to show." }));
    careersPromise.current = p;
    void p.then((s) => {
      if (careersPromise.current === p) setCareers(s);
    });
    return p;
  }, []);

  const stKey = journey?.st;
  useEffect(() => {
    const j = journeyRef.current;
    if (j && j.st === stKey) void loadCareers(j);
  }, [stKey, loadCareers]);

  // ---------- leaving the theatre ----------
  const finishExit = useCallback(() => {
    clearTimeout(exitTimer.current);
    setExiting(false);
    setPhase((p) => (p === "theatre" ? "deck" : p));
  }, []);

  // ---------- the receipt: what the models actually read ----------
  const loadReceipt = useCallback(async (j: Journey) => {
    setReceipt({ status: "loading" });
    const real = await getReceipt(j.id);
    if (journeyRef.current?.id !== j.id) return;
    if (real) return setReceipt({ status: "ready", data: real, derived: false });
    // older API: only what the state endpoint reports; everything else stays unavailable, never guessed
    const st = j.st;
    setReceipt({
      status: "ready",
      derived: true,
      data: {
        terms: st.terms.map((t, i) => ({ label: `Term ${i + 1}`, attempted: t.attempted, earned: t.earned, withdrawals: t.withdrawals })),
        totals: { credits_earned: st.credits_earned, credits_in_progress: null, credits_required: st.credits_required, terms_completed: st.terms_done.value, withdrawals: st.w_total.value },
        features: [],
      },
    });
  }, []);

  // ---------- the audit pipeline ----------
  const runPipeline = useCallback(
    async (getIntake: () => Promise<Call<Intake>>, sample: Student | null, label: string, again: () => Promise<RunResult>): Promise<RunResult> => {
      if (running.current) return { ok: false, message: "Still working on the last audit. One moment." };
      running.current = true;
      lastAttempt.current = again;
      const lv = liveRef.current;
      setIssue(null);
      setExiting(false);
      setPhase("theatre");
      setSteps(auditPipelineSteps(lv));
      let name: string | null = user.guest ? null : user.firstName;
      void sayServer("thanks", name);
      const fail = (i: AuditIssue, keepRunning = true): RunResult => {
        setIssue(i);
        if (keepRunning) setSteps((st) => st.map((x) => (x.status === "running" ? { ...x, status: "error", result: "failed" } : x)));
        return { ok: false, message: `${i.title}. ${i.body}` };
      };
      try {
        const intake = await getIntake();
        const d = intake.data;
        if (!d.id) {
          const i = issueFromIntake(d);
          patch("read", { status: "error", result: i.title });
          narrator.say(i.title);
          return fail(i, false);
        }
        const s = d.summary!;
        if (d.first_name && user.guest) name = d.first_name;
        const method = d.reading?.method ?? (d.source === "sample" ? "sample" : d.source === "manual" ? "manual" : d.source === "gemini" ? "vision" : "text");
        const warnings = d.warnings ?? [];
        patch("read", {
          status: warnings.length ? "warn" : "done",
          live: method === "vision" && lv.gemini,
          result: `${READ_HOW[method]} in ${secs(d.reading?.ms ?? intake.ms)} · ${s.terms} terms · ${s.courses_done} courses done · ${s.in_progress} in progress · ${s.credits_earned}/${s.credits_required} credits${warnings.length ? ` · ${warnings.length} ${warnings.length === 1 ? "thing" : "things"} to check` : ""}`,
          tr: s.tool_result_id,
          ms: d.reading?.ms ?? intake.ms,
        });

        let hours: number | undefined;
        if (d.needs_work_hours) {
          setAskingWork(true);
          void sayServer("ask_work", name);
          hours = await new Promise<number>((resolve) => (workResolve.current = resolve));
          setAskingWork(false);
          await setWorkHours(d.id, hours);
        }

        const a = await analyse(d.id, hours, patch, lv);
        // memory can take a few seconds (Backboard); the deck does not wait for it beyond a short beat
        patch("memory", { status: "running" });
        const memory = remember(d.id, `Uploaded an audit and saw the COOKED dashboard (${a.st.pattern ?? "no pattern"}).`)
          .then((mem) => patch("memory", { status: "done", live: mem.data.stored === "backboard", result: mem.data.stored === "backboard" ? "remembered in Backboard" : "saved to app.memory_note", ms: mem.ms }))
          .catch(() => patch("memory", { status: "warn", result: "memory unavailable" }));

        const j: Journey = {
          id: d.id,
          name,
          source: d.source === "unavailable" ? "parser" : d.source,
          label,
          st: a.st,
          work: hours,
          load: a.load,
          drill: a.drill,
          repair: a.repair,
          myths: a.myths,
          headline: a.narration.text,
          alarm: a.alarm,
          sample,
          warnings,
          reading: d.reading ?? null,
        };
        commit(j);
        setAnswers([]);
        setOverrides({});
        void loadReceipt(j);
        onLoaded.current();
        await Promise.race([memory, sleep(1100)]);
        setExiting(true);
        exitTimer.current = setTimeout(finishExit, 4500); // the theatre normally calls back first
        void narrator.say(a.narration.text);
        const twins = a.st.twins.refused ? "Not enough matched alumni to say more, so COOKED refuses to guess." : `${a.st.twins.n} matched alumni.`;
        const check = warnings.length ? ` The reader flagged ${warnings.length} ${warnings.length === 1 ? "thing" : "things"} to check: ${warnings.join("; ")}.` : "";
        return {
          ok: true,
          message: `Loaded ${label} (${READ_HOW[method]}). ${a.st.credits_earned} of ${a.st.credits_required} credits earned over ${a.st.terms_done.value} terms. Model risk is ${Math.round(a.st.risk.value * 100)} percent, ${a.st.risk.value >= 0.5 ? "already cooked" : a.st.risk.value >= 0.2 ? "on watch" : "on track"}. ${twins}${check} ${a.narration.text}`,
          data: { student: d.id, risk_percent: Math.round(a.st.risk.value * 100), twins: a.st.twins.n, twins_refused: a.st.twins.refused, credits_earned: a.st.credits_earned, terms: a.st.terms_done.value, warnings },
        };
      } catch (e) {
        return fail(issueOf("server", { detail: e instanceof Error ? e.message : null, canManual: false }));
      } finally {
        running.current = false;
        workResolve.current = null;
        setAskingWork(false);
      }
    },
    [commit, finishExit, loadReceipt, patch, sayServer, user.firstName, user.guest],
  );

  const runAudit = useCallback(
    (file: Blob, filename: string, sample: Student | null = null, label = "Your audit"): Promise<RunResult> => {
      if (!sample) {
        const bad = validateAuditFile({ name: filename, size: file.size, type: file.type });
        if (bad) {
          const i = issueOf(bad.code, { body: bad.message, canRetry: false });
          setIssue(i);
          return Promise.resolve({ ok: false, message: bad.message });
        }
      }
      const again = () => runPipeline(() => uploadAudit(file, filename), sample, label, again);
      return again();
    },
    [runPipeline],
  );

  const runManual = useCallback(
    (body: ManualAudit): Promise<RunResult> => {
      const again = () => runPipeline(() => manualAudit(body), null, "Your terms", again);
      return again();
    },
    [runPipeline],
  );

  const runSample = useCallback(
    async (cid: string): Promise<RunResult> => {
      const sample = SAMPLES.find((s) => s.id === cid);
      let ds: Dataset;
      try {
        ds = await loadDataset();
      } catch {
        return { ok: false, message: "The sample students couldn't be loaded." };
      }
      const s = ds.current.find((x) => x.id === cid);
      if (!s) return { ok: false, message: "That sample student isn't in the dataset." };
      return runAudit(auditPdf(auditLines(s, ds.catalog)), `sample-${cid}.pdf`, s, sample?.label ?? cid);
    },
    [runAudit],
  );

  const retry = useCallback(() => {
    const again = lastAttempt.current;
    if (again) void again();
  }, []);
  const dismissIssue = useCallback(() => setIssue(null), []);

  const answerWork = useCallback((hours: number) => workResolve.current?.(hours), []);
  const waitingForWork = useCallback(() => workResolve.current !== null, []);

  const backHome = useCallback(() => {
    clearTimeout(exitTimer.current);
    setExiting(false);
    setAskingWork(false);
    setIssue(null);
    setPhase("home");
  }, []);
  const showDeck = useCallback(() => setPhase("deck"), []);

  // ---------- questions ----------
  const ask = useCallback(
    async (question: string): Promise<AskResult> => {
      const j = journeyRef.current;
      const q = question.trim();
      if (!j) return { ok: false, message: NO_STUDENT };
      if (!q) return { ok: false, message: "I need a question to answer." };
      setBusy(`Answering “${short(q)}”`);
      try {
        const c = await askAgent(j.id, q, j.work, j.load);
        const a = c.data;
        setAnswers((prev) => [a, ...prev].slice(0, 8));
        let scene: DeckScene = "answer";
        // a tool that maps cleanly onto a scene moves the deck there, with the answer as its takeaway
        if (a.tool === "stress_test" && a.visual.type === "drill") {
          commit({ ...j, drill: a.visual.drill as DrillFull });
          setOverrides((o) => ({ ...o, drill: a }));
          scene = "drill";
        } else if (a.tool === "find_fix" && a.visual.type === "repair") {
          commit({ ...j, repair: a.visual.repair as RepairFull });
          setOverrides((o) => ({ ...o, repair: a }));
          scene = "repair";
        }
        void narrator.say(a.text, a.tool === "find_fix" ? "coach" : "narrator");
        const ids = [...new Set(a.segments.flatMap((s) => ("tool_result_id" in s ? [s.tool_result_id] : [])))];
        return { ok: true, message: a.text, answer: a, scene, data: { question: q, tool: a.tool, numbers_traced: a.provenance.tokens, evidence: ids.slice(0, 6), scene } };
      } catch {
        narrator.say("Sorry, I couldn't answer that one.");
        return { ok: false, message: "The analysis failed. Try asking again." };
      } finally {
        setBusy(null);
      }
    },
    [commit],
  );

  // ---------- "what if I work N hours": re-run the whole state, like the work-hours question ----------
  const applyWork = useCallback(
    async (hours: number): Promise<RunResult> => {
      const j = journeyRef.current;
      if (!j) return { ok: false, message: NO_STUDENT };
      const before = j.st.risk.value;
      setBusy(`Re-running your plan at ${hours} hours a week`);
      try {
        await setWorkHours(j.id, hours);
        const a = await analyse(j.id, hours, () => {}, liveRef.current);
        commit({ ...j, work: hours, st: a.st, load: a.load, drill: a.drill, repair: a.repair, headline: a.narration.text, alarm: a.alarm });
        setOverrides({});
        void narrator.say(a.narration.text);
        const now = a.st.risk.value;
        return {
          ok: true,
          message: `Work hours set to ${hours} a week. Model risk is now ${Math.round(now * 100)} percent, was ${Math.round(before * 100)}. ${a.st.twins.refused ? "Not enough matched alumni for outcome ranges." : `${a.st.twins.n} matched alumni.`}`,
          data: { work_hours: hours, risk_percent: Math.round(now * 100), previous_risk_percent: Math.round(before * 100) },
        };
      } catch {
        return { ok: false, message: "I couldn't re-run the plan at that work schedule." };
      } finally {
        setBusy(null);
      }
    },
    [commit],
  );

  const scenes = useMemo(
    () => [
      { id: "risk", label: "Verdict" },
      { id: "receipt", label: "What we read" },
      { id: "timeline", label: "Timeline" },
      { id: "twins", label: "Twins" },
      { id: "drill", label: "Fire drill", disabled: !journey?.drill },
      { id: "repair", label: "Repair", disabled: !journey?.repair },
      { id: "careers", label: "Careers", disabled: careers.status === "unavailable" },
      { id: "answer", label: "Answer", disabled: answers.length === 0 },
    ],
    [journey?.drill, journey?.repair, careers.status, answers.length],
  );

  const greet = useCallback(() => sayServer("greeting", journeyRef.current?.name ?? (user.guest ? null : user.firstName)), [sayServer, user.firstName, user.guest]);

  const setOnLoaded = useCallback((fn: () => void) => {
    onLoaded.current = fn;
  }, []);

  return {
    phase,
    steps,
    exiting,
    issue,
    receipt,
    askingWork,
    journey,
    answers,
    overrides,
    busy,
    careers,
    scenes,
    runAudit,
    runSample,
    runManual,
    retry,
    dismissIssue,
    answerWork,
    waitingForWork,
    backHome,
    showDeck,
    finishExit,
    ask,
    applyWork,
    setOnLoaded,
    greet,
    careersReady: () => careersPromise.current,
  };
}
