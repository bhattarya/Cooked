"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Bars, ChartCard, ConfusionMatrix, Delta, Donut, Dumbbell, Flow, Heatmap, Legend, LineChart, Radar, RangeBar, Ridgeline, RiskRing, RocCurve, Scatter, Sparkline, Stat, Strip, Waterfall } from "../index";
import { money, pct, int } from "../format";
import { PATTERN_COLORS } from "../tokens";
import * as F from "./fake";
import s from "./gallery.module.css";

const FAKE = "FAKE sample data · dev gallery only";
const NAV = [
  ["verdict", "Verdict"],
  ["path", "Path"],
  ["map", "Map"],
  ["mix", "Mix"],
  ["repair", "Repair"],
  ["models", "Models"],
  ["spread", "Spread"],
  ["flow", "Flow"],
  ["parts", "Parts"],
  ["edge", "Edge"],
] as const;

function Section({ id, no, title, children }: { id: string; no: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className={s.section}>
      <div className={s.sectionHead}>
        <span className={s.sectionNo}>{no}</span>
        <h2 className={s.sectionTitle}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

const noSubscribe = () => () => {};
// True inside the 390px preview iframe, so the preview does not nest itself.
const useEmbedded = () => useSyncExternalStore(noSubscribe, () => window.self !== window.top, () => false);

// Shows what has keyboard focus, so the focus walkthrough is visible.
function FocusHud() {
  const [text, setText] = useState("");
  useEffect(() => {
    const on = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      const chart = el?.closest?.("[aria-roledescription='chart']");
      setText(chart ? `chart: ${chart.getAttribute("aria-label")?.slice(0, 90)}` : (el?.getAttribute?.("aria-label") ?? el?.textContent?.slice(0, 40) ?? ""));
    };
    document.addEventListener("focusin", on);
    return () => document.removeEventListener("focusin", on);
  }, []);
  return (
    <div className={s.hud} aria-hidden="true">
      <b>focus</b> {text || "press Tab"}
    </div>
  );
}

const constellation = F.fakeConstellation(3200);
const smallScatter = F.fakeSmallScatter();
const patternGroups = F.PATTERNS.map((k) => ({ key: k, label: k, color: PATTERN_COLORS[k] }));
const salary = F.fakeSalary();

export function Gallery() {
  const [run, setRun] = useState(0);
  const [sort, setSort] = useState<"none" | "desc">("none");
  const [refetch, setRefetch] = useState(false);
  const [repaired, setRepaired] = useState(true);
  const [risk, setRisk] = useState(0.62);
  const [phone, setPhone] = useState(false);
  const embedded = useEmbedded();

  const roc = useMemo(() => F.MODELS.map((m) => ({ key: m.key, label: m.label, auc: m.auc, n: m.n, points: F.fakeRoc(m.auc, m.auc > 0.9 ? 0.015 : 0.03) })), []);

  return (
    <div className={s.page}>
      <div className={s.top}>
        <span className={s.brand}>viz</span>
        <span className={s.fake}>fake data</span>
        <button type="button" className={s.chip} onClick={() => setRun((r) => r + 1)}>
          Replay animations
        </button>
        {!embedded && (
          <button type="button" className={s.chip} aria-pressed={phone} onClick={() => setPhone((v) => !v)}>
            390px preview
          </button>
        )}
        <nav className={s.nav} aria-label="Sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
      </div>

      <main key={run} className={s.main}>
        <div className={s.intro}>
          <h1>
            Chart <span className="text-gold-grad">library</span>
          </h1>
          <p>Every chart here reads plain props, animates in when it scrolls into view, shows exact values with n on hover and keyboard focus, keeps a hidden data table for assistive tech, and resizes with its container. All numbers on this page are invented for layout testing.</p>
        </div>

        <Section id="verdict" no="01" title="The verdict">
          <div className={s.grid}>
            <div className={s.c4}>
              <ChartCard title="Risk of getting cooked" eyebrow="Model 01" takeaway={<>At <strong>{pct(risk)}</strong>, this plan is past the 50% line. One lever is enough to pull it back.</>} howToRead="The ring fills to the model's risk score. Teal is below 20%, gold 20 to 50%, red above 50%. The pale arc shows the model's uncertainty range." n={1234} source={FAKE} disclaimer="Synthetic data. Associational, not a promise." actions={<button type="button" className={s.chip} onClick={() => setRisk((r) => (r > 0.5 ? 0.14 : r > 0.2 ? 0.62 : 0.34))}>Cycle value</button>}>
                <div className={s.center}>
                  <RiskRing value={risk} range={{ low: Math.max(0, risk - 0.11), high: Math.min(1, risk + 0.09) }} n={1234} size={280} />
                </div>
              </ChartCard>
            </div>
            <div className={s.c8}>
              <ChartCard title="Time to degree" eyebrow="Model 02" takeaway="Most likely 4.6 years, and plausibly past the 5-year line." howToRead="The bright bar is the likely range (p25 to p75). The pale notch is the median. The dashed red line is the five-year mark." n={2810} source={FAKE} disclaimer="Estimate from similar synthetic alumni, not a guarantee.">
                <RangeBar label="Median time to degree" value={4.6} low={4.1} high={5.4} min={3} max={8} format={(v) => v.toFixed(1)} unit="years" size="hero" n={2810} marks={[{ value: 5, label: "5-year line", tone: "risk" }]} ticks={[3, 4, 5, 6, 7, 8]} />
              </ChartCard>
            </div>
            <div className={s.c8}>
              <ChartCard title="First salary" eyebrow="Model 04" takeaway="A wide band: the range matters more than the middle." n={1490} source={FAKE} disclaimer="Nominal dollars. Exploratory, not causal.">
                <RangeBar label="Median first salary" value={74000} low={61000} high={89000} min={30000} max={150000} format={money} size="lg" tone="safe" n={1490} ticks={[30000, 60000, 90000, 120000, 150000]} />
              </ChartCard>
            </div>
            <div className={s.c4}>
              <div className={s.kpis} style={{ gridTemplateColumns: "1fr" }}>
                <div className={s.kpi}>
                  <Stat label="Cooked rate" value={31.4} format={(v) => `${v.toFixed(1)}%`} size="lg" delta={{ value: -2.4, unit: "pts", goodWhen: "down", label: "vs last term" }} spark={F.SPARK} sparkColor="var(--viz-1)" />
                </div>
                <div className={s.kpi}>
                  <Stat label="Alumni in cohort" value={3200} format={int} size="lg" caption="FAKE count" delta={{ value: 3.8, unit: "%", goodWhen: "neutral" }} />
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section id="path" no="02" title="The path">
          <div className={s.grid}>
            <div className={s.c8}>
              <ChartCard
                title="Risk as terms pass"
                takeaway="Risk crosses the cooked line in term 6 on the current plan; the repaired plan never gets there."
                howToRead="The line is the model's middle estimate; the soft ribbon is its low to high range. Hover to read every series at one term. Flags mark the shocks in this plan."
                n={1234}
                source={FAKE}
                disclaimer="Synthetic data."
                legend={<Legend items={[{ key: "cur", label: "Current plan (band = range)", color: "var(--viz-1)", swatch: "line" }, ...(repaired ? [{ key: "rep", label: "With repair", color: "var(--viz-2)", swatch: "dash" as const }] : [])]} />}
                actions={
                  <button type="button" className={s.chip} aria-pressed={repaired} onClick={() => setRepaired((r) => !r)}>
                    Show repair
                  </button>
                }
              >
                <LineChart
                  x={F.RISK_X}
                  xFormat={(v) => `T${v}`}
                  xLabel="term"
                  series={[
                    { key: "cur", label: "Current plan", color: "var(--viz-1)", y: F.RISK_MID, low: F.RISK_LOW, high: F.RISK_HIGH, area: true },
                    ...(repaired ? [{ key: "rep", label: "With repair", color: "var(--viz-2)", y: F.RISK_REPAIRED, dashed: true }] : []),
                  ]}
                  thresholds={[{ value: 0.5, label: "cooked line 50%" }]}
                  events={[{ x: 2, label: "Withdrew 2 courses", detail: "2 withdrawals in one term" }, { x: 4, label: "Internship ended", detail: "internship ended early" }]}
                  yFormat={(v) => pct(v)}
                  yDomain={[0, 0.8]}
                  legend={false}
                  endLabels
                  n={1234}
                  height={300}
                />
              </ChartCard>
            </div>
            <div className={s.c4}>
              <ChartCard title="What stacks up" takeaway="Working 30 hours and skipping a term do most of the damage." howToRead="Each floating bar adds (red) or removes (teal) risk. The last bar is where the plan lands versus the dashed cooked line." n={412} source={FAKE} disclaimer="Synthetic shock sizes.">
                <Waterfall start={{ label: "Baseline risk", value: 0.18 }} steps={F.SHOCK_STEPS} total={{ label: "Plan risk" }} threshold={{ value: 0.5, label: "cooked 50%" }} format={(v) => pct(v)} height={330} />
              </ChartCard>
            </div>
          </div>
        </Section>

        <Section id="map" no="03" title="The map">
          <ChartCard
            title="3,200 trajectories, one of them yours"
            eyebrow="Constellation"
            takeaway="Your scenario sits on the border between rough patch and withdrawal spiral."
            howToRead="Each dot is a synthetic alum, projected from load, withdrawals, repeats and gaps. Shaded outlines wrap each cluster's core. Drag to zoom into a region; double-click or press Escape to reset. Click a legend item to hide a group."
            n={3200}
            source={FAKE}
            disclaimer="Synthetic alumni. Axes are a projection, so their units carry no meaning."
          >
            <Scatter points={constellation} groups={patternGroups} you={{ x: 1.4, y: -0.8, label: "Your scenario" }} hulls density="all" zoom hideAxes xLabel="PC1" yLabel="PC2" height={480} />
          </ChartCard>
          <div className={s.grid} style={{ marginTop: 16 }}>
            <div className={s.c6}>
              <ChartCard title="Small scatter, SVG mode" takeaway="Under 600 points every dot is a real SVG element with a pop-in." n={320} source={FAKE}>
                <Scatter points={smallScatter} groups={patternGroups} xLabel="load" yLabel="risk" height={300} />
              </ChartCard>
            </div>
            <div className={s.c6}>
              <ChartCard title="Per-group density" takeaway="Contours per group show where each pattern is dense." n={3200} source={FAKE}>
                <Scatter points={constellation} groups={patternGroups} density="groups" hideAxes height={300} />
              </ChartCard>
            </div>
          </div>
        </Section>

        <Section id="mix" no="04" title="The mix">
          <div className={s.grid}>
            <div className={s.c5}>
              <ChartCard title="Where alumni land" takeaway="Software and data roles take over half of answered outcomes." howToRead="Slices are shares of the answered outcomes. Hover a slice to pull it out and read its count." n={100} source={FAKE} disclaimer="No Response is excluded, never an outcome.">
                <Donut data={F.CAREER} centerValue={100} centerLabel="FAKE outcomes" unit="alumni" height={300} highlight="Software engineering" />
              </ChartCard>
            </div>
            <div className={s.c7}>
              <ChartCard title="Cooked rate by major" takeaway="Information Systems runs well above the overall rate." howToRead="Bars start at zero. The whisker is the 95% range. The dashed line is the overall rate." n={4890} source={FAKE} disclaimer="Synthetic data." actions={<div className={s.toolbar}><button type="button" className={s.chip} aria-pressed={sort === "desc"} onClick={() => setSort(sort === "desc" ? "none" : "desc")}>Sort by value</button></div>}>
                <Bars data={F.MAJOR_RATES} sort={sort} highlight="Information Systems" baseline={{ value: 0.3, label: "overall 30%" }} format={(v) => pct(v)} unit="cooked rate" intervalLabel="95% range" />
              </ChartCard>
            </div>
            <div className={s.c6}>
              <ChartCard title="Outcome by credits per term" takeaway="Light loads are where students stall." howToRead="Each bar is 100% of that load band, split into outcomes." n={2900} source={FAKE}>
                <Bars groups={F.CREDIT_GROUPS} series={F.CREDIT_SERIES.map((sr, i) => ({ ...sr, color: ["var(--viz-2)", "var(--viz-1)", "var(--viz-3)"][i] }))} mode="stacked" normalize format={(v) => `${Math.round(v)}%`} height={250} />
              </ChartCard>
            </div>
            <div className={s.c6}>
              <ChartCard title="Grouped columns" takeaway="Transfer students trail on the heaviest loads." n={2900} source={FAKE}>
                <Bars
                  orientation="vertical"
                  groups={F.LOAD_BANDS.map((b, i) => ({ label: b, values: [[0.34, 0.29], [0.27, 0.31], [0.14, 0.22], [0.12, 0.2], [0.21, 0.33]][i], n: 300 + i * 90 }))}
                  series={[{ key: "ft", label: "First-time" }, { key: "tr", label: "Transfer" }]}
                  format={(v) => pct(v)}
                  height={260}
                />
              </ChartCard>
            </div>
          </div>
        </Section>

        <Section id="repair" no="05" title="The repair">
          <div className={s.grid}>
            <div className={s.c7}>
              <ChartCard title="Fix it before it is too late" takeaway="Cutting work hours moves risk the most; dropping to 9 credits backfires." howToRead="Hollow dot is the risk today, filled dot is the risk after the change. Teal means better, red means worse." n={388} source={FAKE} disclaimer="Associational, not causal: similar alumni who did this, not a guarantee for you.">
                <Dumbbell data={F.REPAIR} betterWhen="lower" beforeLabel="Now" afterLabel="After" format={(v) => pct(v)} sort="delta" formatDelta={(d) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.round(Math.abs(d) * 100)} pts`} />
              </ChartCard>
            </div>
            <div className={s.c5}>
              <ChartCard title="What drives the model" takeaway="Credit completion outweighs everything else." howToRead="Bars show each feature's share of the model's decisions (feature importance)." n={3200} source={FAKE} disclaimer="Importance is not causation.">
                <Bars data={F.FEATURES} sort="desc" format={(v) => pct(v)} unit="importance" highlight="Earned / attempted ratio" />
              </ChartCard>
            </div>
          </div>
        </Section>

        <Section id="models" no="06" title="The models">
          <div className={s.grid}>
            <div className={s.c5}>
              <ChartCard title="Model arena: ROC" takeaway="Gradient boosting separates cooked from fine best, at AUC .913." howToRead="Each curve trades false alarms (across) against catches (up). Higher and further left is better; the dashed diagonal is a coin flip." n={3200} source={FAKE}>
                <RocCurve series={roc} />
              </ChartCard>
            </div>
            <div className={s.c7}>
              <ChartCard title="Where the classifier confuses" takeaway="Spirals and stop-outs blur into each other more than anything else." howToRead="Each row is 100% of one true pattern. The gold-outlined diagonal is correct; off-diagonal is a mix-up. Hover a cell for counts." n={1160} source={FAKE}>
                <ConfusionMatrix labels={F.CONFUSION_LABELS} counts={F.CONFUSION_COUNTS} />
              </ChartCard>
            </div>
            <div className={s.c5}>
              <ChartCard title="Model profile" takeaway="Logistic regression is fastest and steadiest; boosting is most accurate." n={3200} source={FAKE}>
                <Radar axes={F.RADAR_AXES} series={F.RADAR_SERIES} height={340} />
              </ChartCard>
            </div>
            <div className={s.c7}>
              <ChartCard title="Cooked rate by load and term" takeaway="Light loads compound: by term 6 most part-timers are cooked." howToRead="Darker is lower, brighter gold is a higher cooked rate. Empty cells mean no students got that far." n={2900} source={FAKE}>
                <Heatmap rows={F.HEAT_ROWS} cols={F.HEAT_COLS} values={F.HEAT_VALUES} domain={[0, 0.8]} format={(v) => pct(v)} rowTitle="Credits per term" colTitle="Term" legendEnds={["0%", "80%"]} maxCell={64} />
              </ChartCard>
            </div>
          </div>
        </Section>

        <Section id="spread" no="07" title="The spread">
          <div className={s.grid}>
            <div className={s.c6}>
              <ChartCard title="Salary by pattern" eyebrow="Ridgeline" takeaway="Smooth paths earn more, but the ranges overlap heavily." howToRead="Each ridge is the smoothed distribution of first salaries. The bar on the baseline is the middle half (p25 to p75); the cream dot is the median." n={1010} source={FAKE} disclaimer="Nominal dollars. Exploratory.">
                <Ridgeline rows={salary} format={money} unit="salary" highlight="smooth" />
              </ChartCard>
            </div>
            <div className={s.c6}>
              <ChartCard title="Salary by pattern" eyebrow="Dot strip" takeaway="The same cases, one dot each." howToRead="Every dot is one alum. The shaded band is the middle half; the cream line is the median." n={1010} source={FAKE} disclaimer="Nominal dollars. Exploratory.">
                <Strip rows={salary} format={money} unit="salary" />
              </ChartCard>
            </div>
          </div>
        </Section>

        <Section id="flow" no="08" title="The flow">
          <ChartCard title="Major to pattern to outcome" takeaway="Most spiral trajectories end up still seeking, whichever major they start in." howToRead="Ribbon width is the number of alumni. Hover a ribbon or a node to light up its path." n={2500} source={FAKE} disclaimer="Synthetic data. Outcomes are the answered ones only.">
            <Flow nodes={F.FLOW_NODES} links={F.FLOW_LINKS} columns={["Major", "Pattern", "Outcome"]} unit="alumni" height={380} />
          </ChartCard>
        </Section>

        <Section id="parts" no="09" title="Small parts and states">
          <div className={s.grid}>
            <div className={s.c6}>
              <ChartCard title="Sparklines and deltas" takeaway="Word-sized trends with a signed change; direction is a glyph, a sign and a colour." n={10} source={FAKE}>
                <div className={s.row}>
                  <Sparkline data={F.SPARK} label="cooked rate per term" format={(v) => pct(v)} area />
                  <Sparkline data={F.SPARK} kind="bars" color="var(--viz-4)" label="cohort size" width={120} height={34} />
                  <Delta value={-2.4} unit="pts" goodWhen="down" label="vs last term" />
                  <Delta value={4.1} unit="pts" goodWhen="down" />
                  <Delta value={0} unit="pts" />
                  <Delta value={12} unit="%" goodWhen="neutral" size="lg" />
                </div>
              </ChartCard>
            </div>
            <div className={s.c6}>
              <ChartCard title="Refetching keeps the frame" refetching={refetch} takeaway="While data reloads the chart dims in place: no skeleton, no jump." n={1234} source={FAKE} actions={<button type="button" className={s.chip} aria-pressed={refetch} onClick={() => setRefetch((r) => !r)}>Refetching</button>}>
                <Bars data={F.CAREER.slice(0, 4)} format={(v) => `${v}`} height={170} />
              </ChartCard>
            </div>
            <div className={s.c6}>
              <ChartCard title="Donut variants" takeaway="A half-gauge for one share against the rest, and a fat pie for a quick composition." n={100} source={FAKE}>
                <div className={s.row} style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <Donut data={[{ label: "On time", value: 64, color: "var(--cool)" }, { label: "Late", value: 36, color: "var(--hot)" }]} half centerValue={64} centerFormat={(v) => `${Math.round(v)}%`} centerLabel="graduate on time" height={170} thickness={0.2} padAngle={1.2} />
                  </div>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <Donut data={F.CAREER.slice(0, 4)} thickness={0.62} startAngle={-30} labels="none" height={170} />
                  </div>
                </div>
              </ChartCard>
            </div>
            <div className={s.c6}>
              <ChartCard title="Step curve" takeaway="For values that hold between events (credits enrolled, aid balance), the line steps instead of sloping." n={40} source={FAKE}>
                <LineChart x={[0, 1, 2, 3, 4, 5, 6]} curve="step" series={[{ key: "credits", label: "Credits enrolled", y: [15, 15, 12, 12, 9, 9, 12], color: "var(--viz-4)" }]} xFormat={(v) => `T${v}`} yDomain={[0, 18]} height={170} />
              </ChartCard>
            </div>
            <div className={s.c4}>
              <ChartCard title="Loading" state="loading" source={FAKE}>
                <span />
              </ChartCard>
            </div>
            <div className={s.c4}>
              <ChartCard title="Empty" state="empty" stateMessage="Fewer than 30 similar twins, so COOKED will not guess." source={FAKE}>
                <span />
              </ChartCard>
            </div>
            <div className={s.c4}>
              <ChartCard title="Error" state="error" source={FAKE}>
                <span />
              </ChartCard>
            </div>
          </div>
          <div className={s.walk} style={{ marginTop: 24 }}>
            <strong style={{ color: "var(--text)" }}>Keyboard walkthrough.</strong> <kbd>Tab</kbd> lands on a chart (one stop per chart; legends and buttons are their own stops). <kbd>{"←"}</kbd> <kbd>{"→"}</kbd> <kbd>{"↑"}</kbd> <kbd>{"↓"}</kbd> step through its marks (bars, terms, cells, slices, groups) and the tooltip follows; the value is also announced. <kbd>Home</kbd>/<kbd>End</kbd> jump to the ends, <kbd>Esc</kbd> dismisses the tooltip (and resets zoom on the scatter). The panel in the corner shows what has focus.
          </div>
        </Section>

        <Section id="edge" no="10" title="Edge cases">
          <div className={s.grid}>
            <div className={s.c4}>
              <ChartCard title="Empty inputs" takeaway="Every chart survives no data without throwing." source={FAKE}>
                <Bars data={[]} height={80} />
                <LineChart x={[]} series={[]} height={90} />
                <Scatter points={[]} height={90} />
                <Donut data={[]} height={90} />
                <Heatmap rows={[]} cols={[]} values={[]} />
                <Waterfall steps={[]} total={false} height={80} />
                <Flow nodes={[]} links={[]} height={80} />
              </ChartCard>
            </div>
            <div className={s.c4}>
              <ChartCard title="One of everything" takeaway="A single bar, point, slice, step and row." source={FAKE}>
                <Bars data={[{ label: "Only", value: 12 }]} height={90} />
                <LineChart x={[1]} series={[{ key: "a", label: "A", y: [3] }]} height={120} />
                <Scatter points={[{ x: 1, y: 1 }]} you={{ x: 1, y: 1 }} height={120} />
                <Donut data={[{ label: "All", value: 5 }]} centerValue={5} height={140} />
                <Dumbbell data={[{ label: "One", before: 0.4, after: 0.4 }]} betterWhen="lower" format={(v) => pct(v)} />
                <Ridgeline rows={[{ label: "Flat", values: [5, 5, 5, 5] }]} height={90} />
              </ChartCard>
            </div>
            <div className={s.c4}>
              <ChartCard title="Gaps and extremes" takeaway="Nulls leave gaps; huge and tiny values stay legible." source={FAKE}>
                <LineChart x={[0, 1, 2, 3, 4]} series={[{ key: "g", label: "Gappy", y: [1, null, 3, 4, null], area: true }, { key: "h", label: "Huge", y: [1e6, 2e6, 1.5e6, 3e6, 2.5e6] }]} yFormat={(v) => `${(v / 1e6).toFixed(1)}M`} height={150} />
                <Radar axes={F.RADAR_AXES.slice(0, 3)} series={[{ key: "a", label: "Tri", values: [0.9, 0.2, 0.6] }]} height={200} />
                <RangeBar label="Narrow" value={5} low={4.9} high={5.1} min={0} max={10} size="md" />
              </ChartCard>
            </div>
          </div>
        </Section>
      </main>
      <FocusHud />
      {phone && !embedded && (
        <div className={s.phone}>
          <div className={s.phoneBar}>
            <span>390 x 780 viewport</span>
            <button type="button" className={s.chip} onClick={() => setPhone(false)}>
              Close
            </button>
          </div>
          <iframe title="Gallery at 390px wide" src="/dev/viz" width={390} height={780} className={s.phoneFrame} />
        </div>
      )}
    </div>
  );
}
