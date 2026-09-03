ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS is_surcharge_area boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS surcharge_fee numeric(10, 2) NOT NULL DEFAULT 100;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ready_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS offer_after timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS initial_offer_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS unassigned_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS route_distance_meters integer,
  ADD COLUMN IF NOT EXISTS route_distance_source text NOT NULL DEFAULT 'LOCAL_ESTIMATE',
  ADD COLUMN IF NOT EXISTS route_preference text NOT NULL DEFAULT 'SHORTEST_ROAD_IGNORE_TRAFFIC',
  ADD COLUMN IF NOT EXISTS google_maps_url text,
  ADD COLUMN IF NOT EXISTS calculated_transport_fee numeric(10, 2),
  ADD COLUMN IF NOT EXISTS transport_fee_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ring_surcharge_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ring_surcharge_fee numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offer_scope text NOT NULL DEFAULT 'PENDING';

ALTER TABLE rider_profiles
  ADD COLUMN IF NOT EXISTS debit_limit_all numeric(10, 2) NOT NULL DEFAULT 10000;

CREATE INDEX IF NOT EXISTS orders_offer_after_idx
  ON orders (status, offer_after, initial_offer_sent_at, escalated_at);

CREATE INDEX IF NOT EXISTS orders_unassigned_alert_idx
  ON orders (status, created_at, unassigned_alerted_at);

CREATE INDEX IF NOT EXISTS zones_surcharge_area_idx
  ON zones (is_surcharge_area, active);

CREATE INDEX IF NOT EXISTS notifications_type_status_idx
  ON notifications (type, status);

CREATE OR REPLACE FUNCTION resolve_zone_for_point(lat double precision, lng double precision)
RETURNS TABLE(zone_id uuid, zone_name text, transport_fee numeric) AS $$
  SELECT z.id, z.name, z.transport_fee
  FROM zones z
  WHERE z.active = true
    AND z.is_surcharge_area = false
    AND ST_Contains(z.polygon, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
  ORDER BY z.created_at ASC
  LIMIT 1;
$$ LANGUAGE sql STABLE;
