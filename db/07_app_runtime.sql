-- Runtime tables the PDF names without DDL (§6.3 / handoff): drill runs, LLM cache, memory fallback.
CREATE TABLE app.drill_run (
  drill_id uuid PRIMARY KEY,
  campus_id text NOT NULL,
  plan_load numeric(4,1) NOT NULL,
  work_hours integer NOT NULL,
  sims integer NOT NULL,
  model_version text NOT NULL,
  report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Every LLM output is cached by a hash of (prompt template version, tool results) so the demo
-- path replays without network (§5.4 "everything replayable").
CREATE TABLE app.llm_cache (
  hash text PRIMARY KEY,
  kind text NOT NULL,
  model text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Local memory fallback when Backboard is not configured (§10.4).
CREATE TABLE app.memory_note (
  id bigserial PRIMARY KEY,
  campus_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('decision', 'feedback', 'constraint', 'outcome')),
  note text NOT NULL CHECK (length(note) <= 280),
  backboard_synced boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX memory_note_campus ON app.memory_note (campus_id, created_at DESC);

-- Daily risk picture by pattern, fed by the Watchtower's snapshots.
CREATE MATERIALIZED VIEW app.risk_by_day_pattern
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 day', ts) AS day, pattern, count(*) AS n,
  avg(risk) AS avg_risk, count(*) FILTER (WHERE risk >= 0.35) AS at_risk
FROM app.risk_snapshot GROUP BY 1, 2
WITH NO DATA;
SELECT add_continuous_aggregate_policy('app.risk_by_day_pattern',
  start_offset => INTERVAL '30 days', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '5 minutes');

-- Latest risk per student, exposed read-only to agents.
CREATE VIEW v.risk_latest AS
SELECT DISTINCT ON (campus_id) campus_id, ts, k_observed, risk, pattern, model_version
FROM app.risk_snapshot ORDER BY campus_id, ts DESC;

GRANT SELECT ON v.risk_latest TO app_rw, agent_ro;
GRANT SELECT ON app.risk_by_day_pattern TO app_rw;
