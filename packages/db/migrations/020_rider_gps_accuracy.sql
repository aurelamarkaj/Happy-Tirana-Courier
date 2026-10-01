ALTER TABLE rider_locations ADD COLUMN accuracy_meters double precision CHECK (accuracy_meters >= 0);
