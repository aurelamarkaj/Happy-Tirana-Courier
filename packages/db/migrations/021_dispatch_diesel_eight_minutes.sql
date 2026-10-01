-- Apply the new schedule only to orders that have not been offered yet.
UPDATE orders SET offer_after=created_at+interval '8 minutes' WHERE status='CREATED';
-- Remove incompatible pending offers; already accepted deliveries remain intact.
UPDATE order_offers oo SET status='CANCELLED',responded_at=now()
FROM orders o,rider_profiles rp WHERE oo.order_id=o.id AND oo.rider_id=rp.id
 AND oo.status='PENDING' AND o.assigned_rider_id IS NULL
 AND o.route_distance_meters>3000 AND rp.vehicle_type<>'DIESEL';
UPDATE notifications n SET status='CLOSED'
FROM orders o,rider_profiles rp WHERE n.order_id=o.id AND n.user_id=rp.user_id
 AND n.type LIKE 'ORDER_OFFERED_%' AND n.status IN ('PENDING','SENT')
 AND o.assigned_rider_id IS NULL AND o.route_distance_meters>3000 AND rp.vehicle_type<>'DIESEL';

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

  IF locked_order.route_distance_meters > 3000 AND
     (SELECT vehicle_type FROM rider_profiles WHERE id=p_rider_id) <> 'DIESEL' THEN
    RAISE EXCEPTION 'RIDER_VEHICLE_NOT_ELIGIBLE';
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

  UPDATE notifications SET status = 'CLOSED'
  WHERE order_id=p_order_id AND type IN ('ORDER_OFFERED_NEARBY_1KM','ORDER_OFFERED_ALL');

  INSERT INTO order_status_history (order_id, to_status, note)
  VALUES (p_order_id, 'ACCEPTED', 'First-accept-wins atomic lock');

  RETURN locked_order;
END;
$$;
