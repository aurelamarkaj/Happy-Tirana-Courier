UPDATE zones
SET polygon = ST_SetSRID(
      ST_GeomFromText(
        'POLYGON((19.70 41.20, 19.70 41.43, 19.96 41.43, 19.96 41.20, 19.70 41.20))'
      ),
      4326
    ),
    updated_at = now()
WHERE id = '00000000-0000-4000-8000-000000000001'
  AND name = 'Tirana Qender';
