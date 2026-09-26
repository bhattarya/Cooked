# Smoke-test plan

Run from the repository root using `.venv/bin/python -m scripts.<name>`. Scripts read `.env`, honor existing environment values and `COOKED_ENV_FILE`, and suppress exception details that could contain secrets. API calls consume plan quotas/credits. No live provider tests run in normal CI.

| Script | What it actually checks | Pass evidence / cleanup |
| --- | --- | --- |
| `smoke_tiger` | Connect, report extension version, create isolated hypertable, insert 10,000 rows, refresh continuous aggregate | Aggregate sums to 10,000; own schema dropped in `finally` |
| `smoke_gemini` | One short synthetic JSON generation with configured model | Parsed schema result and measured latency; no key or response body logged |
| `smoke_backboard` | Create assistant, store random synthetic mascot code in A, recall without supplying code in distinct B | Exact random code recalled; bounded retries for asynchronous memory, assistant and threads deleted |
| `smoke_elevenlabs` | Render exactly 200 characters through configured Narrator, inspect subscription counter before/after | Audio bytes saved under ignored `data/smoke`; print counter delta; Dhruv must listen |
| `smoke_digitalocean` | Both configured URLs return HTTPS 200; API DB healthy, web contains COOKED | TLS verified, redirects not silently accepted; phone/cellular check still manual |
| `smoke_e2e` | Chromium visits web; browser makes the real configured API health call, API checks DB/cache table | Browser receives healthy JSON and renders Connected; response finishes in <2 seconds |

Set `DEPLOYED_WEB_URL` to the app root and `DEPLOYED_API_URL` to its `/api` prefix. For local E2E, use `http://localhost:3000` and `http://localhost:8000`. Start API/web first. Install Chromium with `.venv/bin/python -m playwright install chromium`; optionally set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome. The measured round trip excludes initial Next.js build/page load and includes browser request through DB/cache-table check. It does **not** yet test cached audio playback, which remains a backend handoff requirement.

Backboard retries can consume up to four generations total. ElevenLabs counter delta can be affected by concurrent team use or delayed billing; record it as observed, not a guaranteed per-character rate. API success does not prove audible quality. The Coach voice can be checked by temporarily selecting its ID as the narrator environment value.

Record date, environment, versions/model IDs, measured timing/counts, and pass/fail in `SETUP_STATUS.md`. Never record keys or connection strings. A missing key is a blocker, not a skipped success.

Verified request references:

- [Gemini generateContent/JSON mode](https://ai.google.dev/api/generate-content). Uses documented `responseMimeType`/`responseSchema`; current docs mark these deprecated in favor of newer response formats. Kept for the documented generateContent compatibility path; chosen free-tier model must be smoke-tested.
- [Backboard assistants](https://docs.backboard.io/concepts/assistants), [messages](https://docs.backboard.io/concepts/messages), [memory modes](https://docs.backboard.io/sdk/memory).
- [ElevenLabs speech creation](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) and [subscription usage](https://elevenlabs.io/docs/api-reference/user/subscription/get).
- [Tiger columnstore policy](https://www.tigerdata.com/docs/reference/timescaledb/hypercore/add_columnstore_policy).
- [DigitalOcean app spec](https://docs.digitalocean.com/products/app-platform/reference/app-spec/).
