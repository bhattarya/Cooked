# Database compatibility and migration notes

The PDF §6.3 is the starting DDL. The local fallback and CI both pin `timescale/timescaledb:2.18.2-pg17`. The runner prints the installed extension version and rejects versions below 2.18. Tiger's actual installed version cannot be inferred from the website; record it after service creation using the migration runner or `SELECT extversion FROM pg_extension WHERE extname='timescaledb'`.

Changes from the PDF:

- Replaced `timescaledb.compress` with `timescaledb.enable_columnstore`, explicit `segmentby='drill_id'` and `orderby='ts DESC'`.
- Replaced `SELECT add_compression_policy(...)` with `CALL add_columnstore_policy(..., after => INTERVAL '1 day')` (2.18+).
- Kept `create_hypertable` with explicit partition columns/chunk intervals for compatibility with the pinned release, rather than newer automatic `CREATE TABLE WITH (tsdb.hypertable)` behavior.
- Continuous aggregate starts `WITH NO DATA`; its refresh policy follows the PDF. Explicit `materialized_only=false` includes recent rows before the next materialization. Historical data outside the 30-day policy needs manual refresh.
- Fixed `v.student_state` to count the joined non-null campus ID, so a person without completed terms has zero terms; withdrawal total coalesces to zero.
- Added typed source views and an owner-only refresh function to allow repeated, atomic loads. No extra product tables. `app.drill_run` has no defined DDL in the PDF and is deferred to backend agreement.
- Added current-population label constraints, risk bounds, roles, and migration metadata. No foreign keys into hypertables.

Source references checked during implementation:

- [Columnstore policy](https://www.tigerdata.com/docs/reference/timescaledb/hypercore/add_columnstore_policy)
- [Columnstore ALTER TABLE](https://www.tigerdata.com/docs/reference/timescaledb/hypercore/alter_table)
- [Continuous aggregate refresh policy](https://www.tigerdata.com/docs/api/latest/continuous-aggregates/add_continuous_aggregate_policy/)
- [Dataset field definitions](https://github.com/jasonpaluck/hackumbc-2026/tree/41398972ce9ce8c6756159207b00386a75ed5be5/data)

Cloud roles/privileges, compression behavior and continuous aggregate syntax remain unverified on your Tiger service until `make migrate`, `make load`, `make test`, and the Tiger smoke test pass there. Do not claim a compression ratio or simulated row scale; no simulations are generated in Phase 1.
