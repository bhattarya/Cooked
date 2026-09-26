CREATE MATERIALIZED VIEW app.alarms_by_day_pattern
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 day', ts) AS day, pattern, count(*) AS n, avg(risk) AS avg_risk
FROM app.alarm_event GROUP BY 1, 2
WITH NO DATA;
SELECT add_continuous_aggregate_policy('app.alarms_by_day_pattern',
  start_offset => INTERVAL '30 days', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '5 minutes');
