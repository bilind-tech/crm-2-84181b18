-- Step 16: Recovery-Code für den Single-User.
ALTER TABLE app_user ADD COLUMN recovery_hash TEXT;
ALTER TABLE app_user ADD COLUMN recovery_used_at TEXT;
