-- Add latitude and longitude to restaurants table
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
