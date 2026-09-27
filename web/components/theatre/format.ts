import type { StepStatus } from "@/components/agent/Pipeline";

export const fmtMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`);

export const isFinished = (s: StepStatus) => s === "done" || s === "warn" || s === "error";

// status -> colour token. Gold is the brand, ember is a caution, red is reserved for failure.
export const STATUS_COLOR: Record<StepStatus, string> = {
  pending: "var(--line-2)",
  running: "var(--gold-hi)",
  done: "var(--gold)",
  warn: "var(--ember)",
  error: "var(--hot)",
};
