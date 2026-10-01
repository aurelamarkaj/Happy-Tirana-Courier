-- Immediate nearby offers; general offers remain available until handled.
ALTER TABLE orders ADD COLUMN last_dispatch_checked_at timestamptz;
CREATE INDEX orders_dispatch_refresh_idx ON orders(last_dispatch_checked_at)
 WHERE status='OFFERED' AND assigned_rider_id IS NULL;
UPDATE orders SET offer_after=LEAST(offer_after,now()) WHERE status='CREATED';
UPDATE order_offers oo SET status='PENDING', expires_at='infinity'::timestamptz
FROM orders o WHERE o.id=oo.order_id AND o.status='OFFERED'
 AND o.assigned_rider_id IS NULL AND o.escalated_at IS NOT NULL
 AND oo.status IN ('PENDING','EXPIRED');
UPDATE notifications n SET status='PENDING',sent_at=NULL
FROM orders o WHERE o.id=n.order_id AND o.status='OFFERED'
 AND o.assigned_rider_id IS NULL AND o.escalated_at IS NOT NULL
 AND n.type LIKE 'ORDER_OFFERED_%'
 AND EXISTS(SELECT 1 FROM order_offers oo JOIN rider_profiles rp ON rp.id=oo.rider_id
 WHERE oo.order_id=o.id AND rp.user_id=n.user_id AND oo.status='PENDING');

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
