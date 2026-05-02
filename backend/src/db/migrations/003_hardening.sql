-- Step 1 Hardening: zusätzliche Indexe
-- app_user(username) ist bereits UNIQUE COLLATE NOCASE → Index existiert.
CREATE INDEX IF NOT EXISTS idx_audit_action_at ON audit_log(action, at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, at);
CREATE INDEX IF NOT EXISTS idx_lockout_locked_until ON auth_lockout(locked_until);
