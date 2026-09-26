-- Profiles built from uploaded degree audits. Only the parsed courses and terms are kept,
-- never the uploaded file. Ids are random (USR-...), not derived from the person.
CREATE TABLE app.user_profile (
  id text PRIMARY KEY CHECK (id ~ '^USR-[0-9a-f]{10}$'),
  display_name text,
  source text NOT NULL CHECK (source IN ('gemini', 'sample', 'dataset')),
  profile jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
