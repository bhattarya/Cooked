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
| `/` | Landing: animated field of all 3,200 alumni trajectories, three auto-picked demo students (cooked / watch / fine), audit drop zone, the load-cliff finding |
| `/s/[id]` | Student cockpit: risk gauge, three range tiles, Alarm → Fire drill → Repair story with narration, what-if sliders, agent console, "where you sit", load cliff, prerequisite map |
| `/lab` | Interactive plan lab: search synthetic students, change work hours and planned credits, reveal drill shocks, inspect repair support, and filter cohort evidence |
| `/queue` | Institution queue: every current student with 2+ terms, ranked; per-student rows behind a staff toggle |
| `/myths` | Ideas the data refuted (flip cards) |

## How the pieces fit

- `scripts/build-data.mjs` builds per-person term series (regular terms only, IP excluded), the `cooked` label (time-to-degree > 5 or ≥ 5 withdrawals), k-means trajectory patterns, measured shock rates by work-hours band, the load cliff, and the prerequisite graph. It reproduces the plan's cliff exactly (86 / 78 / 21 / 10 / 0 %).
- `lib/engine.ts` is the local engine. Its functions mirror the tool contracts in build plan §8.2 (`get_state`, `find_twins`, `fire_drill`, `survival`, `escapee_stats`, `catalog_feasibility`, `alarm_check`, `plan_outcome`). Every result carries a `tr_…` id that the UI shows as evidence.
- Narration scripts are arrays of text and number tokens (`Seg[]`). The language model never writes a number; tokens render highlighted and trace to a tool result.
- `lib/voice.ts` posts to `${NEXT_PUBLIC_API_URL}/voice` and plays `/audio/{hash}` (ElevenLabs, cached). With no backend it falls back to browser speech so the demo still talks.
- `lib/audit.ts` builds sample degree-audit PDFs from synthetic students and reads uploads: it uses `POST /audit/parse` (Gemini) when the backend is up and pulls the campus ID from the raw bytes otherwise.

## Backend plug points

Set `NEXT_PUBLIC_API_URL` to the FastAPI base URL. The front end currently calls:

- `POST /voice {text, voice}` → `{hash}`, then `GET /audio/{hash}`
- `POST /audit/parse` (multipart `file`) → `{campus_id}`

Everything else still runs in `lib/engine.ts`. To move a tool server-side, keep its return shape and swap the call in `components/Cockpit.tsx`.

## Honest limits of the local engine

- Twins: same entry type, work hours within ±3–10, first-k average credits within ±1–2.5, withdrawals within ±0–2. It widens in tiers and refuses below 30 matches.
- The drill uses transparent arithmetic (remaining credits ÷ load → projected years), not the trained risk model. The ML lead's frozen model should replace it.
- Trajectory clusters here use per-term features. Sizes (2,016 / 631 / 393 / 129 / 31) differ from the plan's notebook run (2,390 / 377 / 327 / 75 / 31).
