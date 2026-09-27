// The analysis the audit pipeline runs once an intake has an id. Every call is real and awaited;
// each step reports through `patch` so the processing theatre shows the backend actually working.
import { alarmCheck, findRepair, getMyths, getState, narrate, runDrill, type Myths } from "@/lib/agentApi";
import type { ServerNarration } from "@/lib/live";
import type { Step } from "../Pipeline";
import type { SponsorLive } from "../Sponsors";
import { loadOf, type DrillFull, type FullState, type RepairFull } from "./model";

export type Patch = (key: string, p: Partial<Step>) => void;

/** The seven agents of an audit, in the order they run, each tagged with the sponsor behind it. */
export const auditPipelineSteps = (live: SponsorLive): Step[] => [
  { key: "read", agent: "Reader", task: "reading your audit", sponsor: "gemini", live: live.gemini, status: "running" },
  { key: "match", agent: "Matcher", task: "finding alumni like you", sponsor: "tiger", live: live.tiger, status: "pending" },
  { key: "risk", agent: "Watchtower", task: "scoring your trajectory", sponsor: "model", live: live.model, status: "pending" },
  { key: "drill", agent: "Fire drill", task: "simulating what could go wrong", sponsor: "tiger", live: live.tiger, status: "pending" },
  { key: "fix", agent: "Repair", task: "finding the smallest fix", sponsor: "model", live: live.model, status: "pending" },
  { key: "voice", agent: "Narrator", task: "writing it up", sponsor: "gemini", live: live.gemini, status: "pending" },
  { key: "memory", agent: "Memory", task: "remembering this session", sponsor: "backboard", live: live.backboard, status: "pending" },
];

export interface Analysis {
  st: FullState;
  load: number;
  alarm: { id: number | null; fires: boolean } | null;
  drill: DrillFull;
  repair: RepairFull;
  myths: Myths | null;
  narration: ServerNarration;
}

export async function analyse(id: string, hours: number | undefined, patch: Patch, live: SponsorLive): Promise<Analysis> {
  patch("match", { status: "running" });
  const state = await getState(id, hours, undefined);
  const sd = state.data as FullState;
  const load = loadOf(sd);
  const withPlan = await getState(id, hours, load);
  const st = withPlan.data as FullState;
  patch("match", {
    status: sd.twins.refused ? "warn" : "done",
    result: sd.twins.refused ? `refused: ${sd.twins.reason} (COOKED doesn't guess below 30)` : `${sd.twins.n} balanced twins · SMD ${Object.values(sd.twins.smd).map((v) => v.toFixed(2)).join(" / ")}`,
    tr: sd.twins.tool_result_id,
    ms: state.ms,
  });

  patch("risk", { status: "running" });
  const alarm = await alarmCheck(id).catch(() => null);
  patch("risk", {
    status: "done",
    result: `model risk ${Math.round(sd.risk.value * 100)}% · ${sd.pattern ?? "no pattern yet"}${alarm?.data.fires ? ` · alarm #${alarm.data.id} open` : ""}`,
    tr: sd.risk.tool_result_id,
  });

  patch("drill", { status: "running" });
  const [dr, rp, my] = await Promise.all([runDrill(id, load, hours), findRepair(id, hours), getMyths().catch(() => null)]);
  const drill = dr.data as DrillFull;
  const repair = rp.data as RepairFull;
  patch("drill", {
    status: "done",
    result: `${drill.shocks_to_cooked === null ? `resilient to ${drill.path.length} shocks` : drill.shocks_to_cooked.value === 0 ? "past the line before any shock" : `${drill.shocks_to_cooked.value} ${drill.shocks_to_cooked.value === 1 ? "shock breaks" : "shocks break"} the plan`} · ${drill.rows_stored} trajectories stored`,
    tr: drill.tool_result_id,
    ms: dr.ms,
  });
  patch("fix", {
    status: repair.primary ? "done" : "warn",
    result: repair.primary ? `${repair.primary.title} · ${repair.primary.diff_years.toFixed(1)} yrs sooner · n=${repair.primary.support}` : (repair.refusal ?? "nothing to fix"),
    tr: repair.tool_result_id ?? undefined,
  });

  patch("voice", { status: "running" });
  const n = await narrate("alarm", id, hours, false);
  patch("voice", {
    status: "done",
    live: n.data.source !== "template" && live.gemini,
    result: `${n.data.source === "cache" ? "Gemini script (cached)" : n.data.source.startsWith("template (gemini") ? "template now · Gemini writing its version" : "template"} · ${n.data.provenance.tokens} numbers, every one traced`,
    ms: n.ms,
  });

  return { st, load, alarm: alarm ? { id: alarm.data.id, fires: alarm.data.fires } : null, drill, repair, myths: my?.data ?? null, narration: n.data };
}
