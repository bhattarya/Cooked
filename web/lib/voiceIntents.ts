// Offline intent parsing for the push-to-talk fallback (browser speech recognition + typed text).
//
// When the live ElevenLabs agent is unreachable, a spoken or typed line still has to DO something.
// This maps the fixed commands onto phrases; anything it does not recognise as a control phrase is
// routed as a free-form question (askStudent for "I / my", exploreCohort otherwise). It only ever
// picks a command and its arguments: every number the user hears still comes from the handler.
import { SCENARIO_FIELDS, SCENES, extractNumber, type CommandName, type SceneId } from "./commands";

export interface Intent { command: CommandName; args: Record<string, unknown> }
export interface IntentContext {
  scene: SceneId | null;
  hasStudent: boolean;
  available: readonly CommandName[];
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9%.]+/g, " ").replace(/\s+/g, " ").trim();
const has = (t: string, phrase: string) => new RegExp(`(^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(t);

function findScene(t: string): SceneId | null {
  let best: { id: SceneId; len: number } | null = null;
  for (const scene of SCENES) {
    for (const alias of [scene.label, ...scene.aliases]) {
      const a = squash(alias);
      if (has(t, a) && (!best || a.length > best.len)) best = { id: scene.id, len: a.length };
    }
  }
  return best?.id ?? null;
}

function findField(t: string): (typeof SCENARIO_FIELDS)[number] | null {
  let best: { spec: (typeof SCENARIO_FIELDS)[number]; len: number } | null = null;
  for (const spec of SCENARIO_FIELDS) {
    for (const alias of [spec.label, spec.name.replace(/_/g, " "), ...spec.aliases]) {
      const a = squash(alias);
      if (has(t, a) && (!best || a.length > best.len)) best = { spec, len: a.length };
    }
  }
  return best?.spec ?? null;
}

const SET_VERB = /\b(set|change|make|put|update|switch|adjust|bump|raise|lower|drop|reduce|increase)\b/;
// "three MORE credits" is a change to the plan, not the value 3: leave it to the plan-aware question path.
const DELTA = /\b(more|fewer|less|extra|additional|another)\b/;

export function parseIntent(text: string, ctx: IntentContext): Intent | null {
  const t = squash(text.replace(/-/g, " "));
  if (!t) return null;
  const can = (c: CommandName) => ctx.available.includes(c);

  if (/\b(load|use|start with|give me|pick|try)\b.*\b(sample|demo|example|test|fake|synthetic)\b/.test(t) || /^sample student$/.test(t)) {
    const which = /on track|full load/.test(t) ? "on_track" : /cooked|heavy job|light load/.test(t) ? "cooked" : /working|22/.test(t) ? "working" : undefined;
    return { command: "loadSampleStudent", args: which ? { which } : {} };
  }
  if (/^(what s on|what is on|what am i looking at|describe|read)\b.*\b(screen|this)\b|^what am i looking at$|^what s this$/.test(t)) return { command: "describeScreen", args: {} };

  if (/^(next|next one|next scene|next screen|next slide|continue|go on|keep going|carry on|what else|onward|onwards)$/.test(t)) return { command: "nextScene", args: {} };
  if (/^(back|go back|previous|previous one|previous scene|previous screen|last one|go to the previous)$/.test(t)) return { command: "previousScene", args: {} };

  const navVerb = /\b(show|open|go to|take me to|switch to|bring up|pull up|let me see|display|jump to|view|see)\b/.test(t);
  const scene = findScene(t);
  if (navVerb && scene) return { command: "showScene", args: { scene } };
  if (/\bcompare\b.*\bmodels?\b/.test(t)) return { command: "showScene", args: { scene: "models" } };

  if (/stress test|fire drill|run (a|the) drill|what could go wrong/.test(t)) return { command: "runStressTest", args: {} };
  if (/un ?cooked|uncooked|smallest fix|(fix|repair) (my|the) plan|what should i change|find (me )?a fix|find the fix/.test(t)) return { command: "findRepair", args: {} };

  // "set internships to three", "make work hours 30", "what if I work 30 hours"
  const to = /\b(?:to|at|equals?|=)\s+(.+)$/.exec(t);
  const field = findField(t);
  if (field && to && SET_VERB.test(t)) return { command: "setScenario", args: { field: field.name, value: to[1] } };
  if (field && field.kind !== "enum" && SET_VERB.test(t) && !DELTA.test(t)) {
    const n = extractNumber(t);
    if (n !== null) return { command: "setScenario", args: { field: field.name, value: n } };
  }
  if (field?.kind === "enum" && (SET_VERB.test(t) || /\bwhat if\b/.test(t))) {
    const asked = SCENARIO_FIELDS.find((f) => f.name === field.name)?.options?.find((o) => has(t, squash(o).replace("first time ", "")) || has(t, squash(o)));
    if (asked) return { command: "setScenario", args: { field: field.name, value: asked } };
  }
  const entry = /\b(transfer|freshman|first time)\b/.exec(t);
  if (entry && (SET_VERB.test(t) || /\bwhat if\b/.test(t))) return { command: "setScenario", args: { field: "entry_type", value: entry[1] === "transfer" ? "Transfer" : "First-Time Freshman" } };
  const state = /\b(out of state|in state)\b/.exec(t);
  if (state && (SET_VERB.test(t) || /\bwhat if\b/.test(t))) return { command: "setScenario", args: { field: "residency", value: state[1] === "in state" ? "In-State" : "Out-of-State" } };
  const major = /\b(information systems|computer science)\b/.exec(t);
  if (major && (SET_VERB.test(t) || /\bwhat if\b/.test(t))) return { command: "setScenario", args: { field: "major", value: major[1] === "information systems" ? "Information Systems" : "Computer Science" } };

  const whatIf = /\bwhat if (?:i|we)\b|\bsuppose (?:i|we)\b/.test(t);
  if (whatIf && field && field.kind !== "enum" && !DELTA.test(t)) {
    const n = extractNumber(t);
    // On the Model Lab (or with no plan loaded) a what-if moves a slider; with a plan it is a personal question.
    if (n !== null && can("setScenario") && (ctx.scene === "models" || !ctx.hasStudent)) return { command: "setScenario", args: { field: field.name, value: n } };
  }

  // A bare scene name ("twins", "the timeline") is a navigation request.
  if (scene && t.split(" ").length <= 3) return { command: "showScene", args: { scene } };

  // Free-form: personal ("am I cooked", "my plan") versus cohort ("how do internships relate to first jobs").
  const words = t.split(" ").length;
  if (words < 2 && !/cooked/.test(t)) return null;
  const auditQuestion = /audit|credits? (left|remaining|earned|required|completed)|how many credits|degree progress/.test(t);
  const personal = auditQuestion || /\b(am i|i m|i ve|i d|i ll|i|my|me|mine|myself)\b/.test(t) && !/\b(students?|people|graduates?|alumni|cohort)\b/.test(t);
  // A loaded student stays the answerer for any question asked while on their page: askStudent
  // already forwards cohort-shaped questions correctly (see api/agent.py's cohort_pattern tool),
  // whereas exploreCohort navigates to /app/explore and drops the loaded audit session.
  const order: CommandName[] = personal || ctx.hasStudent ? ["askStudent", "exploreCohort"] : ["exploreCohort", "askStudent"];
  const pick = order.find((c) => can(c));
  return pick ? { command: pick, args: { question: text.trim() } } : null;
}
