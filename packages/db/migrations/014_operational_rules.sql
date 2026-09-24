-- Preserve orders, credentials and all zone geometries.
ALTER TABLE rider_profiles ALTER COLUMN debit_limit_all SET DEFAULT 60;
UPDATE rider_profiles SET debit_limit_all = LEAST(60, GREATEST(0.01, debit_limit_all));
ALTER TABLE rider_profiles ADD CONSTRAINT rider_debit_limit_max CHECK (debit_limit_all > 0 AND debit_limit_all <= 60);
UPDATE rider_profiles SET vehicle_type='MOTOR' WHERE vehicle_type='MOTORBIKE';
ALTER TABLE rider_profiles ALTER COLUMN vehicle_type SET DEFAULT 'MOTOR';
ALTER TABLE orders ADD COLUMN initial_offer_rider_id uuid REFERENCES rider_profiles(id);
ALTER TABLE orders ALTER COLUMN ready_minutes DROP DEFAULT;

-- Financial snapshots become immutable after creation, including legacy orders.
CREATE FUNCTION protect_order_finance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.product_value, NEW.transport_fee, NEW.calculated_transport_fee,
         NEW.transport_fee_overridden, NEW.route_distance_meters, NEW.ring_surcharge_fee,
         NEW.total_amount, NEW.rider_earning, NEW.platform_commission, NEW.zone_id, NEW.delivery_address_id)
     IS DISTINCT FROM
     ROW(OLD.product_value, OLD.transport_fee, OLD.calculated_transport_fee,
         OLD.transport_fee_overridden, OLD.route_distance_meters, OLD.ring_surcharge_fee,
         OLD.total_amount, OLD.rider_earning, OLD.platform_commission, OLD.zone_id, OLD.delivery_address_id)
  THEN RAISE EXCEPTION 'ORDER_FINANCE_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_finance_immutable BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION protect_order_finance();

CREATE OR REPLACE FUNCTION accept_order_atomic(p_order_id uuid, p_rider_id uuid)
RETURNS orders
LANGUAGE plpgsql
AS $$
DECLARE
  locked_order orders%ROWTYPE;
BEGIN
  IF extract(isodow FROM clock_timestamp() AT TIME ZONE 'Europe/Tirane') = 7
     OR (clock_timestamp() AT TIME ZONE 'Europe/Tirane')::time < '07:00'
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
        AND direction='RIDER_OWES_PLATFORM' AND status='OPEN') < LEAST(60,rp.debit_limit_all)
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
    (vehicle_type='MOTOR' OR (vehicle_type='DIESEL' AND locked_order.route_distance_meters>3000)))
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
