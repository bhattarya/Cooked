import type { OrbState } from "thinking-orbs";
import type { Step } from "@/components/agent/Pipeline";

// Which orb animation best says what a step is doing. Step keys are the ones the flows use
// (audit: read/match/risk/drill/fix/voice/memory; explore: route/query/chart); anything else
// falls back to its sponsor. Independent of status: a pending step still answers "what would it do".
export function orbStateFor(step: Pick<Step, "key" | "sponsor">): OrbState {
  const key = step.key.toLowerCase();
  switch (step.sponsor) {
    case "gemini":
      return key === "route" ? "connecting" : "searching"; // wiring a question to a tool vs scanning a document
    case "tiger":
      return key === "drill" ? "solving" : "searching"; // simulating vs looking up alumni / cohorts
    case "model":
      if (key === "chart") return "shaping";
      return /fix|repair|drill|tune|fit/.test(key) ? "solving" : "working";
    case "elevenlabs":
      return /listen|hear|mic/.test(key) ? "listening" : "composing";
    case "backboard":
      return "weaving";
    case "digitalocean":
      return "breathing";
  }
}
