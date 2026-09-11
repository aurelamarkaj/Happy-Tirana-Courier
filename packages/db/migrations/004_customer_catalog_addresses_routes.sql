ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS description text;

CREATE TABLE IF NOT EXISTS address_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_id text UNIQUE,
  label text NOT NULL,
  area text,
  city text,
  country text NOT NULL DEFAULT 'Albania',
  details text,
  lat numeric(9, 6) NOT NULL,
  lng numeric(9, 6) NOT NULL,
  source text NOT NULL DEFAULT 'OSM',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS address_suggestions_lookup_idx
  ON address_suggestions USING gin (to_tsvector('simple', label || ' ' || COALESCE(area, '') || ' ' || COALESCE(city, '')));

INSERT INTO address_suggestions (osm_id, label, area, city, details, lat, lng)
VALUES
  ('seed-al-abdyl-frasheri', 'Rruga Abdyl Frasheri', 'Bllok', 'Tirane', 'Prane Librit Universitar', 41.319800, 19.817200),
  ('seed-al-myslym-shyri', 'Rruga Myslym Shyri', 'Qender', 'Tirane', 'Segmenti qendror', 41.323100, 19.813700),
  ('seed-al-komuna-parisit', 'Rruga Komuna e Parisit', 'Komuna e Parisit', 'Tirane', 'Prane Kompleksit Dinamo', 41.314700, 19.807400),
  ('seed-al-kavajes', 'Rruga e Kavajes', 'Qender', 'Tirane', 'Prane qendres', 41.327500, 19.807800),
  ('seed-al-dibres', 'Rruga e Dibres', 'Qender', 'Tirane', 'Prane QSUT', 41.337200, 19.829300),
  ('seed-al-elbasanit', 'Rruga e Elbasanit', 'Liqeni', 'Tirane', 'Prane Fakultetit Ekonomik', 41.318900, 19.832600),
  ('seed-al-don-bosko', 'Rruga Don Bosko', 'Don Bosko', 'Tirane', 'Zona Don Bosko', 41.337400, 19.798900),
  ('seed-al-barrikadave', 'Rruga Barrikadave', 'Pazari i Ri', 'Tirane', 'Prane Pazarit te Ri', 41.330100, 19.823400),
  ('seed-al-durresit', 'Rruga e Durresit', 'Qender', 'Tirane', 'Aksi drejt sheshit Skenderbej', 41.329300, 19.811900),
  ('seed-al-sami-frasheri', 'Rruga Sami Frasheri', 'Bllok', 'Tirane', 'Zona Ish-Bllok', 41.318300, 19.815300),
  ('seed-al-ismet-qemali', 'Rruga Ismail Qemali', 'Bllok', 'Tirane', 'Prane zones se Bllokut', 41.320800, 19.816500),
  ('seed-al-george-bush', 'Rruga George W. Bush', 'Qender', 'Tirane', 'Prane Parlamentit', 41.328500, 19.823200),
  ('seed-al-5-maji', 'Rruga 5 Maji', 'Tirane Veri', 'Tirane', 'Zona 5 Maji', 41.343600, 19.837500),
  ('seed-al-ali-demi', 'Rruga Ali Demi', 'Ali Demi', 'Tirane', 'Zona Ali Demi', 41.319500, 19.841000),
  ('seed-al-vlore-skela', 'Rruga Murat Terbaci', 'Skela', 'Vlore', 'Lungomare Vlore', 40.450900, 19.489900),
  ('seed-al-durres-epidamn', 'Rruga Epidamn', 'Qender', 'Durres', 'Prane amfiteatrit', 41.313900, 19.444600),
  ('seed-al-shkoder-kole-idromeno', 'Rruga Kole Idromeno', 'Qender', 'Shkoder', 'Pedonale Shkoder', 42.068100, 19.512600),
  ('seed-al-elbasan-aqif-pasha', 'Bulevardi Aqif Pasha', 'Qender', 'Elbasan', 'Bulevardi kryesor', 41.112600, 20.082200),
  ('seed-al-korce-shen-gjergji', 'Bulevardi Shen Gjergji', 'Qender', 'Korce', 'Prane katedrales', 40.618700, 20.779300),
  ('seed-al-sarande-skenderbeu', 'Rruga Skenderbeu', 'Qender', 'Sarande', 'Aksi kryesor', 39.875500, 20.005900)
ON CONFLICT (osm_id) DO UPDATE SET
  label = EXCLUDED.label,
  area = EXCLUDED.area,
  city = EXCLUDED.city,
  details = EXCLUDED.details,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  updated_at = now();

-- Businesses and products are created by administrators; no demo catalog is seeded.
