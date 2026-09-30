-- Keep orders, settlements and ledger entries after an account is removed
-- from the operational admin lists.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
