-- The tariff area is one true circular buffer. Keep the separate coverage zone
-- unchanged: it still governs where deliveries may be created.
UPDATE zones
SET polygon = ST_Buffer(
  ST_SetSRID(ST_MakePoint(19.835129, 41.333751), 4326)::geography,
  4900,
  'quad_segs=64'
)::geometry
WHERE name = 'Zona pa shtesë - Tirana' AND is_surcharge_area = true;
