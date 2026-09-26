SELECT create_hypertable('feat.person_term', 'term_start',
  chunk_time_interval => INTERVAL '1 year');
CREATE TABLE app.risk_snapshot (
  ts timestamptz NOT NULL, campus_id text NOT NULL, k_observed integer NOT NULL,
  risk numeric(5,4) NOT NULL CHECK (risk BETWEEN 0 AND 1),
  pattern text, model_version text NOT NULL,
  PRIMARY KEY (campus_id, ts)
);
SELECT create_hypertable('app.risk_snapshot', 'ts', chunk_time_interval => INTERVAL '7 days');
CREATE TABLE app.alarm_event (
  id bigserial, ts timestamptz NOT NULL, campus_id text NOT NULL, pattern text NOT NULL,
  risk numeric(5,4) NOT NULL CHECK (risk BETWEEN 0 AND 1), lead_time_terms numeric(3,1),
  lever text, evidence jsonb NOT NULL, status text NOT NULL DEFAULT 'open',
  PRIMARY KEY (id, ts)
);
SELECT create_hypertable('app.alarm_event', 'ts', chunk_time_interval => INTERVAL '7 days');
CREATE TABLE app.drill_trajectory (
  drill_id uuid NOT NULL, campus_id text NOT NULL, sim integer NOT NULL, term_k integer NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(), credits_cum integer NOT NULL, w_cum integer NOT NULL,
  shock text, cooked boolean NOT NULL,
  PRIMARY KEY (drill_id, sim, term_k, ts)
);
SELECT create_hypertable('app.drill_trajectory', 'ts', chunk_time_interval => INTERVAL '1 day');
-- TimescaleDB >=2.18: columnstore replaces the PDF's legacy compression API.
ALTER TABLE app.drill_trajectory SET (
  timescaledb.enable_columnstore = true,
  timescaledb.segmentby = 'drill_id', timescaledb.orderby = 'ts DESC'
);
CALL add_columnstore_policy('app.drill_trajectory', after => INTERVAL '1 day');
CREATE TABLE app.claim (
  id bigserial PRIMARY KEY, run_id uuid, text text NOT NULL, sql_text text,
  row_ids jsonb, tool_result_id text NOT NULL, verdict text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE app.voice_clip (
  hash text PRIMARY KEY, voice_id text NOT NULL, chars integer NOT NULL,
  mime text NOT NULL DEFAULT 'audio/mpeg', audio bytea NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE app.memory_link (
  campus_id text PRIMARY KEY, backboard_assistant_id text NOT NULL, thread_id text
);
CREATE TABLE app.feedback (
  id bigserial PRIMARY KEY, alarm_id bigint, campus_id text, useful boolean,
  note text, outcome text, created_at timestamptz DEFAULT now()
);
-- app.drill_run is mentioned but has no DDL in the PDF; leave its contract to backend.
