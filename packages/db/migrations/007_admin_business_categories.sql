ALTER TABLE businesses
  ALTER COLUMN category DROP DEFAULT,
  ALTER COLUMN category TYPE text USING
    CASE category::text
      WHEN 'FOOD' THEN 'Ushqime'
      WHEN 'MARKET' THEN 'Market'
      WHEN 'PHARMACY' THEN 'Farmaci'
      WHEN 'DOCUMENTS' THEN 'Dokumente'
      WHEN 'OTHER' THEN 'Te tjera'
      ELSE category::text
    END,
  ALTER COLUMN category SET DEFAULT 'Te tjera';

CREATE TABLE IF NOT EXISTS business_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO business_categories (name, active, sort_order)
VALUES
  ('Ushqime', true, 1),
  ('Market', true, 2),
  ('Farmaci', true, 3),
  ('Dokumente', true, 4),
  ('Lule dhe dhurata', true, 5),
  ('Te tjera', true, 99)
ON CONFLICT (name) DO UPDATE
SET active = EXCLUDED.active,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO business_categories (name, active, sort_order)
SELECT DISTINCT category, true, 50
FROM businesses
WHERE category IS NOT NULL
  AND category <> ''
ON CONFLICT (name) DO NOTHING;

CREATE INDEX IF NOT EXISTS business_categories_active_sort_idx ON business_categories (active, sort_order, name);
