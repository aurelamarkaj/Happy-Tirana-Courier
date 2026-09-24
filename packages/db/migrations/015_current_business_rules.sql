-- Evolve the existing live schema without resetting orders, riders or zones.
ALTER TABLE rider_profiles DROP CONSTRAINT rider_debit_limit_max;
ALTER TABLE rider_profiles ALTER COLUMN debit_limit_all SET DEFAULT 5000;
UPDATE rider_profiles SET debit_limit_all=5000 WHERE debit_limit_all=60;
ALTER TABLE rider_profiles ADD CONSTRAINT rider_debit_limit_max CHECK (debit_limit_all BETWEEN 0 AND 5000);
UPDATE rider_profiles SET vehicle_type='ELECTRIC' WHERE vehicle_type='MOTOR';
ALTER TABLE rider_profiles ALTER COLUMN vehicle_type SET DEFAULT 'ELECTRIC';
ALTER TABLE rider_profiles ADD COLUMN personal_id text;
ALTER TABLE rider_profiles ADD COLUMN account_balance_all numeric(10,2) NOT NULL DEFAULT 0 CHECK (account_balance_all>=0);
UPDATE rider_profiles rp SET account_balance_all=COALESCE((
  SELECT SUM(le.amount) FROM ledger_entries le
  WHERE le.rider_id=rp.id AND le.direction='RIDER_EARNS' AND le.status='OPEN'
),0);
ALTER TABLE orders DROP CONSTRAINT orders_product_value_check;
ALTER TABLE orders DROP CONSTRAINT orders_total_amount_check;
-- Rounded tariff boundary around the existing ring, covering Mëzez-Fushë,
-- Kodër e Kuqe, Tufinë and Farkë. The delivery coverage polygon is untouched.
INSERT INTO zones(name,city,transport_fee,polygon,active,is_surcharge_area,surcharge_fee)
SELECT 'Zona pa shtesë - Tirana', 'Tirana', 300,
  ST_Buffer(ST_SetSRID(ST_MakePoint(19.825,41.325),4326)::geography, 6600)::geometry,
  true,true,100
WHERE NOT EXISTS (SELECT 1 FROM zones WHERE name='Zona pa shtesë - Tirana');
CREATE OR REPLACE FUNCTION accept_order_atomic(p_order_id uuid, p_rider_id uuid)
RETURNS orders
LANGUAGE plpgsql
AS $$
DECLARE
  locked_order orders%ROWTYPE;
BEGIN
  IF (clock_timestamp() AT TIME ZONE 'Europe/Tirane')::time < '07:00'
     OR (clock_timestamp() AT TIME ZONE 'Europe/Tirane')::time >= '23:00' THEN
    RAISE EXCEPTION 'ORDERING_CLOSED';
  END IF;
  PERFORM id FROM rider_profiles WHERE id = p_rider_id FOR UPDATE;
  IF (SELECT count(*) FROM orders WHERE assigned_rider_id = p_rider_id AND status IN ('ACCEPTED','PICKED_UP')) >= 2 THEN
    RAISE EXCEPTION 'RIDER_ORDER_CAPACITY_REACHED';
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE assigned_rider_id = p_rider_id AND status = 'ACCEPTED') THEN
    RAISE EXCEPTION 'SECOND_ORDER_REQUIRES_PICKUP';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM rider_profiles rp JOIN users u ON u.id=rp.user_id
    WHERE rp.id=p_rider_id AND rp.is_online AND rp.status='ACTIVE' AND u.status='ACTIVE'
      AND (SELECT COALESCE(sum(amount),0) FROM ledger_entries WHERE rider_id=rp.id
        AND direction='RIDER_OWES_PLATFORM' AND status='OPEN') < LEAST(5000,rp.debit_limit_all)
  ) THEN RAISE EXCEPTION 'RIDER_NOT_ELIGIBLE'; END IF;
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

  IF NOT EXISTS (SELECT 1 FROM rider_profiles WHERE id=p_rider_id AND
    (vehicle_type='ELECTRIC' OR (vehicle_type='DIESEL' AND locked_order.route_distance_meters>3000)))
  THEN RAISE EXCEPTION 'RIDER_VEHICLE_NOT_ELIGIBLE'; END IF;

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

  UPDATE notifications SET status = 'CLOSED'
  WHERE order_id=p_order_id AND type IN ('ORDER_OFFERED_NEARBY_1KM','ORDER_OFFERED_ALL');

  INSERT INTO order_status_history (order_id, to_status, note)
  VALUES (p_order_id, 'ACCEPTED', 'First-accept-wins atomic lock');

  RETURN locked_order;
END;
$$;
