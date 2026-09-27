"use client";

// DEV-ONLY harness for the voice controller (served at /dev/voice, 404 in production).
// Everything the fake scene says is labelled FAKE: it exists to prove that a command spoken to the
// agent (or fired from a button here) reaches a registered scene and that the UI reacts.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  COMMANDS,
  SAMPLES,
  SCENARIO_FIELDS,
  SCENES,
  agentPayload,
  availableCommands,
  getScreenContext,
  registerCommands,
  runCommand,
  subscribeCommandEvents,
  type CommandEvent,
  type CommandHandlers,
  type CommandName,
  type SceneId,
  type ScenarioField,
} from "@/lib/commands";
import { CookedVoiceProvider, makeClientTools, useCookedVoice, useVoiceCommands, useVoiceScreen, type VoiceState } from "@/lib/voiceAgent";
import { parseIntent } from "@/lib/voiceIntents";
import { VoiceDock, type DockPreview } from "./VoiceDock";

const DEFAULTS: Record<ScenarioField, number | string> = {
  major: "Computer Science", entry_type: "First-Time Freshman", residency: "In-State", work_hours: 15, completed_terms: 3,
  credits_per_term: 12, earned_ratio: 0.9, withdrawals: 0, failures: 0, enrollment_gaps: 0, internship_count: 1, credential_count: 1, engagement_count: 3,
};
const ORDER = SCENES.map((s) => s.id);

export function VoiceHarness() {
  const [preview, setPreview] = useState<DockPreview | null>(null);
  return (
    <CookedVoiceProvider>
      <Harness onPreview={setPreview} previewing={preview?.state ?? null} />
      <VoiceDock preview={preview ?? undefined} />
    </CookedVoiceProvider>
  );
}

const PREVIEWS: DockPreview[] = [
  { state: "idle" },
  { state: "connecting" },
  { state: "listening", user: "show me the twins" },
  { state: "thinking", user: "am I cooked" },
  { state: "speaking", user: "am I cooked", agent: "FAKE reply: I would read the app's answer here, with its real numbers." },
  { state: "error" },
];

function Harness({ onPreview, previewing }: { onPreview: (p: DockPreview | null) => void; previewing: VoiceState | null }) {
  const voice = useCookedVoice();
  const [scene, setScene] = useState<SceneId>("risk");
  const [values, setValues] = useState<Record<ScenarioField, number | string>>(DEFAULTS);
  const [student, setStudent] = useState<string | null>(null);
  const [mounted, setMounted] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [log, setLog] = useState<CommandEvent[]>([]);
  const sceneRef = useRef(scene);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(
    () =>
      subscribeCommandEvents((e) => {
        setLog((old) => [e, ...old.filter((x) => x.id !== e.id)].slice(0, 14));
      }),
    [],
  );

  const flashOn = (key: string) => {
    setFlash(key);
    setTimeout(() => setFlash((f) => (f === key ? null : f)), 1100);
  };

  // A fake scene host. Handlers echo what the bus validated; no invented data beyond labelled FAKE text.
  const handlers: Partial<CommandHandlers> = useMemo(
    () => ({
      showScene: ({ scene: s }) => {
        setScene(s);
        flashOn("scene");
        return `Showing ${SCENES.find((x) => x.id === s)?.label}. FAKE scene.`;
      },
      nextScene: () => {
        const next = ORDER[(ORDER.indexOf(sceneRef.current) + 1) % ORDER.length];
        setScene(next);
        flashOn("scene");
        return `Next: ${SCENES.find((x) => x.id === next)?.label}. FAKE scene.`;
      },
      previousScene: () => {
        const prev = ORDER[(ORDER.indexOf(sceneRef.current) + ORDER.length - 1) % ORDER.length];
        setScene(prev);
        flashOn("scene");
        return `Back to ${SCENES.find((x) => x.id === prev)?.label}. FAKE scene.`;
      },
      setScenario: ({ field, value }) => {
        setValues((v) => ({ ...v, [field]: value }));
        flashOn(field);
        return `Set ${SCENARIO_FIELDS.find((f) => f.name === field)?.label} to ${value}. FAKE model, no prediction run.`;
      },
      runStressTest: () => {
        setScene("drill");
        flashOn("scene");
        return student ? "FAKE stress test: no real shocks were simulated." : { ok: false, message: "Load a sample student first." };
      },
      findRepair: () => {
        setScene("repair");
        flashOn("scene");
        return student ? "FAKE repair: no real evidence was queried." : { ok: false, message: "Load a sample student first." };
      },
      loadSampleStudent: ({ which }) => {
        const key = which ?? "working";
        setStudent(key);
        flashOn("student");
        return `Loaded the ${key.replace("_", " ")} sample student. FAKE profile.`;
      },
      askStudent: ({ question }) => (student ? `FAKE answer to “${question}”. No model was called.` : { ok: false, message: "No student is loaded. Say “load a sample student” first." }),
      exploreCohort: ({ question }) => `FAKE cohort answer to “${question}”. No query was run.`,
    }),
    [student],
  );
  // The bus is only populated while the fake scene is "mounted", so unavailable-command handling can be tried by hand.
  useVoiceCommands(mounted ? handlers : {});

  useVoiceScreen(
    mounted
      ? {
          scene,
          title: `FAKE ${SCENES.find((s) => s.id === scene)?.label}`,
          summary: `FAKE harness screen showing the ${SCENES.find((s) => s.id === scene)?.label} scene. These values are placeholders, not model output.`,
          facts: { ...values, student: student ?? "none" },
          student: student !== null,
          scenes: ORDER,
        }
      : null,
  );

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 pb-44 pt-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label !text-gold">Dev harness · FAKE data</p>
          <h1 className="display mt-2 text-[44px] font-black sm:text-[64px]">Voice controller</h1>
          <p className="mt-2 max-w-[60ch] text-[15px] text-muted">
            The dock below talks to the real ElevenLabs agent when the server is configured (and you are signed in), and to browser push-to-talk otherwise. Either way, commands land on this fake scene.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input type="checkbox" checked={mounted} onChange={(e) => setMounted(e.target.checked)} className="accent-[#f6b41a]" />
          Scene mounted (untick to test “not available on this screen”)
        </label>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="panel p-5">
          <p className="label">On screen</p>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
            <h2 key={scene} className="display text-gold-grad text-[56px] font-black transition-transform sm:text-[84px]" style={{ transform: flash === "scene" ? "scale(1.03)" : "none" }}>
              {SCENES.find((s) => s.id === scene)?.label}
            </h2>
            <p className="pb-3 text-[13px] text-muted">{SCENES.find((s) => s.id === scene)?.blurb}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {SCENES.map((s) => (
              <button key={s.id} type="button" onClick={() => void runCommand("showScene", { scene: s.id }, { source: "dev" })} className={`rounded-full border px-3 py-1 text-[12px] transition ${s.id === scene ? "border-gold bg-gold/15 text-gold-hi" : "border-line-2 text-muted hover:border-gold/40 hover:text-text"}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {SCENARIO_FIELDS.map((f) => (
              <div key={f.name} className="flex items-baseline justify-between gap-2 border-b border-line py-1.5 transition-colors" style={{ background: flash === f.name ? "rgba(246,180,26,0.16)" : "transparent" }}>
                <span className="truncate text-[12px] text-muted">{f.label}</span>
                <span className="num text-[14px] text-text">{String(values[f.name])}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-2 border-b border-line py-1.5" style={{ background: flash === "student" ? "rgba(246,180,26,0.16)" : "transparent" }}>
              <span className="text-[12px] text-muted">sample student</span>
              <span className="num text-[14px] text-text">{student ?? "none"}</span>
            </div>
          </div>
        </section>

        <section className="panel p-5">
          <p className="label">Command log · newest first</p>
          <ol className="mt-3 space-y-1.5" aria-live="polite">
            {log.length === 0 && <li className="text-[13px] text-dim">Nothing yet. Speak, type, or press a button.</li>}
            {log.map((e) => (
              <li key={e.id} className="rounded-lg border border-line bg-black/20 px-3 py-2 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <span className={`size-1.5 rounded-full ${e.status === "ok" ? "bg-cool" : e.status === "running" ? "bg-gold" : "bg-hot"}`} />
                  <span className="num text-gold-hi">{e.command}</span>
                  <span className="label !tracking-wide">{e.source}</span>
                  {e.result && <span className="num ml-auto text-dim">{e.result.ms} ms</span>}
                </div>
                <div className="num mt-1 truncate text-dim">{JSON.stringify(e.args)}</div>
                {e.result && <div className="mt-0.5 text-muted">{e.result.message}</div>}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="panel mt-5 p-5">
        <p className="label">Dock states · visual QA (static, no microphone)</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PREVIEWS.map((p) => (
            <button key={p.state} type="button" onClick={() => onPreview(previewing === p.state ? null : p)} className={`rounded-full border px-3 py-1.5 text-[12.5px] transition ${previewing === p.state ? "border-gold bg-gold/15 text-gold-hi" : "border-line-2 text-text hover:border-gold/50"}`}>
              {p.state}
            </button>
          ))}
          <button type="button" onClick={() => onPreview(null)} className="rounded-full border border-line-2 px-3 py-1.5 text-[12.5px] text-muted hover:text-text">live</button>
        </div>
      </section>

      <FireControls />
      <SelfTests />

      <section className="panel mt-5 p-5">
        <p className="label">Voice state</p>
        <pre className="num mt-3 overflow-x-auto text-[12px] leading-relaxed text-muted">
          {JSON.stringify(
            {
              state: voice.state, engine: voice.engine, support: voice.support, supportNote: voice.supportNote, connected: voice.connected, micOpen: voice.micOpen,
              handsFree: voice.handsFree, error: voice.error, interim: voice.interim, lines: voice.lines.slice(-4).map((l) => `${l.role}: ${l.text}`),
              availableCommands: availableCommands(), screen: getScreenContext()?.title ?? null,
            },
            null,
            2,
          )}
        </pre>
      </section>
    </main>
  );
}

function FireControls() {
  const [field, setField] = useState<ScenarioField>("work_hours");
  const [value, setValue] = useState("30");
  const [question, setQuestion] = useState("am I cooked?");
  const [phrase, setPhrase] = useState("set internships to three");
  const [toolReply, setToolReply] = useState<string>("");
  const voice = useCookedVoice();
  const tools = useMemo(() => makeClientTools(), []);
  // Calls the same client-tool function the ElevenLabs SDK calls, so this is the exact string the agent would read back.
  const asAgent = async (name: CommandName, args: Record<string, unknown>) => setToolReply(`${name}(${JSON.stringify(args)}) →\n${await tools[name](args)}`);
  const fire = (name: CommandName, args?: unknown) => void runCommand(name, args, { source: "dev" });
  const parsed = useMemo(() => parseIntent(phrase, { scene: null, hasStudent: false, available: availableCommands() }), [phrase]);
  const btn = "rounded-full border border-line-2 px-3 py-1.5 text-[12.5px] text-text transition hover:border-gold/50 hover:bg-gold/10";
  const field$ = "h-9 rounded-full border border-line-2 bg-black/30 px-3.5 text-[13px] text-text outline-none focus:border-gold/60";

  return (
    <section className="panel mt-5 p-5">
      <p className="label">Fire commands without a microphone</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btn} onClick={() => fire("describeScreen")}>describeScreen</button>
        <button className={btn} onClick={() => fire("nextScene")}>nextScene</button>
        <button className={btn} onClick={() => fire("previousScene")}>previousScene</button>
        <button className={btn} onClick={() => fire("runStressTest")}>runStressTest</button>
        <button className={btn} onClick={() => fire("findRepair")}>findRepair</button>
        {SAMPLES.map((s) => (
          <button key={s.key} className={btn} onClick={() => fire("loadSampleStudent", { which: s.key })}>loadSampleStudent · {s.key}</button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={field} onChange={(e) => setField(e.target.value as ScenarioField)} className={field$} aria-label="Scenario field">
          {SCENARIO_FIELDS.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
        </select>
        <input value={value} onChange={(e) => setValue(e.target.value)} className={`${field$} w-40`} aria-label="Scenario value" />
        <button className={btn} onClick={() => fire("setScenario", { field, value })}>setScenario</button>
        <span className="text-[12px] text-dim">try 80 for work_hours to see the clamp</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} className={`${field$} min-w-[220px] flex-1`} aria-label="Question" />
        <button className={btn} onClick={() => fire("askStudent", { question })}>askStudent</button>
        <button className={btn} onClick={() => fire("exploreCohort", { question })}>exploreCohort</button>
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <p className="label">Offline router: what would push-to-talk do with this phrase?</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={phrase} onChange={(e) => setPhrase(e.target.value)} className={`${field$} min-w-[260px] flex-1`} aria-label="Phrase" />
          <button className={btn} onClick={() => void voice.sendText(phrase)}>Send through the dock</button>
        </div>
        <pre className="num mt-2 whitespace-pre-wrap break-words text-[12px] text-muted">{parsed ? `${parsed.command} ${JSON.stringify(parsed.args)}` : "no command recognised"}</pre>
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <p className="label">Simulate the agent: the exact tool result it would receive</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btn} onClick={() => void asAgent("showScene", { scene: "twins" })}>showScene twins</button>
          <button className={btn} onClick={() => void asAgent("setScenario", { field: "work_hours", value: "80" })}>setScenario work_hours 80</button>
          <button className={btn} onClick={() => void asAgent("describeScreen", {})}>describeScreen</button>
          <button className={btn} onClick={() => void asAgent("askStudent", { question })}>askStudent</button>
        </div>
        {toolReply && <pre className="num mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[12px] text-muted" data-testid="agent-reply">{toolReply}</pre>}
      </div>
      <p className="mt-4 text-[12px] text-dim">Catalogue: {COMMANDS.map((c) => c.name).join(" · ")}</p>
    </section>
  );
}

interface Check { name: string; pass: boolean; detail?: string }

function SelfTests() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    const out: Check[] = [];
    const check = (name: string, pass: boolean, detail?: string) => out.push({ name, pass, detail });
    const seen: unknown[] = [];
    // A temporary slot on top of the harness: later registrations win, and the harness handler returns on unregister.
    const off = registerCommands({
      showScene: (a) => (seen.push(a), `test:${a.scene}`),
      setScenario: (a) => (seen.push(a), `test:${a.field}=${a.value}`),
      nextScene: () => "temp-next",
    });
    const dev = { source: "dev" as const };

    let r = await runCommand("showScene", { scene: "the twins" }, dev);
    check("showScene resolves “the twins” to twins", r.ok && r.message === "test:twins", r.message);
    r = await runCommand("showScene", { scene: "compare the four models" }, dev);
    check("showScene resolves “compare the four models” to models", r.message === "test:models", r.message);
    r = await runCommand("showScene", { scene: "nonsense" }, dev);
    check("showScene rejects an unknown scene", !r.ok, r.message);
    r = await runCommand("setScenario", { field: "work_hours", value: "80" }, dev);
    check("setScenario clamps work_hours 80 to 50 and says so", r.ok && r.message.startsWith("test:work_hours=50") && r.applied?.clamped === true && /only go from 0 to 50/.test(r.message), r.message);
    r = await runCommand("setScenario", { field: "internships", value: "three" }, dev);
    check("setScenario understands “internships” = “three”", r.message === "test:internship_count=3", r.message);
    r = await runCommand("setScenario", { field: "earned ratio", value: "ninety percent" }, dev);
    check("setScenario turns “ninety percent” into 0.9", r.message === "test:earned_ratio=0.9", r.message);
    r = await runCommand("setScenario", { field: "credits per term", value: 2 }, dev);
    check("setScenario clamps credits_per_term 2 up to 3", r.message.startsWith("test:credits_per_term=3") && r.applied?.clamped === true, r.message);
    r = await runCommand("setScenario", { field: "major", value: "info systems" }, dev);
    check("setScenario maps “info systems” to Information Systems", r.message === "test:major=Information Systems", r.message);
    r = await runCommand("setScenario", { field: "residency", value: "out of state" }, dev);
    check("setScenario maps “out of state” to Out-of-State", r.message === "test:residency=Out-of-State", r.message);
    r = await runCommand("setScenario", { field: "entry_type", value: "freshman" }, dev);
    check("setScenario maps “freshman” to First-Time Freshman", r.message === "test:entry_type=First-Time Freshman", r.message);
    r = await runCommand("setScenario", { field: "favourite_colour", value: "gold" }, dev);
    check("setScenario rejects an unknown field", !r.ok, r.message);
    r = await runCommand("setScenario", { field: "work_hours", value: "lots" }, dev);
    check("setScenario rejects a non-number for a numeric field", !r.ok, r.message);
    r = await runCommand("nope", {}, dev);
    check("unknown command fails honestly", !r.ok, r.message);
    r = await runCommand("nextScene", {}, dev);
    check("newest registration wins (nextScene → temp-next)", r.message === "temp-next", r.message);
    off();
    r = await runCommand("nextScene", {}, dev);
    check("unregistering restores the previous handler", r.message !== "temp-next", r.message);
    const payload = JSON.parse(agentPayload({ ok: true, command: "x", message: "hello", applied: { field: "work_hours", value: 30 }, ms: 1 })) as { ok: boolean; say: string };
    check("agent payload is JSON with ok + say", payload.ok === true && payload.say === "hello");

    const ctx = { scene: null, hasStudent: false, available: COMMANDS.map((c) => c.name) as CommandName[] };
    const table: [string, CommandName, Record<string, unknown>?][] = [
      ["show me the twins", "showScene", { scene: "twins" }],
      ["next", "nextScene"],
      ["go back", "previousScene"],
      ["set internships to three", "setScenario", { field: "internship_count", value: "three" }],
      ["what if I work 30 hours", "setScenario", { field: "work_hours", value: 30 }],
      ["run a stress test", "runStressTest"],
      ["how do I get un-cooked", "findRepair"],
      ["load a sample student", "loadSampleStudent"],
      ["compare the four models", "showScene", { scene: "models" }],
      ["am I cooked", "askStudent"],
      ["how do internships relate to first jobs", "exploreCohort"],
      ["what's on the screen", "describeScreen"],
      ["make it a transfer student", "setScenario", { field: "entry_type", value: "Transfer" }],
      ["make it 2 internships", "setScenario", { field: "internship_count", value: 2 }],
      ["what if I take three more credits a term", "askStudent"],
    ];
    for (const [text, command, args] of table) {
      const p = parseIntent(text, ctx);
      const argsOk = !args || Object.entries(args).every(([k, v]) => p?.args[k] === v);
      check(`router: “${text}” → ${command}`, p?.command === command && argsOk, p ? `${p.command} ${JSON.stringify(p.args)}` : "null");
    }
    setChecks(out);
    setRunning(false);
  }

  const failed = checks?.filter((c) => !c.pass).length ?? 0;
  return (
    <section className="panel mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">Bus + router self-test</p>
        <button onClick={() => void run()} disabled={running} className="rounded-full bg-gold px-4 py-1.5 text-[12.5px] font-semibold text-bg disabled:opacity-40">
          {running ? "Running…" : "Run self-test"}
        </button>
      </div>
      {checks && (
        <>
          <p className={`num mt-3 text-[14px] ${failed ? "text-hot" : "text-cool"}`} data-testid="selftest-summary">{checks.length - failed}/{checks.length} passed</p>
          <ul className="mt-2 space-y-1 text-[12.5px]">
            {checks.map((c) => (
              <li key={c.name} className={c.pass ? "text-muted" : "text-hot"}>
                <span className="num mr-2">{c.pass ? "PASS" : "FAIL"}</span>
                {c.name}
                {!c.pass && c.detail && <span className="num ml-2 text-dim">{c.detail}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
