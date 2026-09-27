// The command bus: how a voice (or a typed line, or a dev button) drives the app.
//
// Scenes REGISTER handlers for the commands they can perform; the voice agent's client tools
// (and the offline push-to-talk router) INVOKE them through `runCommand`. The bus is
// framework-agnostic on purpose: no React, no ElevenLabs, no DOM. The catalogue in
// voice-commands.json is the single source of truth for command names, argument schemas and the
// agent-facing descriptions; scripts/provision_elevenlabs_agent.py builds the ElevenLabs tools
// from the same file, so the agent can never call something the app does not define.
//
// Design rules that matter for the "never invent numbers" non-negotiable:
//  - handlers return text/data that the APP computed; the bus never fabricates a result;
//  - a command nobody handles fails honestly ("not available on this screen") instead of pretending;
//  - the latest ScreenContext (published by scenes) is what `describeScreen` reads back.
import catalogue from "./voice-commands.json";

export type SceneId =
  | "home" | "risk" | "timeline" | "twins" | "drill" | "repair" | "careers" | "receipt"
  | "models" | "constellation" | "arena" | "cards" | "explore" | "advisor";
export type SampleKey = "working" | "cooked" | "on_track";
export type ScenarioField =
  | "major" | "entry_type" | "residency" | "work_hours" | "completed_terms" | "credits_per_term"
  | "earned_ratio" | "withdrawals" | "failures" | "enrollment_gaps" | "internship_count"
  | "credential_count" | "engagement_count";

export interface CommandArgs {
  describeScreen: Record<string, never>;
  askAnything: { question: string };
  askStudent: { question: string };
  exploreCohort: { question: string };
  showScene: { scene: SceneId };
  nextScene: Record<string, never>;
  previousScene: Record<string, never>;
  /** `value` is already validated and clamped by the bus: a number for numeric fields, the exact option text for enum fields. */
  setScenario: { field: ScenarioField; value: number | string };
  runStressTest: Record<string, never>;
  findRepair: Record<string, never>;
  loadSampleStudent: { which?: SampleKey };
}
export type CommandName = keyof CommandArgs;

/** What a handler may return. A bare string is the sentence the agent speaks. */
export type CommandOutcome =
  | string
  | {
      /** One or two short sentences built from real app numbers. The agent reads this. */
      message: string;
      /** Structured facts (labels, values, sample sizes) the agent may quote. */
      data?: unknown;
      /** Set false to report a refusal or failure (e.g. "no student loaded"). Default true. */
      ok?: boolean;
    };
export type CommandHandler<K extends CommandName> = (args: CommandArgs[K]) => CommandOutcome | Promise<CommandOutcome>;
export type CommandHandlers = { [K in CommandName]: CommandHandler<K> };

export type CommandSource = "voice" | "typed" | "ui" | "dev";
export interface CommandResult {
  ok: boolean;
  command: string;
  message: string;
  data?: unknown;
  /** For setScenario: what was really applied, and whether the request had to be clamped. */
  applied?: { field: ScenarioField; value: number | string; requested?: string | number; clamped?: boolean };
  unavailable?: boolean;
  ms: number;
}
export interface CommandEvent {
  id: number;
  command: string;
  args: unknown;
  source: CommandSource;
  status: "running" | "ok" | "error" | "unavailable";
  /** Short human wording for the on-screen toast, e.g. "Set work hours per week = 30". */
  label: string;
  startedAt: number;
  result?: CommandResult;
}

/** What is on screen, published by the scene host. `summary` and `facts` must hold real app numbers only. */
export interface ScreenContext {
  scene: SceneId | null;
  title?: string;
  summary: string;
  facts?: Record<string, string | number | boolean | null>;
  /** True when a student's plan is loaded (askStudent, findRepair, runStressTest need one). */
  student?: boolean;
  /** Scenes reachable right now, in navigation order. */
  scenes?: SceneId[];
}

// ---------------------------------------------------------------- catalogue

export interface SceneInfo { id: SceneId; label: string; blurb: string; aliases: string[] }
export interface ScenarioFieldSpec {
  name: ScenarioField;
  label: string;
  kind: "enum" | "int" | "float";
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
  aliases: string[];
}
export interface ParamSpec { type: "string" | "number" | "integer" | "boolean"; description: string; enum?: string[] }
export interface CommandSpec {
  name: CommandName;
  toast: string;
  slow: boolean;
  description: string;
  parameters: { type: "object"; required: string[]; properties: Record<string, ParamSpec> };
}

export const SCENES = catalogue.scenes as SceneInfo[];
export const SCENARIO_FIELDS = catalogue.scenario_fields as ScenarioFieldSpec[];
export const SAMPLES = catalogue.samples as { key: SampleKey; label: string; blurb: string }[];
export const COMMANDS = catalogue.commands as unknown as CommandSpec[];
export const COMMAND_NAMES = COMMANDS.map((c) => c.name);

const specOf = (name: string) => COMMANDS.find((c) => c.name === name);
export const sceneInfo = (id: SceneId) => SCENES.find((s) => s.id === id);
export const fieldSpec = (name: ScenarioField) => SCENARIO_FIELDS.find((f) => f.name === name);

// Catch catalogue/type drift while developing; production trusts the JSON.
if (process.env.NODE_ENV !== "production") {
  const expected: CommandName[] = ["describeScreen", "askAnything", "askStudent", "exploreCohort", "showScene", "nextScene", "previousScene", "setScenario", "runStressTest", "findRepair", "loadSampleStudent"];
  const drift = [...expected.filter((n) => !COMMAND_NAMES.includes(n)), ...COMMAND_NAMES.filter((n) => !expected.includes(n))];
  if (drift.length) console.error(`voice-commands.json and commands.ts disagree on: ${drift.join(", ")}`);
}

// ---------------------------------------------------------------- parsing helpers

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const ONES: Record<string, number> = {
  zero: 0, none: 0, no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
const TENS: Record<string, number> = { thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** First number in free text: "30", "0.9", "90%", "three", "twenty five". Null when there is none. */
export function extractNumber(text: string): number | null {
  const digits = /-?\d+(?:\.\d+)?/.exec(text);
  if (digits) return Number(digits[0]);
  const words = squash(text).split(" ");
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w in TENS) {
      const next = words[i + 1];
      return TENS[w] + (next && next in ONES && ONES[next] > 0 && ONES[next] < 10 ? ONES[next] : 0);
    }
    if (w in ONES) return ONES[w];
    if (w === "a" && words[i + 1] === "couple") return 2;
  }
  return null;
}

function resolveScene(raw: unknown): SceneId | null {
  const s = squash(String(raw ?? "")).replace(/^(the|a) /, "");
  if (!s) return null;
  const hit =
    SCENES.find((x) => x.id === s || squash(x.label) === s) ??
    SCENES.find((x) => x.aliases.some((a) => squash(a) === s)) ??
    SCENES.find((x) => x.aliases.some((a) => s.includes(squash(a)) && squash(a).length > 3));
  return hit?.id ?? null;
}

function resolveField(raw: unknown): ScenarioFieldSpec | null {
  const s = squash(String(raw ?? "")).replace(/^(the|my) /, "");
  if (!s) return null;
  return (
    SCENARIO_FIELDS.find((f) => squash(f.name) === s || squash(f.label) === s) ??
    SCENARIO_FIELDS.find((f) => f.aliases.some((a) => squash(a) === s)) ??
    null
  );
}

function resolveOption(field: ScenarioField, raw: string): string | null {
  const s = squash(raw);
  const spec = fieldSpec(field);
  const exact = spec?.options?.find((o) => squash(o) === s);
  if (exact) return exact;
  if (field === "major") {
    if (/information|info|\bis\b|infosys/.test(s)) return "Information Systems";
    if (/computer|comp sci|\bcs\b|cmsc/.test(s)) return "Computer Science";
  }
  if (field === "entry_type") {
    if (/transfer/.test(s)) return "Transfer";
    if (/fresh|first|native|from scratch/.test(s)) return "First-Time Freshman";
  }
  if (field === "residency") {
    if (/out/.test(s)) return "Out-of-State";
    if (/\bin\b|instate/.test(s)) return "In-State";
  }
  return null;
}

function resolveSample(raw: unknown): SampleKey | null {
  const s = squash(String(raw ?? ""));
  if (!s) return null;
  if (/track|full|healthy|fine|safe/.test(s)) return "on_track";
  if (/cook|heavy|light|doom/.test(s)) return "cooked";
  if (/work|22|job|early/.test(s)) return "working";
  return null;
}

type Normalized<K extends CommandName> =
  | { ok: true; args: CommandArgs[K]; applied?: CommandResult["applied"]; clampNote?: string }
  | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

function readString(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  // An LLM occasionally sends the argument under a synonym; accept a lone string value.
  const strings = Object.values(raw).filter((x): x is string => typeof x === "string");
  return strings.length === 1 ? strings[0].trim() : "";
}

/** Validate and normalise raw tool arguments against the catalogue. Never throws. */
export function normalizeArgs(name: CommandName, input: unknown): Normalized<CommandName> {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  switch (name) {
    case "askAnything":
    case "askStudent":
    case "exploreCohort": {
      const question = readString(raw, "question").slice(0, 600);
      return question ? { ok: true, args: { question } } : fail("I need the question to look that up.");
    }
    case "showScene": {
      const scene = resolveScene(raw.scene);
      return scene ? { ok: true, args: { scene } } : fail(`I don't have a scene called "${String(raw.scene ?? "")}". The scenes are ${SCENES.map((s) => s.label).join(", ")}.`);
    }
    case "setScenario": {
      const spec = resolveField(raw.field);
      if (!spec) return fail(`I can't change "${String(raw.field ?? "")}". I can set ${SCENARIO_FIELDS.map((f) => f.label).join(", ")}.`);
      const requested = raw.value;
      if (spec.kind === "enum") {
        const option = resolveOption(spec.name, String(requested ?? ""));
        return option
          ? { ok: true, args: { field: spec.name, value: option }, applied: { field: spec.name, value: option } }
          : fail(`${spec.label} can be ${spec.options?.join(" or ")}.`);
      }
      let n = typeof requested === "number" ? requested : extractNumber(String(requested ?? ""));
      if (n === null || !Number.isFinite(n)) return fail(`I didn't catch a number for ${spec.label}.`);
      const asked = n;
      if (spec.name === "earned_ratio" && n > 1 && n <= 100) n = n / 100; // "ninety percent"
      const min = spec.min ?? 0;
      const max = spec.max ?? 0;
      let value = Math.min(max, Math.max(min, n));
      value = spec.kind === "int" ? Math.round(value) : Math.round(value * 100) / 100;
      const clamped = n < min || n > max;
      const note = clamped ? `${spec.label} can only go from ${min} to ${max}, so I used ${value}.` : undefined;
      return { ok: true, args: { field: spec.name, value }, applied: { field: spec.name, value, ...(clamped ? { requested: asked, clamped: true } : {}) }, clampNote: note };
    }
    case "loadSampleStudent": {
      const which = raw.which === undefined || raw.which === "" ? undefined : resolveSample(raw.which);
      return which === null ? fail("The samples are working, cooked and on_track.") : { ok: true, args: which ? { which } : {} };
    }
    default:
      return { ok: true, args: {} as never };
  }
}

/** Short wording for the "what the voice just did" toast. */
export function describeCommand(name: string, args: unknown): string {
  const spec = specOf(name);
  if (!spec) return name;
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const scene = typeof a.scene === "string" ? sceneInfo(a.scene as SceneId)?.label : undefined;
  const field = typeof a.field === "string" ? fieldSpec(a.field as ScenarioField)?.label : undefined;
  const filled = spec.toast
    .replace("{scene}", scene ?? String(a.scene ?? ""))
    .replace("{field}", field ?? String(a.field ?? ""))
    .replace("{value}", String(a.value ?? ""));
  if ((name === "askStudent" || name === "exploreCohort") && typeof a.question === "string") return `${filled}: “${a.question.length > 60 ? `${a.question.slice(0, 57)}…` : a.question}”`;
  if (name === "loadSampleStudent" && typeof a.which === "string") return `${filled} (${a.which.replace("_", " ")})`;
  return filled;
}

// ---------------------------------------------------------------- the bus

interface Slot { id: number; handlers: Partial<CommandHandlers> }
interface Bus {
  slots: Slot[];
  slotId: number;
  eventId: number;
  events: CommandEvent[];
  eventListeners: Set<(e: CommandEvent) => void>;
  registryListeners: Set<() => void>;
  screen: ScreenContext | null;
  screenListeners: Set<(s: ScreenContext | null) => void>;
  chain: Promise<unknown>;
}
declare global {
  var __cookedCommandBus: Bus | undefined;
}
// On globalThis so hot reloads in development do not orphan registered scenes.
const bus: Bus = (globalThis.__cookedCommandBus ??= {
  slots: [], slotId: 0, eventId: 0, events: [], eventListeners: new Set(), registryListeners: new Set(),
  screen: null, screenListeners: new Set(), chain: Promise.resolve(),
});

const emitRegistry = () => bus.registryListeners.forEach((fn) => fn());

/**
 * Register the commands a scene can perform. Later registrations win per command, and
 * unregistering restores the previous handler, so a new scene can mount before the old one leaves.
 */
export function registerCommands(handlers: Partial<CommandHandlers>): () => void {
  const slot: Slot = { id: ++bus.slotId, handlers };
  bus.slots.push(slot);
  emitRegistry();
  return () => {
    bus.slots = bus.slots.filter((s) => s.id !== slot.id);
    emitRegistry();
  };
}

function handlerFor<K extends CommandName>(name: K): CommandHandler<K> | undefined {
  for (let i = bus.slots.length - 1; i >= 0; i--) {
    const h = bus.slots[i].handlers[name];
    if (h) return h as CommandHandler<K>;
  }
  return undefined;
}

/** Commands that can run right now (registered by a scene, plus the built-in describeScreen). */
export function availableCommands(): CommandName[] {
  return COMMAND_NAMES.filter((n) => n === "describeScreen" || handlerFor(n));
}
export const subscribeRegistry = (fn: () => void): (() => void) => {
  bus.registryListeners.add(fn);
  return () => void bus.registryListeners.delete(fn);
};

// ---- screen context

export function setScreenContext(ctx: ScreenContext | null): () => void {
  if (JSON.stringify(ctx) === JSON.stringify(bus.screen)) return () => {};
  bus.screen = ctx;
  bus.screenListeners.forEach((fn) => fn(ctx));
  // Clearing only if still current keeps a stale unmount from wiping a newer scene's context.
  return () => {
    if (bus.screen === ctx) setScreenContext(null);
  };
}
export const getScreenContext = () => bus.screen;
export const subscribeScreenContext = (fn: (s: ScreenContext | null) => void): (() => void) => {
  bus.screenListeners.add(fn);
  return () => void bus.screenListeners.delete(fn);
};

/** Plain text for the agent (contextual update). Only what the app published; nothing computed here. */
export function screenToText(ctx: ScreenContext | null): string {
  if (!ctx) return "SCREEN: nothing is showing yet. No student is loaded. Do not quote any numbers until a tool returns them.";
  const scene = ctx.scene ? `${sceneInfo(ctx.scene)?.label ?? ctx.scene} (${ctx.scene})` : "none";
  const facts = ctx.facts ? Object.entries(ctx.facts).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join("; ") : "";
  return [
    `SCREEN: scene ${scene}${ctx.title ? `, titled "${ctx.title}"` : ""}. Student loaded: ${ctx.student ? "yes" : "no"}.`,
    ctx.summary,
    facts && `Visible values: ${facts}.`,
    ctx.scenes?.length && `Reachable scenes: ${ctx.scenes.join(", ")}.`,
    "Quote numbers only from this screen text or from a tool result.",
  ].filter(Boolean).join(" ");
}

// ---- running commands

const TIMEOUT_MS: Record<"fast" | "slow", number> = { fast: 12_000, slow: 28_000 };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("That took too long.")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

function builtinDescribe(): CommandOutcome {
  const ctx = bus.screen;
  if (!ctx) return { ok: false, message: "Nothing is showing yet. Load a sample student or open a scene first." };
  return {
    message: ctx.summary,
    data: { scene: ctx.scene, title: ctx.title, student_loaded: Boolean(ctx.student), values: ctx.facts ?? {}, reachable_scenes: ctx.scenes ?? [], available_commands: availableCommands() },
  };
}

function emit(event: CommandEvent) {
  const at = bus.events.findIndex((e) => e.id === event.id);
  if (at >= 0) bus.events[at] = event;
  else bus.events = [...bus.events, event].slice(-40);
  bus.eventListeners.forEach((fn) => fn(event));
}
export const getCommandEvents = () => bus.events;
export const subscribeCommandEvents = (fn: (e: CommandEvent) => void): (() => void) => {
  bus.eventListeners.add(fn);
  return () => void bus.eventListeners.delete(fn);
};

async function execute(name: string, input: unknown, first: CommandEvent): Promise<CommandResult> {
  let event = first;
  const t0 = performance.now();
  const done = (r: Omit<CommandResult, "command" | "ms">, status: CommandEvent["status"]): CommandResult => {
    const result: CommandResult = { command: name, ms: Math.round(performance.now() - t0), ...r };
    emit({ ...event, status, result });
    return result;
  };
  const spec = specOf(name);
  if (!spec) return done({ ok: false, message: `There is no command called ${name}.` }, "error");
  const norm = normalizeArgs(spec.name, input);
  if (!norm.ok) return done({ ok: false, message: norm.message }, "error");
  event = { ...event, args: norm.args, label: describeCommand(name, norm.args) };
  emit(event);

  const handler = spec.name === "describeScreen" ? (handlerFor("describeScreen") ?? builtinDescribe) : handlerFor(spec.name);
  if (!handler) {
    const here = availableCommands().filter((n) => n !== "describeScreen");
    return done({ ok: false, unavailable: true, message: `That isn't available on this screen.${here.length ? ` Right now I can ${here.join(", ")}.` : " Open a scene first."}` }, "unavailable");
  }
  try {
    const outcome = await withTimeout(Promise.resolve((handler as (a: unknown) => CommandOutcome | Promise<CommandOutcome>)(norm.args)), spec.slow ? TIMEOUT_MS.slow : TIMEOUT_MS.fast);
    const o = typeof outcome === "string" ? { message: outcome } : outcome;
    const ok = o.ok !== false;
    return done(
      {
        ok,
        message: ok && norm.clampNote ? `${o.message} ${norm.clampNote}` : o.message,
        ...(o.data !== undefined ? { data: o.data } : {}),
        ...(norm.applied ? { applied: norm.applied } : {}),
      },
      ok ? "ok" : "error",
    );
  } catch (e) {
    return done({ ok: false, message: e instanceof Error && e.message ? e.message : "That didn't work." }, "error");
  }
}

/**
 * Run one command through the registered scene handlers. Voice and typed calls are serialised in
 * arrival order so an agent that fires two tools back to back sees each scene change before the
 * next command reads the screen; ui/dev calls run immediately, so a handler may safely call
 * `runCommand(..., { source: "ui" })` without deadlocking the queue. Resolves (never rejects)
 * with a result the agent can speak.
 */
export function runCommand(name: string, args?: unknown, opts: { source?: CommandSource } = {}): Promise<CommandResult> {
  const source = opts.source ?? "ui";
  const event: CommandEvent = { id: ++bus.eventId, command: name, args: args ?? {}, source, status: "running", label: describeCommand(name, args), startedAt: Date.now() };
  emit(event);
  if (source === "ui" || source === "dev") return execute(name, args, event);
  const run = bus.chain.then(() => execute(name, args, event));
  bus.chain = run.catch(() => undefined);
  return run;
}

/** The string returned to the ElevenLabs agent as the client-tool result. */
export function agentPayload(result: CommandResult): string {
  const body: Record<string, unknown> = { ok: result.ok, say: result.message };
  if (result.applied) body.applied = result.applied;
  if (result.data !== undefined) body.data = result.data;
  const text = JSON.stringify(body);
  // Keep tool results small: the agent must speak them, not skim a dump.
  return text.length > 6000 ? JSON.stringify({ ok: result.ok, say: result.message }) : text;
}
