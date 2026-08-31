ALTER TABLE customer_carts
  ALTER COLUMN customer_account_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS guest_token text UNIQUE;

DO $$
BEGIN
  ALTER TABLE customer_carts
    ADD CONSTRAINT customer_carts_owner_check
    CHECK (customer_account_id IS NOT NULL OR guest_token IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS customer_carts_guest_token_idx ON customer_carts (guest_token);
