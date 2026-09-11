CREATE TABLE IF NOT EXISTS customer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  email text UNIQUE,
  password_hash text NOT NULL,
  default_address text NOT NULL,
  default_lat numeric(9, 6),
  default_lng numeric(9, 6),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_account_id uuid NOT NULL UNIQUE REFERENCES customer_accounts(id) ON DELETE CASCADE,
  business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES customer_carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id)
);

CREATE INDEX IF NOT EXISTS customer_accounts_phone_idx ON customer_accounts (phone);
CREATE INDEX IF NOT EXISTS customer_cart_items_cart_idx ON customer_cart_items (cart_id);

INSERT INTO zones (id, name, city, transport_fee, polygon, active)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Tirana Qender',
  'Tirana',
  250,
  ST_SetSRID(ST_GeomFromText('POLYGON((19.7800 41.3000, 19.8600 41.3000, 19.8600 41.3550, 19.7800 41.3550, 19.7800 41.3000))'), 4326),
  true
)
ON CONFLICT (id) DO NOTHING;

-- Businesses and products are created by administrators; no demo catalog is seeded.
