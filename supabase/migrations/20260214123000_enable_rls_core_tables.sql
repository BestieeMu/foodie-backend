ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_select_policy ON orders
  FOR SELECT TO authenticated
  USING (
    user_id::text = auth.uid()::text
    OR driver_id::text = auth.uid()::text
    OR EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND (u.role = 'super_admin' OR (u.role = 'admin' AND u.restaurant_id::text = orders.restaurant_id::text)))
  );

CREATE POLICY addresses_select_policy ON addresses
  FOR SELECT TO authenticated
  USING (user_id::text = auth.uid()::text OR EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.role IN ('admin','super_admin')));

CREATE POLICY addresses_modify_policy ON addresses
  FOR INSERT TO authenticated
  WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY driver_locations_select_policy ON driver_locations
  FOR SELECT TO authenticated
  USING (
    driver_id::text = auth.uid()::text
    OR EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.role IN ('admin','super_admin'))
  );
