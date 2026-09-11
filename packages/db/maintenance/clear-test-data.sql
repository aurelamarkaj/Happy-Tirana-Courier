-- Manual cleanup of the known development dataset. Never run as a migration.
-- Aborts if any business or non-admin user is not from the reviewed test dataset.
\set ON_ERROR_STOP on
BEGIN;
LOCK TABLE users, businesses, orders, customers, customer_accounts,
  rider_profiles, notifications, ledger_entries, settlements IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE reviewed_test_businesses (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO reviewed_test_businesses
SELECT ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
FROM generate_series(1, 14) AS n;
INSERT INTO reviewed_test_businesses VALUES
  ('9df92c43-74e3-4216-bf60-49a5275c5f33'),
  ('1980d4a4-61d0-4453-91d4-76d06169d30a'),
  ('43e1d848-145d-4dab-8629-6fd2b6f05cce');

CREATE TEMP TABLE reviewed_test_users (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO reviewed_test_users VALUES
  ('42000000-0000-4000-8000-000000000001'),
  ('f7ec7ea8-b2da-439a-831c-c97a49ab53bd'),
  ('fbdab6a4-1416-4804-967e-8c29bbf438f0'),
  ('ba8bf9a0-3849-43d0-9cb7-c995aaecf629'),
  ('40000000-0000-4000-8000-000000000001'),
  ('44164ae7-4d90-47bd-b5a7-91f1e6c4ab9f'),
  ('90000000-0000-4000-8000-000000000901'),
  ('90000000-0000-4000-8000-000000000913'),
  ('aa6e279d-c1ce-4af6-b00e-66bceb250f06'),
  ('581eb7d6-c0dd-4e0a-8b3e-85f27972c518'),
  ('90000000-0000-4000-8000-000000000911');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM businesses WHERE id NOT IN (SELECT id FROM reviewed_test_businesses))
     OR EXISTS (SELECT 1 FROM users WHERE role::text NOT IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
                AND id NOT IN (SELECT id FROM reviewed_test_users)) THEN
    RAISE EXCEPTION 'Unreviewed accounts found; refusing test dataset cleanup';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE role::text IN ('SUPERADMIN', 'ADMIN') AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'An active administrator is required before cleanup';
  END IF;
END $$;

CREATE TEMP TABLE test_orders ON COMMIT DROP AS
  SELECT id, customer_id, delivery_address_id FROM orders
  WHERE business_id IN (SELECT id FROM reviewed_test_businesses);
CREATE TEMP TABLE test_riders ON COMMIT DROP AS
  SELECT id FROM rider_profiles WHERE user_id IN (SELECT id FROM reviewed_test_users);
CREATE TEMP TABLE test_customers (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO test_customers SELECT customer_id FROM test_orders WHERE customer_id IS NOT NULL
  ON CONFLICT DO NOTHING;
-- Reviewed orphan test registrations that have no order.
INSERT INTO test_customers VALUES
  ('6ba05258-6758-4127-b735-a8e5b11eaa77'),
  ('55875fe5-5ebe-4e32-b67d-d8d10bf8c817'),
  ('2470b9d1-8394-412e-8245-dfa838bdd4a2'),
  ('51a50ea6-4eed-43b1-a69b-247deef771bb'),
  ('3239c6d2-0548-4b74-b32a-142c0da79329'),
  ('17fb6263-26da-4a71-84c7-54028a690382'),
  ('6d0ddf28-66f9-436c-a666-6f7867a61f8d'),
  ('01f56035-55a9-43a1-bd77-abe71a943fa7'),
  ('bbab4697-8bcf-425b-a018-15e0a4f10603'),
  ('0e526823-ab7f-41b6-9342-c21e9b897578'),
  ('a55796e2-93f9-481f-8692-60f31fcce6a6'),
  ('f09c67b2-4eec-44e2-bda4-3801487b9f84'),
  ('dd46f676-1cff-4802-9bf0-da15e285395d')
ON CONFLICT DO NOTHING;

DELETE FROM settlement_items WHERE order_id IN (SELECT id FROM test_orders)
  OR settlement_id IN (SELECT id FROM settlements WHERE rider_id IN (SELECT id FROM test_riders));
DELETE FROM settlements WHERE rider_id IN (SELECT id FROM test_riders);
DELETE FROM ledger_entries WHERE order_id IN (SELECT id FROM test_orders)
  OR business_id IN (SELECT id FROM reviewed_test_businesses)
  OR rider_id IN (SELECT id FROM test_riders);
DELETE FROM notifications WHERE order_id IN (SELECT id FROM test_orders)
  OR user_id IN (SELECT id FROM reviewed_test_users)
  OR payload->>'riderId' IN (SELECT id::text FROM test_riders);
DELETE FROM orders WHERE id IN (SELECT id FROM test_orders);
DELETE FROM customer_carts WHERE business_id IN (SELECT id FROM reviewed_test_businesses)
  OR customer_account_id IN (SELECT id FROM customer_accounts WHERE customer_id IN (SELECT id FROM test_customers));
DELETE FROM customer_accounts WHERE customer_id IN (SELECT id FROM test_customers);
DELETE FROM addresses WHERE id IN (SELECT delivery_address_id FROM test_orders)
  OR customer_id IN (SELECT id FROM test_customers);
DELETE FROM customers WHERE id IN (SELECT id FROM test_customers);
DELETE FROM businesses WHERE id IN (SELECT id FROM reviewed_test_businesses);
DELETE FROM users WHERE id IN (SELECT id FROM reviewed_test_users)
  AND role::text IN ('BUSINESS', 'RIDER');
DELETE FROM zones WHERE id = 'b7e4270e-531d-4560-b157-2a3cf33f75a2'
  AND name = 'QA Unaza Surcharge Test';

COMMIT;
