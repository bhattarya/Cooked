// Run: node --experimental-strip-types web/scripts/studioRoute.test.ts
// @ts-expect-error node needs the .ts extension; tsc does not allow it
import { routeUtterance, type RouteChapter, type RouteContext } from "../lib/studioRoute.ts";

type Case = [utterance: string, ctx: Partial<RouteContext>, chapter: RouteChapter, extra?: { intent?: string; field?: string; value?: number }];
const S = { student: true }, N = { student: false };
const cases: Case[] = [
  // own plan
  ["am I cooked", S, "audit"], ["Am I cooked?", N, "audit", { intent: "open" }], ["what if I take 3 more credits", S, "audit"],
  ["which course should I drop", S, "audit"], ["run a stress test", S, "audit", { intent: "stress-test" }], ["stress test my plan", N, "audit", { intent: "open" }],
  ["how do I get un-cooked", S, "audit", { intent: "repair" }], ["what did you read from my audit", S, "audit"], ["will I graduate on time", S, "audit"],
  ["load a sample student", N, "audit", { intent: "load-sample" }], ["use the demo student", { student: false, chapter: "cohort" }, "audit", { intent: "load-sample" }],
  ["am I going to graduate", S, "audit"], ["should I retake calculus", S, "audit"], ["what should I do next", { student: true, chapter: "audit" }, "audit"],
  ["show me my repair plan", S, "audit", { intent: "repair" }], ["what if I work 30 hours", { student: true, chapter: "audit" }, "audit"],
  // cohort
  ["do internships help", S, "cohort"], ["where do graduates go", S, "cohort"], ["cost by year", N, "cohort"], ["which major pays more", S, "cohort"],
  ["work hours vs time to degree", S, "cohort"], ["what happened to alumni", N, "cohort"], ["how many students transfer", S, "cohort"],
  ["compare computer science and information systems", S, "cohort"], ["how long do students take to graduate", N, "cohort"], ["do certifications matter", S, "cohort"],
  ["tuition and debt by year", S, "cohort"], ["what do transfer students earn", S, "cohort"], ["where did alumni end up", { chapter: "models", student: true }, "cohort"],
  // models
  ["set internships to three", S, "models", { intent: "scenario", field: "internship_count", value: 3 }],
  ["set work hours to 30", S, "models", { intent: "scenario", field: "work_hours", value: 30 }],
  ["what if I work 30 hours", N, "models", { intent: "scenario", field: "work_hours", value: 30 }],
  ["what if I work 30 hours", { student: true, chapter: "models" }, "models", { intent: "scenario", field: "work_hours", value: 30 }],
  ["make failures two", S, "models", { field: "failures", value: 2 }], ["put withdrawals at 4", S, "models", { field: "withdrawals", value: 4 }],
  ["set credits per term to 15", S, "models", { field: "credits_per_term", value: 15 }], ["set work hours to 90", S, "models", { field: "work_hours", value: 50 }],
  ["set earned ratio to 90%", S, "models", { field: "earned_ratio", value: 0.9 }], ["change credentials to five", S, "models", { field: "credential_count", value: 5 }],
  ["set enrollment gaps to 1", S, "models", { field: "enrollment_gaps", value: 1 }], ["set engagement to twelve", S, "models", { field: "engagement_count", value: 12 }],
  ["set completed terms to four", S, "models", { field: "completed_terms", value: 4 }],
  ["compare the models", S, "models"], ["show the arena", S, "models"], ["how accurate is the salary forecast", S, "models"],
  ["can I trust the career prediction", S, "models"], ["open the sliders", N, "models"], ["what is the model accuracy", { chapter: "cohort" }, "models"],
  ["show the constellation", S, "models"], ["explain the model card", S, "models"],
  // advisor
  ["who is over the line", S, "advisor"], ["how many alarms are there", S, "advisor"], ["which students are at risk", N, "advisor"],
  ["open the watchtower", S, "advisor"], ["show the advisor queue", N, "advisor"], ["who needs outreach this week", S, "advisor"], ["how many students at risk", { chapter: "cohort" }, "advisor"],
  // ambiguity: current chapter
  ["tell me more", { chapter: "models", student: true }, "models"], ["and then", { chapter: "advisor", student: false }, "advisor"],
  ["what about that", { chapter: "cohort", student: true }, "cohort"], ["hello there", { chapter: "audit", student: false }, "cohort"],
  ["hello there", { chapter: "audit", student: true }, "audit"], ["why", { chapter: "cohort", student: false }, "cohort"],
  ["what if I have two internships", { chapter: "models", student: false }, "models", { field: "internship_count", value: 2 }],
  ["does my gpa matter", S, "audit"], ["what is on the screen", { chapter: "cohort" }, "cohort", { intent: "describe" }],
];

let ok = 0;
const bad: string[] = [];
const per: Record<string, [number, number]> = {};
for (const [u, c, want, extra] of cases) {
  const ctx: RouteContext = { student: false, chapter: "audit", ...c } as RouteContext;
  const r = routeUtterance(u, ctx);
  const pass = r.chapter === want && (!extra?.intent || r.intent === extra.intent) && (!extra?.field || r.field === extra.field) && (extra?.value === undefined || r.value === extra.value);
  per[want] ??= [0, 0];
  per[want][1]++;
  if (pass) { ok++; per[want][0]++; } else bad.push(`  "${u}" [${ctx.chapter}, student=${ctx.student}] -> ${r.chapter}/${r.intent}${r.field ? ` ${r.field}=${r.value}` : ""} (${r.reason}); wanted ${want}${extra ? " " + JSON.stringify(extra) : ""}`);
}
for (const [k, [a, b]] of Object.entries(per)) console.log(`${k.padEnd(8)} ${a}/${b}`);
console.log(`TOTAL ${ok}/${cases.length} = ${((100 * ok) / cases.length).toFixed(1)}%`);
if (bad.length) { console.log("FAILS:\n" + bad.join("\n")); process.exit(1); }
