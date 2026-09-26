"use client";

import { useMemo, useState } from "react";
import styles from "./cooked-experience.module.css";
import { useDataset } from "../lib/data";
import { alarmCheck, alarmScript, avgLoad, findTwins, fireDrill, getState, outcomesOf, planOutcome, project, repair, segText, stateFrom, survival } from "../lib/engine";
import type { Dataset, Student } from "../lib/types";

type View = "overview" | "drill" | "evidence";
type Persona = "spiral" | "grind" | "smooth";
type Band = "heavy" | "all" | "light";

const personas: { key: Persona; title: string; detail: string; glyph: string }[] = [
  { key: "spiral", title: "The rough patch", detail: "Withdrawals are stacking up", glyph: "↘" },
  { key: "grind", title: "The slow burn", detail: "Work and light loads collide", glyph: "↝" },
  { key: "smooth", title: "The steady path", detail: "A useful comparison", glyph: "↗" },
];
const percent = (n: number) => String(Math.round(n * 100)) + "%";
const decimal = (n: number) => Number.isFinite(n) ? n.toFixed(1) : "—";
const titleCase = (s: string) => s.replace(/\b\w/g, (letter) => letter.toUpperCase());

function pickPersona(ds: Dataset, key: Persona): Student | undefined {
  const candidates = ds.meta.demo[key].map((id) => ds.current.find((s) => s.id === id)).filter((s): s is Student => Boolean(s));
  if (key === "spiral") {
    const featured = candidates.find((s) => s.id === "CID-990184");
    if (featured) return featured;
  }
  return candidates.find((s) => !findTwins(ds, stateFrom(s)).data.refused) ?? candidates[0];
}

function termLabels(first: string | null, count: number) {
  const match = first?.match(/(Spring|Fall)\s+(\d{4})/);
  if (!match) return Array.from({ length: count }, (_, i) => "Term " + (i + 1));
  let index = Number(match[2]) * 2 + (match[1] === "Fall" ? 1 : 0);
  return Array.from({ length: count }, () => {
    const label = (index % 2 ? "Fall " : "Spring ") + Math.floor(index / 2);
    index++;
    return label;
  });
}

function SurvivalChart({ values }: { values: { t: number; alive: number; graduated: number }[] }) {
  const width = 660, height = 220, left = 38, top = 14, right = 12, bottom = 32;
  const x = (t: number) => left + t * (width - left - right) / Math.max(1, values.length - 1);
  const y = (v: number) => top + (1 - v) * (height - top - bottom);
  const line = (key: "alive" | "graduated") => values.map((point, i) => (i ? "L" : "M") + x(point.t).toFixed(1) + " " + y(point[key]).toFixed(1)).join(" ");
  return <div className={styles.chart}>
    <svg viewBox={"0 0 " + width + " " + height} role="img" aria-label="Simulated trajectories under the cooked threshold over ten future terms">
      {[0, .25, .5, .75, 1].map((v) => <g key={v}><line x1={left} x2={width - right} y1={y(v)} y2={y(v)} className={styles.gridline}/><text x={left - 8} y={y(v) + 4} textAnchor="end">{Math.round(v * 100)}</text></g>)}
      <path d={line("alive")} className={styles.chartCoral}/><path d={line("graduated")} className={styles.chartBlue}/>
      {values.filter((_, i) => i % 2 === 0).map((point) => <text key={point.t} x={x(point.t)} y={height - 5} textAnchor="middle">{point.t ? "+" + point.t : "Now"}</text>)}
    </svg>
    <div className={styles.legend}><span><i className={styles.coralKey}/>Under threshold</span><span><i className={styles.blueKey}/>Graduated in simulation</span></div>
  </div>;
}

export default function CookedExperience() {
  const ds = useDataset();
  const [view, setView] = useState<View>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [planOverride, setPlanLoad] = useState<number | null>(null);
  const [workOverride, setWork] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [explanation, setExplanation] = useState(false);
  const [band, setBand] = useState<Band>("heavy");
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<"yes" | "no" | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const effectiveId = selectedId ?? (ds ? pickPersona(ds, "spiral")?.id ?? ds.current[0]?.id : null);
  const student = ds?.current.find((s) => s.id === effectiveId) ?? null;
  const planLoad = planOverride ?? (student ? Math.max(6, Math.min(18, Math.round(avgLoad(student.terms) || 13))) : 13);
  const work = workOverride ?? student?.work ?? 10;

  const model = useMemo(() => {
    if (!ds || !student) return null;
    const state = stateFrom(student, { work, planLoad });
    const twins = findTwins(ds, state);
    const outcomes = outcomesOf(twins.data.twins);
    return {
      state, twins, outcomes,
      plan: planOutcome(ds, state, twins.data),
      alarm: alarmCheck(state, outcomes, twins.data),
      current: getState(state),
      drill: fireDrill(ds.meta, state),
      curve: survival(ds.meta, state),
      fix: repair(ds, state, twins.data),
    };
  }, [ds, student, work, planLoad]);

  const searchResults = !ds || query.trim().length < 3 ? [] : ds.current.filter((s) => s.id.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5);

  function selectStudent(id: string) {
    setSelectedId(id);
    setPlanLoad(null);
    setWork(null);
    setStarted(false);
    setRevealed(0);
    setExplanation(false);
    setFeedback(null);
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setView("overview");
    setQuery("");
  }
  function startDrill() { setView("drill"); setStarted(true); setRevealed(0); }
  function speak(script: string) {
    if (!window.speechSynthesis) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(script);
    utterance.rate = .94;
    utterance.pitch = .93;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  if (!ds || !student || !model) return <div className={styles.loading}><strong>COOKED<span>●</span></strong><div/><p>Preparing the synthetic cohort…</p></div>;

  const { state, twins, outcomes, plan, alarm, current, drill, curve, fix } = model;
  const refused = twins.data.refused;
  const baseline = project(state, []);
  const labels = termLabels(student.firstTerm, student.terms.length);
  const script = segText(alarmScript(state, outcomes, twins, current));
  const activePersona = (Object.keys(ds.meta.demo) as Persona[]).find((key) => ds.meta.demo[key].includes(student.id));
  const title = view === "overview" ? "Student overview" : view === "drill" ? "Fire drill" : "Evidence lab";

  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><div className={styles.brandMark}>C<span>●</span></div><div><strong>COOKED</strong><small>Trajectory intelligence</small></div></div>
      <div className={styles.sideLabel}>WORKSPACE</div>
      <nav className={styles.nav} aria-label="Primary">
        <button className={view === "overview" ? styles.active : ""} onClick={() => setView("overview")}><span>▦</span> Overview <small>01</small></button>
        <button className={view === "drill" ? styles.active : ""} onClick={() => setView("drill")}><span>ϟ</span> Fire drill <small>02</small></button>
        <button className={view === "evidence" ? styles.active : ""} onClick={() => setView("evidence")}><span>▥</span> Evidence lab <small>03</small></button>
      </nav>
      <div className={styles.sideLabel}>DEMO PATHS</div>
      <div className={styles.personas}>{personas.map((p) => {
        const choice = pickPersona(ds, p.key);
        return <button key={p.key} className={activePersona === p.key && choice?.id === selectedId ? styles.personaActive : ""} onClick={() => choice && selectStudent(choice.id)} disabled={!choice}><b>{p.glyph}</b><span><strong>{p.title}</strong><small>{p.detail}</small></span></button>;
      })}</div>
      <div className={styles.lookup}><label htmlFor="student-search">FIND A SYNTHETIC STUDENT</label><input id="student-search" placeholder="Search campus ID" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off"/>{searchResults.length > 0 && <div className={styles.results}>{searchResults.map((s) => <button key={s.id} onClick={() => selectStudent(s.id)}>{s.id}<span>{s.major}</span></button>)}</div>}</div>
      <div className={styles.sidebarFoot}><span>●</span> SYNTHETIC DATA LAB<p>Built for exploration, not student advice.</p></div>
    </aside>

    <div className={styles.content}>
      <header className={styles.topbar}><div>COOKED <span>/</span> {title}</div><div className={styles.topRight}><span>● SYNTHETIC DATA</span><b>C</b></div></header>
      <main className={styles.main}>
        {view === "overview" && <>
          <div className={styles.intro}><div><small>STUDENT SIGNAL / {student.id}</small><h1>Know sooner. Act earlier.</h1><p>A live look at this synthetic student’s path, grounded in matched alumni histories.</p></div><button className={styles.linkButton} onClick={() => setExplanation(!explanation)}>ⓘ &nbsp; How this works</button></div>
          <section className={styles.hero}><div className={styles.heroCopy}><span className={styles.signal}>● {refused ? "INSUFFICIENT EVIDENCE" : alarm.data.fires ? "TRAJECTORY ALERT" : "LOOKING STEADY"} &nbsp; / &nbsp; {student.pattern ? titleCase(student.pattern) : "Early stage"}</span><h2>{refused ? "We need more comparable histories." : alarm.data.fires ? "This path is showing a warning sign." : "This path has room to breathe."}</h2><p>{refused ? "We found " + twins.data.n + " comparable alumni. COOKED needs at least 30 before showing an outcome comparison." : "Among " + outcomes.n + " similar alumni at this stage, " + percent(outcomes.risk) + " finished beyond five years or had five or more withdrawals. This is an association, not a forecast."}</p><div className={styles.heroButtons}><button className={styles.primaryButton} onClick={startDrill}>Run the fire drill <span>↗</span></button><button className={styles.outlineButton} onClick={() => speak(script)}>{speaking ? "■ Stop narration" : "▷ Hear the alarm"}</button></div><small>Voice preview uses your browser. The full transcript is below.</small></div><div className={styles.heroRadar}><div><span>COOKED SIGNAL</span><strong>{refused ? "—" : percent(outcomes.risk)}</strong><small>matched cohort</small></div></div></section>
          {explanation && <div className={styles.explanation}><strong>How the signal works</strong><p>This demo matches entry type, reported work hours, and completed-term behavior to alumni in the synthetic dataset. The percentage is an observed group share, not a calibrated individual probability. Every result has a local tool ID.</p><button onClick={() => setExplanation(false)}>Close</button></div>}
          <div className={styles.sectionTitle}><div><small>01 / CURRENT STATE</small><h2>One student. A clearer signal.</h2></div><span>{student.major} · {student.cls} · {student.entry === "T" ? "Transfer" : "First-time"}</span></div>
          <div className={styles.statGrid}>
            <article><small>AVERAGE COURSE LOAD <b>↗</b></small><strong>{decimal(current.data.avgCredits)}<span>cr / term</span></strong><p>Across {current.data.termsDone} completed terms</p><button onClick={() => setExplanation(true)}>Source {current.id} ↗</button></article>
            <article><small>WORK COMMITMENT <b>◷</b></small><strong>{work}<span>h / week</span></strong><p>{work >= 20 ? "Balancing a heavy work schedule" : "Reported time working while enrolled"}</p><button onClick={() => setExplanation(true)}>Source {current.id} ↗</button></article>
            <article><small>WITHDRAWALS SO FAR <b>↘</b></small><strong>{current.data.wTotal}<span>courses</span></strong><p>From completed terms only</p><button onClick={() => setExplanation(true)}>Source {current.id} ↗</button></article>
            <article className={styles.statAccent}><small>MATCHED ALUMNI <b>◎</b></small><strong>{twins.data.n}<span>histories</span></strong><p>{refused ? "Below evidence threshold" : "Same stage, similar profile"}</p><button onClick={() => setExplanation(true)}>Source {twins.id} ↗</button></article>
          </div>
          <div className={styles.twoColumns}>
            <section className={styles.panel}><div className={styles.panelHead}><div><small>THE PATH SO FAR</small><h3>Term by term</h3></div><span>{student.credEarned} of {student.credReq} credits earned</span></div><div className={styles.timeline}>{student.terms.map((term, i) => <div className={styles.term} key={i}><b className={term[2] ? styles.termAlert : ""}>{String(i + 1).padStart(2, "0")}</b><div><strong>{labels[i]}</strong><span>{term[2] ? term[2] + " withdrawal" + (term[2] > 1 ? "s" : "") : "Completed"}</span></div><div className={styles.termTrack}><i style={{ width: Math.min(100, term[0] / 18 * 100) + "%" }}/></div><strong>{term[0]} cr</strong></div>)}</div><div className={styles.panelFoot}>● NOW <span>Next planned load: {planLoad} credits</span></div></section>
            <section className={styles.panel}><div className={styles.panelHead}><div><small>MATCHED OUTCOMES</small><h3>What happened to peers</h3></div><button onClick={() => setView("evidence")} aria-label="Open evidence lab">↗</button></div>{refused ? <p className={styles.empty}>Not enough close matches for outcome ranges. Adjust the scenario or choose another student.</p> : <div className={styles.outcomes}><div><span>Delay beyond four years</span><strong>{decimal(outcomes.delay[0])}–{decimal(outcomes.delay[2])} years</strong><small>Middle half of {outcomes.n} histories</small></div><div><span>Still seeking in first destination</span><strong>{percent(outcomes.seeking.rate)}</strong><small>Of {outcomes.seeking.n} matches with reported destinations</small></div><div><span>Degree burden</span><strong>{outcomes.burden ? Math.round(outcomes.burden[0] * 100) + "–" + Math.round(outcomes.burden[2] * 100) + "%" : "—"}</strong><small>Net cost as share of first-year pay · {outcomes.burdenN} records</small></div></div>}<div className={styles.panelFoot}>Observed associations · {twins.id}</div></section>
          </div>
          <section className={styles.scenario}><div><small>INTERACTIVE / PLAN LAB</small><h3>What if next term looked different?</h3><p>Move the controls. The projection updates immediately; plan-matched outcomes appear where the data supports them.</p></div><div className={styles.sliders}><label>Planned credits per term <strong>{planLoad} cr</strong><input type="range" min="6" max="18" value={planLoad} onChange={(e) => setPlanLoad(Number(e.target.value))}/><span>6 cr <i>18 cr</i></span></label><label>Work hours each week <strong>{work} h</strong><input type="range" min="0" max="40" value={work} onChange={(e) => setWork(Number(e.target.value))}/><span>0 h <i>40 h</i></span></label></div><div className={styles.scenarioResult}><small>AT THIS PACE</small><strong>{decimal(baseline.years)} years</strong><span>Simple credit arithmetic</span><p>{refused ? "Too few close alumni matches" : plan.data.pool === "twins (any load)" ? "No plan-specific comparison at this load" : percent(plan.data.outcomes.risk) + " of " + plan.data.outcomes.n + " plan-matched alumni met the label"}</p><button onClick={() => { setPlanLoad(null); setWork(null); }}>↺ Reset</button></div></section>
          <section className={styles.transcript}><b>◖))</b><div><small>THE ALARM / TRANSCRIPT</small><p>“{script}”</p><span>Figures come from {current.id} and {twins.id}. Browser voice preview; ElevenLabs can replace playback.</span></div></section>
          <div className={styles.feedback}>Was this signal useful? <button className={feedback === "yes" ? styles.feedbackActive : ""} onClick={() => setFeedback("yes")}>Yes</button><button className={feedback === "no" ? styles.feedbackActive : ""} onClick={() => setFeedback("no")}>Not really</button>{feedback && <small>Saved for this session</small>}</div>
        </>}

        {view === "drill" && <>
          <div className={styles.intro}><div><small>FIRE DRILL / {student.id}</small><h1>How much can this plan take?</h1><p>Operational shocks drawn from the synthetic cohort’s observed rates.</p></div><button className={styles.linkButton} onClick={() => setView("overview")}>← Back to overview</button></div>
          <section className={styles.drillHero}><div><small>PLAN UNDER PRESSURE</small><h2>{drill.data.alreadyCooked ? "The current pace already crosses the long-path threshold." : drill.data.shocksToCooked === null ? "This plan survives the tested shocks." : drill.data.shocksToCooked + " shock" + (drill.data.shocksToCooked === 1 ? "" : "s") + " to a long path."}</h2><p>The drill adds plausible term events, then recalculates a transparent credits-to-graduation projection. It is a scenario test, not a prediction.</p>{!started && <button className={styles.primaryButton} onClick={startDrill}>Start the sequence ↗</button>}</div><div><strong>{drill.data.alreadyCooked ? "0" : drill.data.shocksToCooked ?? "4+"}</strong><span>SHOCKS TO COOKED</span><small>{decimal(drill.data.baseline.years)} year baseline</small></div></section>
          {started && <div className={styles.drillGrid}><section className={styles.panel}><div className={styles.panelHead}><div><small>ADVERSARIAL SEQUENCE</small><h3>Where the plan bends</h3></div><span>{drill.data.path.length} tested events</span></div>{drill.data.alreadyCooked ? <p className={styles.empty}>At {planLoad} credits per term, simple arithmetic already projects {decimal(drill.data.baseline.years)} years. Raise the planned load in the overview and rerun the drill.</p> : <><div className={styles.shockList}>{drill.data.path.map((step, i) => <div key={i} className={i < revealed ? styles.shockRevealed : styles.shockHidden}><b>{String(i + 1).padStart(2, "0")}</b><div><small>{step.termLabel} · {percent(step.prob)} observed event rate</small><strong>{step.label}</strong><span>{step.detail}</span></div><strong>{decimal(step.yearsBefore)} → {decimal(step.yearsAfter)}<small> years</small></strong></div>)}</div><div className={styles.shockActions}>{revealed < drill.data.path.length ? <button className={styles.darkButton} onClick={() => setRevealed(revealed + 1)}>Reveal next shock ↗</button> : <span>✓ Sequence complete</span>}<button className={styles.linkButton} onClick={() => setRevealed(0)}>↺ Replay</button></div></>}<div className={styles.panelFoot}>Rates measured by work-hours band · {drill.id}</div></section><aside><section><small>SINGLE POINT OF FAILURE</small><h3>{drill.data.spof?.label ?? (drill.data.alreadyCooked ? "Current course load" : "No break found")}</h3><p>{drill.data.spof ? "This event had the largest early impact in the tested sequence." : "The tested sequence did not find a breaking shock."}</p></section><section><small>OTHER PRESSURES</small>{drill.data.outcomeShocks.map((shock) => <div key={shock.key}><strong>{shock.label}</strong><span>{percent(shock.prob)} observed rate</span></div>)}<p>Outcome events are shown separately from the degree-length drill.</p></section></aside></div>}
          <div className={styles.drillBottom}><section className={styles.panel}><div className={styles.panelHead}><div><small>MONTE CARLO / SIMULATION</small><h3>How simulated paths hold up</h3></div><span>500 runs · fixed seed</span></div><p className={styles.chartIntro}>Share still under the cooked threshold after each future term. Graduation is tracked separately.</p><SurvivalChart values={curve.data}/><div className={styles.panelFoot}>Illustrative simulation from empirical shock rates · {curve.id}</div></section><section className={styles.panel}><div className={styles.panelHead}><div><small>REPAIR / MATCHED ALUMNI</small><h3>One change to examine</h3></div><b>↗</b></div>{fix.data.primary ? <><div className={styles.repairTitle}>{fix.data.primary.title}</div><p className={styles.repairCopy}>Among {fix.data.primary.pool}, alumni who carried this load finished a median <strong>{decimal(Math.abs(fix.data.primary.diffYears))} years {fix.data.primary.diffYears >= 0 ? "sooner" : "later"}</strong> than those who carried less. This is an association.</p><div className={styles.repairStats}><div><strong>{fix.data.primary.n}</strong><span>comparison histories</span></div><div><strong>{decimal(fix.data.primary.ci[0])}–{decimal(fix.data.primary.ci[1])}</strong><span>bootstrap interval, years</span></div></div>{fix.data.feasibility && <div className={styles.feasibility}><strong>{fix.data.feasibility.data.feasible ? "✓ Catalog check passed" : "ⓘ Catalog check needs review"}</strong><p>{fix.data.feasibility.data.picks.slice(0, 3).map((course) => course.id).join(" · ") || "No course picks available"}</p><small>Offerings and prerequisites only. An advisor must verify degree applicability.</small></div>}</> : <p className={styles.empty}>{fix.data.refusal ?? "No supported change for this profile yet."}</p>}{fix.data.fallback && <div className={styles.fallback}>ALTERNATE TO EXPLORE <strong>{fix.data.fallback.title}</strong><small>{fix.data.fallback.n} comparable alumni at that work level</small></div>}<div className={styles.panelFoot}>Matched comparison · {fix.id}</div></section></div>
        </>}

        {view === "evidence" && <>
          <div className={styles.intro}><div><small>EVIDENCE LAB / SYNTHETIC COHORT</small><h1>See what the data actually says.</h1><p>Explore the mechanism behind the alarm. Figures come from the supplied CSVs.</p></div><span className={styles.countBadge}>{ds.meta.counts.alumni.toLocaleString()} alumni histories</span></div>
          <section className={styles.evidenceHero}><div><small>THE CORE PATTERN</small><h2>Course load changes the shape of the path.</h2><p>Choose a work-hours group to see the observed share of alumni who crossed the cooked label. Small groups deserve caution.</p></div><div className={styles.bandButtons} role="group" aria-label="Work hours group"><button className={band === "heavy" ? styles.selectedBand : ""} onClick={() => setBand("heavy")}>20+ hours</button><button className={band === "all" ? styles.selectedBand : ""} onClick={() => setBand("all")}>All students</button><button className={band === "light" ? styles.selectedBand : ""} onClick={() => setBand("light")}>Under 20 hours</button></div></section>
          <div className={styles.evidenceGrid}><section className={styles.panel}><div className={styles.panelHead}><div><small>OBSERVED SHARE BY CREDIT LOAD</small><h3>The load cliff</h3></div><span>{band === "heavy" ? "20+ work hours" : band === "light" ? "Under 20 work hours" : "All work hours"}</span></div><div className={styles.cliff}>{ds.meta.cliff[band].map((bin) => <div key={bin.label}><span>{bin.label}<small>cr / term</small></span><div><i style={{ width: Math.max(2, (bin.cooked ?? 0) * 100) + "%" }}/></div><strong>{bin.cooked === null ? "—" : percent(bin.cooked)}</strong><small>n={bin.n}</small></div>)}</div><div className={styles.panelFoot}>Cooked label: over five years or at least five withdrawals. Descriptive association.</div></section><section className={styles.panel}><div className={styles.panelHead}><div><small>OBSERVED TRAJECTORIES</small><h3>Five ways a path unfolded</h3></div></div><div className={styles.patterns}>{[...ds.meta.patterns].sort((a, b) => b.n - a.n).map((pattern) => <div key={pattern.name}><b>●</b><span><strong>{titleCase(pattern.name)}</strong><small>{decimal(pattern.avgCredits)} cr/term · {decimal(pattern.ttd)} years average</small></span><strong>{pattern.n}</strong></div>)}</div><div className={styles.panelFoot}>Exploratory clusters; stability validation is pending.</div></section></div>
          <section className={styles.provenance}><div><small>TRACE THE CURRENT STUDENT</small><h3>Every number has a source.</h3><p>Local deterministic tools run on the synthetic dataset. These IDs identify the computations behind this view.</p></div><div><article><span>STUDENT STATE</span><strong>{current.id}</strong><small>{current.tool}({current.args})</small></article><article><span>MATCHED HISTORIES</span><strong>{twins.id}</strong><small>{twins.tool}({twins.args})</small></article><article><span>FIRE DRILL</span><strong>{drill.id}</strong><small>{drill.tool}({drill.args})</small></article></div></section>
        </>}
        <footer className={styles.footer}><span>COOKED · A synthetic degree trajectory experiment</span><span>Observed patterns are not causal or individual advice.</span></footer>
      </main>
    </div>
  </div>;
}
