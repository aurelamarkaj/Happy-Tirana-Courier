DO $$ BEGIN
  CREATE TYPE business_category AS ENUM ('FOOD', 'MARKET', 'PHARMACY', 'DOCUMENTS', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS category business_category NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS rating numeric(2, 1) CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  ADD COLUMN IF NOT EXISTS eta_minutes integer CHECK (eta_minutes IS NULL OR eta_minutes > 0),
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS accepts_customer_orders boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  price numeric(10, 2) NOT NULL CHECK (price >= 0),
  image_url text,
  is_available boolean NOT NULL DEFAULT true,
  prep_time_minutes integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  unit_price numeric(10, 2) NOT NULL CHECK (unit_price >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total numeric(10, 2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_total_math CHECK (line_total = unit_price * quantity)
);

CREATE INDEX IF NOT EXISTS businesses_customer_catalog_idx ON businesses (accepts_customer_orders, status, category);
CREATE INDEX IF NOT EXISTS product_categories_business_idx ON product_categories (business_id, sort_order);
CREATE INDEX IF NOT EXISTS products_business_available_idx ON products (business_id, is_available, sort_order);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);
