CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ADMIN', 'OPERATOR', 'BUSINESS', 'RIDER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE business_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rider_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'DELIVERED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE offer_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE settlement_status AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE,
  phone text UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  status user_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_contact_required CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  phone text NOT NULL,
  email text,
  address_text text NOT NULL,
  lat numeric(9, 6),
  lng numeric(9, 6),
  status business_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position text,
  is_primary boolean NOT NULL DEFAULT false,
  UNIQUE (business_id, user_id)
);

CREATE TABLE IF NOT EXISTS rider_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type text NOT NULL DEFAULT 'MOTORBIKE',
  license_number text,
  is_online boolean NOT NULL DEFAULT false,
  status rider_status NOT NULL DEFAULT 'ACTIVE',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL DEFAULT 'Tirana',
  transport_fee numeric(10, 2) NOT NULL CHECK (transport_fee >= 0),
  polygon geometry(Polygon, 4326) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zones_polygon_valid CHECK (ST_IsValid(polygon))
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  label text,
  address_text text NOT NULL,
  lat numeric(9, 6) NOT NULL,
  lng numeric(9, 6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  business_id uuid NOT NULL REFERENCES businesses(id),
  customer_id uuid REFERENCES customers(id),
  delivery_address_id uuid NOT NULL REFERENCES addresses(id),
  zone_id uuid NOT NULL REFERENCES zones(id),
  assigned_rider_id uuid REFERENCES rider_profiles(id),
  product_description text NOT NULL,
  product_value numeric(10, 2) NOT NULL CHECK (product_value >= 0),
  transport_fee numeric(10, 2) NOT NULL CHECK (transport_fee >= 0),
  total_amount numeric(10, 2) NOT NULL CHECK (total_amount >= 0),
  platform_commission numeric(10, 2) NOT NULL CHECK (platform_commission >= 0),
  rider_earning numeric(10, 2) NOT NULL CHECK (rider_earning >= 0),
  status order_status NOT NULL DEFAULT 'CREATED',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  CONSTRAINT orders_finance_math CHECK (
    total_amount = product_value + transport_fee
    AND platform_commission = round(transport_fee * 0.20, 2)
    AND rider_earning = transport_fee - round(transport_fee * 0.20, 2)
  )
);

CREATE TABLE IF NOT EXISTS order_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES rider_profiles(id) ON DELETE CASCADE,
  status offer_status NOT NULL DEFAULT 'PENDING',
  sent_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL,
  UNIQUE (order_id, rider_id)
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  changed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  from_status order_status,
  to_status order_status NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rider_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES rider_profiles(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  point geography(Point, 4326) NOT NULL,
  lat numeric(9, 6) NOT NULL,
  lng numeric(9, 6) NOT NULL,
  speed numeric(8, 2),
  heading numeric(8, 2),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  type text NOT NULL,
  channel text NOT NULL DEFAULT 'SOCKET',
  status text NOT NULL DEFAULT 'PENDING',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  read_at timestamptz
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  rider_id uuid REFERENCES rider_profiles(id) ON DELETE SET NULL,
  business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
  entry_type text NOT NULL,
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  direction text NOT NULL CHECK (direction IN ('RIDER_OWES_PLATFORM', 'RIDER_EARNS', 'BUSINESS_RECEIVES')),
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES rider_profiles(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_transport_fee numeric(10, 2) NOT NULL DEFAULT 0,
  platform_due numeric(10, 2) NOT NULL DEFAULT 0,
  rider_gross_earning numeric(10, 2) NOT NULL DEFAULT 0,
  status settlement_status NOT NULL DEFAULT 'DRAFT',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlements_period_valid CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  transport_fee numeric(10, 2) NOT NULL,
  platform_commission numeric(10, 2) NOT NULL,
  rider_earning numeric(10, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS zones_polygon_gix ON zones USING gist (polygon);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_business_created_idx ON orders (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_rider_created_idx ON orders (assigned_rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_offers_rider_status_idx ON order_offers (rider_id, status, expires_at);
CREATE INDEX IF NOT EXISTS rider_locations_rider_recorded_idx ON rider_locations (rider_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS rider_locations_order_recorded_idx ON rider_locations (order_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS rider_locations_point_gix ON rider_locations USING gist (point);

CREATE OR REPLACE FUNCTION resolve_zone_for_point(p_lat numeric, p_lng numeric)
RETURNS TABLE (
  zone_id uuid,
  zone_name text,
  transport_fee numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT z.id, z.name, z.transport_fee
  FROM zones z
  WHERE z.active = true
    AND ST_Contains(z.polygon, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  ORDER BY z.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION accept_order_atomic(p_order_id uuid, p_rider_id uuid)
RETURNS orders
LANGUAGE plpgsql
AS $$
DECLARE
  locked_order orders%ROWTYPE;
BEGIN
  SELECT *
    INTO locked_order
    FROM orders
    WHERE id = p_order_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF locked_order.status <> 'OFFERED' OR locked_order.assigned_rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER_ALREADY_TAKEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM order_offers
    WHERE order_id = p_order_id
      AND rider_id = p_rider_id
      AND status = 'PENDING'
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'OFFER_NOT_AVAILABLE';
  END IF;

  UPDATE orders
    SET assigned_rider_id = p_rider_id,
        status = 'ACCEPTED',
        accepted_at = now(),
        version = version + 1
    WHERE id = p_order_id
    RETURNING * INTO locked_order;

  UPDATE order_offers
    SET status = 'ACCEPTED',
        responded_at = now()
    WHERE order_id = p_order_id
      AND rider_id = p_rider_id;

  UPDATE order_offers
    SET status = 'CANCELLED',
        responded_at = now()
    WHERE order_id = p_order_id
      AND rider_id <> p_rider_id
      AND status = 'PENDING';

  INSERT INTO order_status_history (order_id, to_status, note)
  VALUES (p_order_id, 'ACCEPTED', 'First-accept-wins atomic lock');

  RETURN locked_order;
END;
$$;
