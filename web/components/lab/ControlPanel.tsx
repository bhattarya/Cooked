"use client";

import { fieldSpec, type ScenarioField } from "@/lib/commands";
import { fieldNote, isHistoryField, type NumericField } from "@/lib/labModel";
import { LabSlider } from "./LabSlider";
import { Segmented } from "./Segmented";
import type { LabSim } from "./useLabSim";

const UI: Record<NumericField, { label: string; hint: string; fmt?: (v: number) => string }> = {
  completed_terms: { label: "Terms done", hint: "Completed terms so far. Zero means no history yet." },
  credits_per_term: { label: "Credits / term", hint: "Credits attempted each term." },
  work_hours: { label: "Work hours", hint: "Weekly hours of paid work.", fmt: (v) => `${v}h` },
  earned_ratio: { label: "Credits earned", hint: "Share of attempted credits earned. A shortfall the withdrawals and failures do not explain counts as more withdrawals.", fmt: (v) => `${v}%` },
  withdrawals: { label: "Withdrawals", hint: "Courses withdrawn from across the completed terms." },
  failures: { label: "Failed", hint: "Failed courses across the completed terms." },
  enrollment_gaps: { label: "Gaps", hint: "Enrollment gaps (stop-outs). Only moves the trajectory pattern." },
  internship_count: { label: "Internships", hint: "Internships by graduation. Feeds the career and salary models only." },
  credential_count: { label: "Credentials", hint: "Credentials earned. Feeds the career and salary models only." },
  engagement_count: { label: "Engagement", hint: "Campus engagement activities. Feeds the career and salary models only." },
};

/** One slider bound to the shared scenario. `label` overrides the compact default. */
export function FieldSlider({ field, sim, label, className }: { field: NumericField; sim: LabSim; label?: string; className?: string }) {
  const spec = fieldSpec(field as ScenarioField);
  const ui = UI[field];
  const ratio = field === "earned_ratio";
  const raw = sim.scenario[field];
  const value = ratio ? Math.round(raw * 100) : raw;
  const edge = sim.edges[field];
  const noHistory = sim.scenario.completed_terms === 0 && isHistoryField(field);
  const held = edge !== undefined && value > edge;
  return (
    <LabSlider
      className={className}
      label={label ?? ui.label}
      value={value}
      min={ratio ? 50 : (spec?.min ?? 0)}
      max={ratio ? 100 : (spec?.max ?? 10)}
      format={ui.fmt}
      onChange={(v) => sim.set(field, ratio ? v / 100 : v)}
      edge={edge}
      dim={noHistory}
      note={noHistory ? "no effect at 0 terms" : held ? `models used ${edge}` : undefined}
      hint={`${spec?.label ?? field}. ${ui.hint}${fieldNote(field) && !ui.hint.includes("only") ? ` ${fieldNote(field)}` : ""}`}
    />
  );
}

/** The 13 inputs of the scenario: three toggles and ten dials, in the order a story is told. */
export function ControlPanel({ sim }: { sim: LabSim }) {
  const { scenario: s, set, result } = sim;
  const eff = result?.effective;
  return (
    <aside aria-label="Scenario controls" className="rounded-xl border border-line bg-panel flex min-h-0 flex-col gap-5 overflow-hidden p-4 lg:overflow-y-auto">
      <header>
        <div className="label !text-gold">Scenario</div>
        <h2 className="display mt-1.5 text-2xl font-bold">
          Shape a future
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">Adjust a scenario or tell the voice agent what to change. Each update scores all four trained tasks.</p>
      </header>

      <div className="grid gap-1.5">
        <Segmented
          label="Major"
          value={s.major}
          onChange={(v) => set("major", v)}
          options={[
            { value: "Computer Science", label: "Computer Science" },
            { value: "Information Systems", label: "Info Systems", title: "Information Systems" },
          ]}
        />
        <Segmented
          label="Entry type"
          value={s.entry_type}
          onChange={(v) => set("entry_type", v)}
          options={[
            { value: "First-Time Freshman", label: "First-time freshman", title: "First-Time Freshman" },
            { value: "Transfer", label: "Transfer" },
          ]}
        />
        <Segmented
          label="Residency"
          value={s.residency}
          onChange={(v) => set("residency", v)}
          options={[
            { value: "In-State", label: "In-state" },
            { value: "Out-of-State", label: "Out-of-state" },
          ]}
        />
      </div>

      <div className="grid grid-cols-6 gap-x-4 gap-y-5">
        <FieldSlider field="completed_terms" sim={sim} className="col-span-3" />
        <FieldSlider field="credits_per_term" sim={sim} className="col-span-3" />
        <FieldSlider field="work_hours" sim={sim} className="col-span-3" />
        <FieldSlider field="earned_ratio" sim={sim} className="col-span-3" />
        <FieldSlider field="withdrawals" sim={sim} className="col-span-2" />
        <FieldSlider field="failures" sim={sim} className="col-span-2" />
        <FieldSlider field="enrollment_gaps" sim={sim} className="col-span-2" />
        <FieldSlider field="internship_count" sim={sim} className="col-span-2" />
        <FieldSlider field="credential_count" sim={sim} className="col-span-2" />
        <FieldSlider field="engagement_count" sim={sim} className="col-span-2" />
      </div>

      <p className="mt-auto text-[10.5px] leading-snug text-dim" aria-live="polite">
        {eff ? (
          <>
            <span className="text-muted">The models saw</span>{" "}
            <span className="num text-cream">
              {eff.withdrawals} withdrawal{eff.withdrawals === 1 ? "" : "s"} · {eff.failures} failed · {Math.round(eff.earned_ratio * 100)}% earned
            </span>
            . A completion shortfall that withdrawals and failures do not explain counts as more withdrawals.
          </>
        ) : (
          "Waiting for the first answer from the models."
        )}
      </p>
    </aside>
  );
}
