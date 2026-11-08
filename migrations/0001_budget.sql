CREATE TABLE IF NOT EXISTS budget (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  document TEXT NOT NULL,
  last_operation TEXT
);
CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  action_hash TEXT NOT NULL,
  revision INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS budget_chunks (
  revision INTEGER NOT NULL,
  part INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (revision, part)
);
