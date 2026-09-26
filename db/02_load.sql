-- COPY is client-side in scripts/load.py; server cannot access laptop CSV paths.
-- This manifest records only hashes/counts, never credentials or local paths.
CREATE TABLE raw.load_manifest (
  table_name text PRIMARY KEY,
  dataset_commit text NOT NULL,
  sha256 text NOT NULL,
  row_count integer NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
