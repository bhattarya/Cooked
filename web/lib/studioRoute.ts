// Deterministic router for the Studio's global Ask: one utterance -> which chapter answers and how.
// Pure functions, no imports: it runs in the browser, in the voice path and in a plain node test script.
// The router only DECIDES; every number in an answer still comes from the chapter's own engine.

export type RouteChapter = "audit" | "cohort" | "models" | "advisor";
export type RouteIntent = "ask" | "scenario" | "stress-test" | "repair" | "load-sample" | "describe" | "open";

export interface RouteContext {
  /** A student's degree audit is loaded. */
  student: boolean;
  /** The chapter on screen right now (used to break ties). */
  chapter: RouteChapter;
}
export interface Route {
  chapter: RouteChapter;
  intent: RouteIntent;
  /** For ask/scenario: the text handed to the chapter. */
  question: string;
  /** scenario: one of the ModelLabRequest fields plus its value (already clamped to the training range). */
  field?: string;
  value?: number | string;
  /** Spoken when the router itself must explain something (e.g. no audit loaded yet). */
  note?: string;
  /** Why this chapter won: shown in dev tooling and tests. */
  reason: string;
}

interface NumField { name: string; min: number; max: number; int: boolean; re: RegExp }
// Names, ranges and defaults mirror api/schemas.py ModelLabRequest.
const NUM_FIELDS: NumField[] = [
  { name: "work_hours", min: 0, max: 50, int: true, re: /work(?:ing)?(?: hours)?|hours? (?:a|per) week|job hours|hours worked/ },
  { name: "completed_terms", min: 0, max: 6, int: true, re: /completed terms?|terms? completed|semesters? (?:done|completed)|terms? done/ },
  { name: "credits_per_term", min: 3, max: 18, int: true, re: /credits? (?:per|a|each) (?:term|semester)|credit load|course load/ },
  { name: "earned_ratio", min: 0.5, max: 1, int: false, re: /earned ratio|credits? earned|pass(?:ing)? rate|earn(?:ed)? rate/ },
  { name: "withdrawals", min: 0, max: 10, int: true, re: /withdrawals?|withdraws?|drops?/ },
  { name: "failures", min: 0, max: 10, int: true, re: /failures?|failed courses?|fails?/ },
  { name: "enrollment_gaps", min: 0, max: 4, int: true, re: /enrol?lment gaps?|gaps?|stop ?outs?/ },
  { name: "internship_count", min: 0, max: 4, int: true, re: /internships?/ },
  { name: "credential_count", min: 0, max: 8, int: true, re: /credentials?|certificat(?:e|ions?)|certs?/ },
  { name: "engagement_count", min: 0, max: 20, int: true, re: /engagements?|clubs?|activities|involvement/ },
];

const WORDS: Record<string, number> = {
  zero: 0, no: 0, none: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
};
const NUM_TOKEN = String.raw`(\d+(?:\.\d+)?%?|twenty[- ]?(?:one|two|three|four|five|six|seven|eight|nine)|thirty[- ]?(?:one|two|three|four|five|six|seven|eight|nine)|forty[- ]?(?:one|two|three|four|five|six|seven|eight|nine)|zero|none|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)`;

const norm = (s: string) =>
  s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9%.'\- ]+/g, " ").replace(/\s+/g, " ").trim();

function toNumber(tok: string): number | null {
  if (/^\d/.test(tok)) {
    const pct = tok.endsWith("%");
    const n = Number(tok.replace("%", ""));
    return Number.isFinite(n) ? (pct ? n / 100 : n) : null;
  }
  const [a, b] = tok.split(/[- ]/);
  if (!(a in WORDS)) return null;
  return WORDS[a] + (b && b in WORDS ? WORDS[b] : 0);
}

/** "set internships to three", "put work hours at 30", "what if I work 30 hours". Null when it is not a scenario edit. */
export function parseScenario(text: string): { field: string; value: number } | null {
  const t = norm(text);
  // Order matters: more specific phrasings first ("credits earned" before "work").
  for (const f of NUM_FIELDS) {
    const src = f.re.source;
    const patterns = [
      new RegExp(`\\b(?:set|make|change|put|bump|raise|lower|move|drag|slide|adjust)\\b.*?(?:${src}).*?\\b(?:to|at|=)\\s*${NUM_TOKEN}\\b`),
      new RegExp(`\\b(?:${src})\\s*(?:to|at|=|of)\\s*${NUM_TOKEN}\\b`),
      new RegExp(`\\b(?:set|make|change|put)\\b.*?(?:${src})\\s+${NUM_TOKEN}\\b`),
    ];
    for (const p of patterns) {
      const m = p.exec(t);
      if (m) {
        const n = toNumber(m[m.length - 1]);
        if (n !== null) return { field: f.name, value: clamp(f, n) };
      }
    }
  }
  // "what if I work 30 hours" / "if i worked thirty hours a week"
  const w = new RegExp(`\\b(?:work|worked|working)\\s*${NUM_TOKEN}(?: hours?)?`).exec(t) ?? new RegExp(`${NUM_TOKEN} hours? (?:a|per) week`).exec(t);
  if (w) {
    const n = toNumber(w[1]);
    if (n !== null) return { field: "work_hours", value: clamp(NUM_FIELDS[0], n) };
  }
  const im = new RegExp(`\\b(?:have|had|did|do|with|get)\\s*${NUM_TOKEN} internships?\\b`).exec(t);
  if (im) {
    const n = toNumber(im[1]);
    if (n !== null) return { field: "internship_count", value: clamp(NUM_FIELDS[7], n) };
  }
  return null;
}

function clamp(f: NumField, n: number): number {
  if (f.name === "earned_ratio" && n > 1 && n <= 100) n = n / 100;
  const v = Math.min(f.max, Math.max(f.min, n));
  return f.int ? Math.round(v) : Math.round(v * 100) / 100;
}

const has = (t: string, re: RegExp) => re.test(t);

const ADVISOR = /\b(advisor|advisors|watchtower|alarms?|over the line|at risk|at-risk|caseload|who should i call|who needs (?:help|outreach)|flagged students?|risk queue|outreach)\b/;
const OWN_STRONG = /\b(am i cooked|am i (?:going to|gonna|on track|ok|okay|fine|safe|doomed)|my (?:audit|plan|degree|risk|graduation|transcript|courses?|credits|grades?|gpa|major)|un-?cooked|get out of (?:this|it)|stress test|stress-test|what did you read|read from my|the audit i|my twins?|students like me|repair (?:plan|my)|fix my|what should i (?:do|take|drop)|which course|drop which|should i (?:drop|take|withdraw|switch|retake)|when (?:will|do) i graduate|will i graduate)\b/;
const OWN_PRONOUN = /\b(i|i'm|im|i've|ive|my|me|mine)\b/;
const SCENARIO_VERB = /\b(set|make|change|put|bump|raise|lower|slide|drag|adjust)\b/;
const MODELS = /\b(sliders?|forecast|salary|salaries|pay|career|careers|accuracy|accurate|arena|trust|trustworthy|compare (?:the )?models?|models?|model card|constellation|baseline|auroc|calibration|simulate|scenario|predict(?:ion|ions)?|lab|control room|how good|how sure|confidence|explain the model|what drives)\b/;
const COHORT = /\b(alumni|graduates?|grads?|cohort|majors?|internships?|cost|tuition|debt|by year|over time|dataset|which major|how many students|students who|students with|compared? (?:cs|computer science|information systems)|computer science|information systems|transfer students?|freshmen|first-time|work hours? (?:vs|versus)|hours (?:vs|versus)|time to degree|time-to-degree|how long (?:do|does|did)|where do|where did|what do (?:people|students)|do .*\b(?:help|matter|pay off|make a difference)|is it worth)\b/;
const SAMPLE = /\b(load|use|try|open|show)\b.*\b(sample|demo|example|test)\b.*\b(student|audit|plan)?|\b(sample|demo) (?:student|audit)\b/;
const STRESS = /\b(stress[- ]?test|shock(?:s)?|what breaks|worst case)\b/;
const REPAIR = /\b(repair|un-?cooked|get back on track|fix (?:my|the) plan|rescue|recovery plan|how do i get out)\b/;
const DESCRIBE = /\b(what(?:'s| is) (?:on )?(?:the |my )?screen|describe (?:the |this )?screen|what am i looking at|read (?:this|the screen) (?:to me|out)|what do i see)\b/;

const NEEDS_STUDENT_NOTE = "I need your degree audit for that. Opening the audit screen: upload your audit PDF there, or load a sample student, and ask again.";

/** Decide which chapter answers `utterance`. Ties: the current chapter, else audit when a student is loaded, else cohort. */
export function routeUtterance(utterance: string, ctx: RouteContext): Route {
  const raw = utterance.trim();
  const t = norm(raw);
  const mk = (chapter: RouteChapter, intent: RouteIntent, reason: string, extra: Partial<Route> = {}): Route => ({ chapter, intent, question: raw, reason, ...extra });
  const ownPlan = (intent: RouteIntent, reason: string): Route =>
    ctx.student || intent === "load-sample" ? mk("audit", intent, reason) : mk("audit", "open", `${reason} (no student loaded)`, { note: NEEDS_STUDENT_NOTE });

  if (!t) return mk(ctx.chapter, "describe", "empty");
  if (has(t, DESCRIBE)) return mk(ctx.chapter, "describe", "describe screen");
  if (has(t, SAMPLE) && !has(t, ADVISOR)) return ownPlan("load-sample", "load sample");
  if (has(t, ADVISOR)) return mk("advisor", "ask", "advisor vocabulary");

  const scen = parseScenario(t);
  const scenVerb = has(t, SCENARIO_VERB);
  // An explicit "set X to N" is always a lab edit. A "what if I work 30 hours" is the user's own plan when one is loaded and they are not already in the lab.
  if (scen && scenVerb) return mk("models", "scenario", "set field to value", { field: scen.field, value: scen.value });

  if (has(t, STRESS)) return ownPlan("stress-test", "stress test");
  if (has(t, REPAIR) && (ctx.student || has(t, OWN_PRONOUN) || ctx.chapter === "audit")) return ownPlan("repair", "repair plan");
  if (has(t, OWN_STRONG)) return ownPlan("ask", "own-plan phrasing");

  if (scen) {
    if (ctx.chapter === "models" || !ctx.student) return mk("models", "scenario", "what-if with no plan to use", { field: scen.field, value: scen.value });
    return mk("audit", "ask", "what-if on my own plan");
  }

  const cohort = has(t, COHORT);
  const models = has(t, MODELS);
  if (cohort && !models) return mk("cohort", "ask", "cohort vocabulary");
  if (models && !cohort) return mk("models", "ask", "model vocabulary");
  if (cohort && models) {
    // "salary by major" reads alumni data; "compare models on salary" is the lab. The question words decide.
    if (/\b(compare|arena|accuracy|trust|forecast|slider|model)/.test(t)) return mk("models", "ask", "model wins tie");
    return mk("cohort", "ask", "cohort wins tie");
  }

  // Nothing matched: stay in the current chapter; the audit chapter cannot answer without a plan, so the cohort takes it.
  return mk(ctx.chapter === "audit" && !ctx.student ? "cohort" : ctx.chapter, "ask", "ambiguous: current chapter");
}

/** Suggestion chips for the command bar, per chapter, so the palette teaches what the app can answer. */
export const SUGGESTIONS: Record<RouteChapter, string[]> = {
  audit: ["Am I cooked?", "What if I take 3 more credits?", "Run a stress test", "How do I get un-cooked?", "What did you read from my audit?"],
  cohort: ["Do internships help?", "Where do graduates go?", "Cost by year", "Work hours vs time to degree"],
  models: ["Set internships to three", "What if I work 30 hours?", "Compare the models", "How accurate is the salary forecast?"],
  advisor: ["Who is over the line?", "How many alarms are there?", "Which students are at risk?"],
};
