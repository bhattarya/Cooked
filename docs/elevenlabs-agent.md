# ElevenLabs voice agent: a hands-free controller for COOKED

The ElevenLabs agent hears the user, decides what they want, and **drives the app**: it calls client tools that scenes have registered on a command bus, the UI visibly reacts, and the agent then speaks the result. It is not a narrator that reads text aloud.

```
mic ──► ElevenLabs agent (speech to text ► LLM ► tool call) ──► client tool ──► command bus ──► scene handler ──► UI changes
                     ▲                                                                                  │
                     └────── tool result JSON {ok, say, data} ◄──────────────────────────────────────────┘
        contextual updates ("SCREEN: scene twins, ...") keep the agent's view of the screen current
```

Try: "am I cooked?", "what if I work 30 hours", "set internships to three", "show me the twins", "next", "run a stress test", "how do I get un-cooked", "load a sample student", "compare the four models".

## Why it used to only read things out

- Speech input came from the **browser's** `SpeechRecognition`; ElevenLabs was wired only as text to speech (`/voice`). It never heard the user.
- The live ElevenLabs agent was reachable only through an opt-in button on some screens, and its two tools (`exploreCohort`, `askStudent`) merely forwarded a question and returned text. It could not change scene, set a scenario value, run the stress test or load a student.
- The live agent was configured without `client_tool_call` in its client events, and every tool showed zero recorded calls on the account, so the browser may never have been told to act.

## Pieces

| File | Role |
| --- | --- |
| `web/lib/voice-commands.json` | Single source of truth: scenes, scenario fields with ranges, samples, and every command with its agent-facing description and argument schema. |
| `web/lib/commands.ts` | Framework-agnostic command bus: `registerCommands`, `runCommand`, `setScreenContext`, argument validation and clamping. |
| `web/lib/voiceAgent.ts` | `CookedVoiceProvider`, `useCookedVoice`, `useVoiceCommands`, `useVoiceScreen`; session start, captions, levels, push-to-talk, fallbacks. |
| `web/lib/voiceIntents.ts` | Offline phrase-to-command parser used by the push-to-talk and typed fallbacks. |
| `web/components/voice/` | `VoiceDock` (floating control), `VoiceRoot`, orb, and the "Voice → set work hours = 30" toast. |
| `web/app/voice-session/route.ts` | Authenticated route that mints the short-lived signed URL. Secrets stay server-side. |
| `scripts/provision_elevenlabs_agent.py` | Creates or updates the tools and the agent from the catalogue. `--dry-run` contacts nothing. |
| `web/app/dev/voice/page.tsx` | Dev-only harness (`/dev/voice`): the dock, a fake scene, a command log, buttons for every command, and a bus self-test. |

## Commands

Defined once in `web/lib/voice-commands.json`; every result is `{ ok, say, data?, applied? }` and the agent is told to speak `say` and never add numbers.

| Command | Arguments | What it does |
| --- | --- | --- |
| `describeScreen` | none | Reads back what is on screen (scene, visible values, reachable scenes). Built in: it answers from the published screen context if no scene overrides it. |
| `askStudent` | `question` | A question about the user's own plan; the scene calls the audit `/students/{id}/ask` orchestration. |
| `exploreCohort` | `question` | A question about cohort patterns; the scene calls `/explore`. |
| `showScene` | `scene` (risk, timeline, twins, drill, repair, careers, models, explore) | Navigate. |
| `nextScene`, `previousScene` | none | Navigate in order. |
| `setScenario` | `field`, `value` | Change one Model Lab or what-if input. The bus validates and clamps against the same ranges as `ModelLabRequest` and reports what it applied. |
| `runStressTest` | none | The fire drill. |
| `findRepair` | none | The smallest fix that gets the user un-cooked. |
| `loadSampleStudent` | `which` (working, cooked, on_track), optional | Load a synthetic sample plan. |

A command that no mounted scene handles fails honestly ("That isn't available on this screen"); the agent relays that instead of guessing.

## Provisioning the agent

The agent must be **private** (authentication enabled); the web runtime needs `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`.

```bash
.venv/bin/python -m scripts.provision_elevenlabs_agent --dry-run   # print every payload; sends nothing, needs no key
.venv/bin/python -m scripts.provision_elevenlabs_agent             # apply
```

The real run is idempotent and **modifies the live agent**:

1. `GET /tools`; each catalogue command is created if missing, `PATCH`ed if its description or schema differs, and left alone otherwise. Tool parameters are proper JSON-schema properties (`string` with optional `enum`); numeric ranges live in the descriptions and are enforced client-side by the bus.
2. The agent named "COOKED · Synthetic Student Pathways" is `PATCH`ed (or created). This sets the controller system prompt, first message, all tool ids, sequential tool calls, turn-taking (normal eagerness, 30 s reply timeout so it does not nag, back-channel terms that do not interrupt), TTS speed, a 900 s cap, dynamic-variable defaults for the screen, and `client_events` including `client_tool_call` and `tentative_user_transcript`.
3. The agent id is written to the ignored root `.env`.

Replacing `tool_ids` removes any tool you attached by hand in the dashboard. Re-run the script after editing the catalogue. `tests/test_voice_provision.py` checks that the payload, the prompt, the browser bus and the backend `ModelLabRequest` ranges agree.

API references used for the payload shape: [Create tool](https://elevenlabs.io/docs/api-reference/tools/create), [Create agent](https://elevenlabs.io/docs/api-reference/agents/create), [Client tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools), [React SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react).

## Runtime behaviour

- The dock probes `GET /voice-session?probe=1` on load (no ElevenLabs call). If the agent is configured and the user is signed in, tapping the orb starts a live session: microphone check, `GET /voice-session` for a signed URL, then `startSession({ signedUrl })`. The key never reaches the browser.
- On connect and whenever a scene republishes its screen state, the app sends a contextual update (`SCREEN: scene ..., visible values ...`) so the agent narrates real numbers. The same values are passed as dynamic variables at session start.
- **Hands-free** keeps the mic open. Turn it off for **push-to-talk** (hold Space or the orb) in a noisy room. Tapping the orb while it is speaking silences it; speaking over the agent interrupts it.
- If the live agent is unavailable (signed out, not configured, demo mode, offline) the same commands work through browser speech recognition push-to-talk and typed text, routed by `voiceIntents.ts`. Replies are spoken through the existing `/voice` clips or the browser voice.

## Limits worth knowing

- The live agent's audio path cannot be exercised without a real microphone; `/dev/voice` proves the command routing and the UI reaction, not speech recognition.
- Tool results are only as good as the scene handlers. A scene that does not register a command simply does not offer it.
- Data is synthetic, "No Response" means unknown, money is nominal, and career or salary results are exploratory. The system prompt repeats these and the 30-twin refusal.
