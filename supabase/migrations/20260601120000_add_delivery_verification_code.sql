ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_verification_code TEXT,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_delivery_verification_code_format;

ALTER TABLE orders
ADD CONSTRAINT orders_delivery_verification_code_format
CHECK (
  delivery_verification_code IS NULL
  OR delivery_verification_code ~ '^[0-9]{6}$'
);

ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
ADD CONSTRAINT orders_status_check
CHECK (status IN (
  'pending',
  'confirmed',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'arrived_pickup',
  'picked_up',
  'on_the_way',
  'delivered',
  'cancelled',
  'rejected',
  'scheduled'
));
