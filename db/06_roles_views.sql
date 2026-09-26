-- View-owner permissions deliberately expose ONLY these allowlisted projections.
CREATE VIEW v.student_state AS
SELECT s.campus_id, s.major, s.track, s.entry_type, s.residency, s.work_hours,
  count(pt.campus_id) AS terms_done, avg(pt.credits_attempted) AS avg_credits,
  coalesce(sum(pt.w_count), 0) AS w_total
FROM feat.person_static s LEFT JOIN feat.person_term pt USING (campus_id)
GROUP BY s.campus_id;
CREATE VIEW v.alarms_by_day_pattern AS SELECT * FROM app.alarms_by_day_pattern;

REVOKE ALL ON SCHEMA raw, feat, app, v FROM PUBLIC, app_rw, agent_ro;
REVOKE ALL ON ALL TABLES IN SCHEMA raw, feat, app, v FROM PUBLIC, app_rw, agent_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA raw, feat, app, v FROM PUBLIC, app_rw, agent_ro;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA raw, feat, app, v FROM PUBLIC, app_rw, agent_ro;
GRANT USAGE ON SCHEMA feat, app, v TO app_rw;
GRANT SELECT ON ALL TABLES IN SCHEMA feat, v TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO app_rw;
GRANT USAGE ON SCHEMA v TO agent_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA v TO agent_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE owner IN SCHEMA raw, feat, app, v
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE owner IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE owner IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO app_rw;
-- Future agent views require an explicit review and GRANT (no automatic exposure).
