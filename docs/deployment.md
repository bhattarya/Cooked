# DigitalOcean App Platform

The checked-in `.do/app.yaml` defines the API, the Next.js web app and the Watchtower worker from **bhattarya/Cooked, main** in NYC. Import it once after the foundation PR is merged. Empty secret values are intentional: populate them in the dashboard before the first real deployment. Do not re-import an empty spec over configured secrets.

1. Claim/verify MLH credit, create project `cooked`, and authorize DigitalOcean's GitHub integration for the repo.
2. Create an App Platform app using the spec (or equivalent dashboard settings). Confirm current instance sizes/pricing; these are paid components even when credits cover usage. The worker is a real continuously running component, not a cron placeholder.
3. API uses root build context with `api/Dockerfile`, port 8080, health path `/healthz`. Worker uses the same image but runs `python -m worker.watchtower`. Web uses source directory `web`, Node 22+, `npm ci && npm run build`, and `npm start -- --port 8080`.
4. In API environment settings, mark DB app/agent URLs and provider keys as **encrypted runtime secrets**. Set provider model/voice IDs as ordinary config. The worker needs only `DATABASE_URL_APP` (it scores students and writes alarms; no provider keys). Never deploy owner credentials or `DO_TOKEN` to application components.
5. Web needs encrypted runtime secrets `AUTH_SECRET` (a fresh random 64-hex value, not your local one), `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`; `AUTH_URL=${APP_URL}` is already set. Add `https://<app>/auth/callback/google` to the Google OAuth client's redirect URIs. The web app's sign-in routes live under `/auth` because the ingress sends `/api` to FastAPI. Without the Google values the landing page offers guest sign-in. Web's `NEXT_PUBLIC_API_URL=${APP_URL}/api` must be available at build time. It is public configuration, not a secret. Ingress strips `/api` before forwarding to FastAPI. The API's CORS origin is `${APP_URL}`. Save the resolved app URL in `SETUP_STATUS.md`.
6. Migrate and load Tiger from your local venv with owner credentials; run all DB tests against that service before deploying. API stays unhealthy (503) if it cannot query the cache table through `app_rw`.
7. Confirm the first main commit's CI is green, then deploy through the dashboard. Inspect all three components. Run both deployed smoke scripts and open `https://<app>/` and `https://<app>/api/healthz` on a phone using cellular data.
8. Record actual URLs, version, limits, smoke results, credit expiry and any provider errors in `SETUP_STATUS.md`.

## CI gating

Direct push auto-deploy is **disabled** in the app spec because it can race GitHub tests. Protect `main` with required PR checks before enabling deployments. In GitHub's `demo` environment add secret `DO_TOKEN` with the app permissions required by the [deployment endpoint](https://docs.digitalocean.com/reference/api/reference/apps/). Add repository variable `DO_APP_ID` and set `DO_DEPLOY_ENABLED=true`. API/CLI automation requires this token even though dashboard App Platform setup does not.

The deploy job needs all three checks, runs only on pushes to `main`, serializes deployment triggers, and skips superseded commit SHAs. It posts to the existing app without replacing secrets. The provider builds latest `main`, so required branch protection and no untested direct pushes are essential. A queued deployment is not proof it became healthy; inspect App Platform and run smoke tests afterward. If you do not want a token, leave automated deployment disabled and deploy each green main manually.

OpenAPI is committed at `docs/openapi.json`, exposed at API `/openapi.json` (deployed `/api/openapi.json`), and uploaded by CI. `API_ROOT_PATH=/api` in the app spec makes the deployed Swagger UI use the ingress prefix; leave it empty locally. The checked-in file is the frontend contract.

References: [App specification](https://docs.digitalocean.com/products/app-platform/reference/app-spec/), [GitHub Actions deployment](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-github-actions/), [deployment API](https://docs.digitalocean.com/reference/api/reference/apps/).
