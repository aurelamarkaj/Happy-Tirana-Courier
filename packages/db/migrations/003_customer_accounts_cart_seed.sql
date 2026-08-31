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

INSERT INTO businesses (id, name, legal_name, phone, email, address_text, lat, lng, status, category, rating, eta_minutes, cover_image_url, accepts_customer_orders)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Pasta e Shtepise', 'Pasta e Shtepise sh.p.k.', '+355690000001', 'pasta@example.local', 'Bllok, Tirane', 41.319800, 19.817200, 'ACTIVE', 'FOOD', 4.8, 30, '/catalog/business-pasta.webp', true),
  ('10000000-0000-4000-8000-000000000002', 'Market Komuna', 'Market Komuna sh.p.k.', '+355690000002', 'market@example.local', 'Komuna e Parisit, Tirane', 41.314700, 19.807400, 'ACTIVE', 'MARKET', 4.6, 25, '/catalog/business-market.webp', true),
  ('10000000-0000-4000-8000-000000000003', 'Farmaci 24', 'Farmaci 24 sh.p.k.', '+355690000003', 'farmaci@example.local', 'Qender, Tirane', 41.327500, 19.807800, 'ACTIVE', 'PHARMACY', 4.9, 20, '/catalog/business-pharmacy.webp', true),
  ('10000000-0000-4000-8000-000000000004', 'Dokument Express', 'Dokument Express sh.p.k.', '+355690000004', 'docs@example.local', 'Tirana', 41.330100, 19.823400, 'ACTIVE', 'DOCUMENTS', 4.7, 40, '/catalog/business-documents.webp', true)
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  rating = EXCLUDED.rating,
  eta_minutes = EXCLUDED.eta_minutes,
  cover_image_url = EXCLUDED.cover_image_url,
  accepts_customer_orders = true;

INSERT INTO product_categories (id, business_id, name, sort_order, active)
VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Te preferuarat', 1, true),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Pako marketi', 1, true),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Kujdes ditor', 1, true),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'Sherbime', 1, true)
ON CONFLICT (business_id, name) DO NOTHING;

INSERT INTO products (id, business_id, category_id, name, description, price, image_url, is_available, sort_order)
VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Penne arrabbiata', 'Salce domate, djeges i lehte, borzilok', 620, '/catalog/product-penne.webp', true, 1),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Chicken wrap', 'Tortilla, pule, sallate, salce kosi', 540, '/catalog/product-wrap.webp', true, 2),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Pako familjare', 'Uje, buke, fruta, produkte baze', 1450, '/catalog/product-grocery-basket.webp', true, 1),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Kafe dhe snacks', 'Kafe, biskota, cokollata, leng', 890, '/catalog/product-office-snacks.webp', true, 2),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'Kujdes ditor', 'Vitamin C, termometer, peceta dhe produkte higjiene', 1180, '/catalog/product-daily-care.webp', true, 1),
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'Marrje dokumenti', 'Kurier per dokumente brenda Tiranes', 300, '/catalog/product-document-envelope.webp', true, 1)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  image_url = EXCLUDED.image_url,
  is_available = true;
