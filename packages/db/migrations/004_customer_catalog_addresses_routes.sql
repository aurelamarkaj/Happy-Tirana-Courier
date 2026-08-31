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

INSERT INTO businesses (id, name, legal_name, phone, email, address_text, lat, lng, status, category, rating, eta_minutes, cover_image_url, accepts_customer_orders, description)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Pasta e Shtepise', 'Pasta e Shtepise sh.p.k.', '+355690000001', 'pasta@example.local', 'Bllok, Tirane', 41.319800, 19.817200, 'ACTIVE', 'FOOD', 4.8, 30, '/catalog/business-pasta.webp', true, 'Pasta, wraps dhe dreka te shpejta per zyre ose shtepi.'),
  ('10000000-0000-4000-8000-000000000002', 'Market Komuna', 'Market Komuna sh.p.k.', '+355690000002', 'market@example.local', 'Komuna e Parisit, Tirane', 41.314700, 19.807400, 'ACTIVE', 'MARKET', 4.6, 25, '/catalog/business-market.webp', true, 'Produkte marketi, pako familjare dhe furnizime te perditshme.'),
  ('10000000-0000-4000-8000-000000000003', 'Farmaci 24', 'Farmaci 24 sh.p.k.', '+355690000003', 'farmaci@example.local', 'Rruga e Kavajes, Tirane', 41.327500, 19.807800, 'ACTIVE', 'PHARMACY', 4.9, 20, '/catalog/business-pharmacy.webp', true, 'Produkte kujdesi ditor dhe porosi farmacie me dorezim te shpejte.'),
  ('10000000-0000-4000-8000-000000000004', 'Dokument Express', 'Dokument Express sh.p.k.', '+355690000004', 'docs@example.local', 'Rruga Barrikadave, Tirane', 41.330100, 19.823400, 'ACTIVE', 'DOCUMENTS', 4.7, 40, '/catalog/business-documents.webp', true, 'Marrje dhe dorezim dokumentesh brenda Tiranes.'),
  ('10000000-0000-4000-8000-000000000005', 'Burger Station', 'Burger Station sh.p.k.', '+355690000005', 'burger@example.local', 'Rruga Sami Frasheri, Tirane', 41.318300, 19.815300, 'ACTIVE', 'FOOD', 4.7, 28, '/catalog/product-wrap.webp', true, 'Burger, patate dhe menu te shpejta per darke.'),
  ('10000000-0000-4000-8000-000000000006', 'Sushi Blloku', 'Sushi Blloku sh.p.k.', '+355690000006', 'sushi@example.local', 'Rruga Ismail Qemali, Tirane', 41.320800, 19.816500, 'ACTIVE', 'FOOD', 4.9, 35, '/catalog/checkout-bag.webp', true, 'Sushi, poke dhe menu aziatike.'),
  ('10000000-0000-4000-8000-000000000007', 'Pizza Arena', 'Pizza Arena sh.p.k.', '+355690000007', 'pizza@example.local', 'Rruga e Durresit, Tirane', 41.329300, 19.811900, 'ACTIVE', 'FOOD', 4.6, 32, '/catalog/business-pasta.webp', true, 'Pizza klasike, pica familjare dhe pije.'),
  ('10000000-0000-4000-8000-000000000008', 'Bakery Morning', 'Bakery Morning sh.p.k.', '+355690000008', 'bakery@example.local', 'Rruga Myslym Shyri, Tirane', 41.323100, 19.813700, 'ACTIVE', 'FOOD', 4.8, 22, '/catalog/product-office-snacks.webp', true, 'Kroasane, sanduice, embelsira dhe kafe.'),
  ('10000000-0000-4000-8000-000000000009', 'Fresh Market Bllok', 'Fresh Market Bllok sh.p.k.', '+355690000009', 'fresh@example.local', 'Rruga Abdyl Frasheri, Tirane', 41.319800, 19.817200, 'ACTIVE', 'MARKET', 4.7, 24, '/catalog/product-grocery-basket.webp', true, 'Fruta, perime, uje dhe produkte baze.'),
  ('10000000-0000-4000-8000-000000000010', 'Bio Store Tirana', 'Bio Store Tirana sh.p.k.', '+355690000010', 'bio@example.local', 'Rruga e Elbasanit, Tirane', 41.318900, 19.832600, 'ACTIVE', 'MARKET', 4.5, 30, '/catalog/business-market.webp', true, 'Produkte bio, snack te shendetshem dhe pije.'),
  ('10000000-0000-4000-8000-000000000011', 'Farmaci Blloku', 'Farmaci Blloku sh.p.k.', '+355690000011', 'farmabllok@example.local', 'Rruga Sami Frasheri, Tirane', 41.318300, 19.815300, 'ACTIVE', 'PHARMACY', 4.8, 18, '/catalog/product-daily-care.webp', true, 'Kujdes personal, vitamina dhe produkte urgjente.'),
  ('10000000-0000-4000-8000-000000000012', 'Petite Flowers', 'Petite Flowers sh.p.k.', '+355690000012', 'flowers@example.local', 'Rruga George W. Bush, Tirane', 41.328500, 19.823200, 'ACTIVE', 'OTHER', 4.9, 35, '/catalog/business-documents.webp', true, 'Buqeta dhe dhurata te vogla me dorezim ne Tirane.'),
  ('10000000-0000-4000-8000-000000000013', 'Office Supplies', 'Office Supplies sh.p.k.', '+355690000013', 'office@example.local', 'Rruga Don Bosko, Tirane', 41.337400, 19.798900, 'ACTIVE', 'DOCUMENTS', 4.5, 38, '/catalog/product-document-envelope.webp', true, 'Dokumente, printime dhe furnizime zyre.'),
  ('10000000-0000-4000-8000-000000000014', 'Coffee Corner', 'Coffee Corner sh.p.k.', '+355690000014', 'coffee@example.local', 'Rruga Ali Demi, Tirane', 41.319500, 19.841000, 'ACTIVE', 'FOOD', 4.6, 20, '/catalog/product-office-snacks.webp', true, 'Kafe, smoothie dhe snack te shpejta.')
ON CONFLICT (id) DO UPDATE SET
  address_text = EXCLUDED.address_text,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  category = EXCLUDED.category,
  rating = EXCLUDED.rating,
  eta_minutes = EXCLUDED.eta_minutes,
  cover_image_url = EXCLUDED.cover_image_url,
  accepts_customer_orders = true,
  description = EXCLUDED.description,
  updated_at = now();

INSERT INTO product_categories (id, business_id, name, sort_order, active)
VALUES
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'Burger', 1, true),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'Sushi', 1, true),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000007', 'Pizza', 1, true),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000008', 'Mengjes', 1, true),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'Te fresketa', 1, true),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000010', 'Bio', 1, true),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011', 'Farmaci', 1, true),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000012', 'Dhurata', 1, true),
  ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000013', 'Zyre', 1, true),
  ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000014', 'Kafe', 1, true)
ON CONFLICT (business_id, name) DO NOTHING;

INSERT INTO products (id, business_id, category_id, name, description, price, image_url, is_available, sort_order)
VALUES
  ('30000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'Classic burger', 'Mish viçi, cheddar, sallate, salce house', 720, '/catalog/product-wrap.webp', true, 1),
  ('30000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'Crispy chicken menu', 'Burger pule, patate dhe pije', 890, '/catalog/product-office-snacks.webp', true, 2),
  ('30000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', 'Salmon roll', 'Oriz, salmon, avokado, susam', 1250, '/catalog/checkout-bag.webp', true, 1),
  ('30000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', 'Poke bowl', 'Oriz, pule, perime dhe salce teriyaki', 980, '/catalog/product-grocery-basket.webp', true, 2),
  ('30000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000007', 'Pizza margherita', 'Mozzarella, domate, borzilok', 760, '/catalog/business-pasta.webp', true, 1),
  ('30000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000007', 'Pizza pikante', 'Sallam pikant, djathe, speca', 890, '/catalog/product-penne.webp', true, 2),
  ('30000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000008', 'Kroasan gjalpi', 'Kroasan i fresket dhe kafe', 330, '/catalog/product-office-snacks.webp', true, 1),
  ('30000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000008', 'Sanduic pule', 'Buke artizanale, pule, sallate', 420, '/catalog/product-wrap.webp', true, 2),
  ('30000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000009', 'Shporte frutash', 'Banane, molle, portokalle dhe fruta stine', 980, '/catalog/product-grocery-basket.webp', true, 1),
  ('30000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000009', 'Pako uji', '6 shishe uje dhe produkte baze', 520, '/catalog/business-market.webp', true, 2),
  ('30000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000010', 'Granola bio', 'Granola, kos dhe fruta', 650, '/catalog/product-office-snacks.webp', true, 1),
  ('30000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000010', 'Leng detox', 'Leng i fresket me fruta dhe perime', 390, '/catalog/product-grocery-basket.webp', true, 2),
  ('30000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011', 'Pako vitaminash', 'Vitamina dhe minerale per perdorim ditor', 1350, '/catalog/product-daily-care.webp', true, 1),
  ('30000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011', 'Kujdes urgjent', 'Termometer, peceta, antiseptik', 990, '/catalog/business-pharmacy.webp', true, 2),
  ('30000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000012', 'Buqete mini', 'Lule stine me paketim dhurate', 1500, '/catalog/business-documents.webp', true, 1),
  ('30000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000012', 'Gift card', 'Kartoline dhe dhurate e vogel', 700, '/catalog/product-document-envelope.webp', true, 2),
  ('30000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000013', 'Print dokumentesh', 'Printim dhe dorezim dokumentesh', 450, '/catalog/product-document-envelope.webp', true, 1),
  ('30000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000013', 'Pako zyre', 'Letra, stilolapsa dhe dosje', 820, '/catalog/business-documents.webp', true, 2),
  ('30000000-0000-4000-8000-000000000025', '10000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000014', 'Iced coffee', 'Kafe e ftohte me qumesht', 320, '/catalog/product-office-snacks.webp', true, 1),
  ('30000000-0000-4000-8000-000000000026', '10000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000014', 'Smoothie berry', 'Fruta pylli dhe banane', 420, '/catalog/product-grocery-basket.webp', true, 2)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  image_url = EXCLUDED.image_url,
  is_available = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
