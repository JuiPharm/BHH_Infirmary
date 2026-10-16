-- Sandbox only. Never migrate this one-shot test table to Production.
CREATE TABLE IF NOT EXISTS uat_one_shot_gate (
  test_id TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('SUBMITTING','COMMITTED','NEEDS_REVIEW')),
  expected_lot_id TEXT NOT NULL,
  before_qty INTEGER NOT NULL CHECK(before_qty>=0),
  after_qty INTEGER,
  transaction_id TEXT NOT NULL UNIQUE,
  visit_id TEXT,
  attempted_by TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  completed_at TEXT,
  reason_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_uat_one_shot_state ON uat_one_shot_gate(state);
