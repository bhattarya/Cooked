# COOKED — web

Next.js front end for COOKED. It runs fully offline on the synthetic HackUMBC 2026 dataset, and the FastAPI backend replaces the local engine piece by piece as it comes online.

```bash
npm install
npm run data   # ../data/*.csv → public/data/*.json (≈0.5 s)
npm run dev    # http://localhost:3000
```

## Routes

| Route | What it is |
| --- | --- |
| `/` | Landing: walking crowd (Skiper UI canvas), COOKED mark, Google sign-in or guest |
| `/app` | Agent workspace (signed-in only): voice orb, audit upload, sponsor-tagged agent pipeline, dashboard, voice/text questions |
| `/app/advisor` | Institution queue: every current student scored by the model |
| `/api/auth/*` | Google OAuth (PKCE, ID token verified against Google's keys), guest session, sign out |

## How the pieces fit

- `scripts/build-data.mjs` builds per-person term series (regular terms only, IP excluded), the `cooked` label (time-to-degree > 5 or ≥ 5 withdrawals), k-means trajectory patterns, measured shock rates by work-hours band, the load cliff, and the prerequisite graph. It reproduces the plan's cliff exactly (86 / 78 / 21 / 10 / 0 %).
- `lib/engine.ts` is the local engine. Its functions mirror the tool contracts in build plan §8.2 (`get_state`, `find_twins`, `fire_drill`, `survival`, `escapee_stats`, `catalog_feasibility`, `alarm_check`, `plan_outcome`). Every result carries a `tr_…` id that the UI shows as evidence.
- Narration scripts are arrays of text and number tokens (`Seg[]`). The language model never writes a number; tokens render highlighted and trace to a tool result.
- `lib/voice.ts` posts to `${NEXT_PUBLIC_API_URL}/voice` and plays `/audio/{hash}` (ElevenLabs, cached). With no backend it falls back to browser speech so the demo still talks.
- `lib/audit.ts` builds sample degree-audit PDFs from synthetic students and reads uploads: it uses `POST /audit/parse` (Gemini) when the backend is up and pulls the campus ID from the raw bytes otherwise.

## Live mode (trained models)

With `NEXT_PUBLIC_API_URL` pointing at the FastAPI service and `/healthz` reporting `mode: "models"`,
the app switches to the trained, checksummed models (`lib/live.ts`): the cockpit, queue, drills,
repair, narration (Gemini or template, provenance-checked), voice (ElevenLabs clips cached in
Postgres) and memory (Backboard or `app.memory_note`) all come from the API, and the agent console
logs the real calls. The badge reads "live model · <version>". If the API is down, every screen
falls back to the browser-side engine in `lib/engine.ts` over the same dataset.

## Honest limits of the local engine

- Twins: same entry type, work hours within ±3–10, first-k average credits within ±1–2.5, withdrawals within ±0–2. It widens in tiers and refuses below 30 matches.
- The drill uses transparent arithmetic (remaining credits ÷ load → projected years), not the trained risk model. The ML lead's frozen model should replace it.
- Trajectory clusters here use per-term features. Sizes (2,016 / 631 / 393 / 129 / 31) differ from the plan's notebook run (2,390 / 377 / 327 / 75 / 31).
