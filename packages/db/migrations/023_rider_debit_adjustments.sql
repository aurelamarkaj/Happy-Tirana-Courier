CREATE TABLE rider_debit_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES rider_profiles(id),
  admin_id uuid NOT NULL REFERENCES users(id),
  previous_amount numeric(10,2) NOT NULL,
  new_amount numeric(10,2) NOT NULL CHECK(new_amount>=0 AND new_amount<=previous_amount),
  created_at timestamptz NOT NULL DEFAULT now()
);
