-- Idempotent RLS policies for additional core tables, only if tables/columns exist.
-- No table creation here.

-- Helper: enable RLS on tables if they exist
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN
    ('restaurants','menu_items','categories','order_items','notifications','orders','addresses','driver_locations','reviews','payouts')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;

-- Addresses: read/update/delete own
DO $$
DECLARE has_user_id boolean;
BEGIN
  IF to_regclass('public.addresses') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='addresses' AND column_name='user_id'
    ) INTO has_user_id;
    IF has_user_id THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='addresses' AND policyname='addresses_read_own') THEN
        EXECUTE $pol$ CREATE POLICY addresses_read_own ON addresses FOR SELECT TO authenticated USING (user_id::text = auth.uid()::text OR EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.role IN ('admin','super_admin'))); $pol$;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='addresses' AND policyname='addresses_update_own') THEN
        EXECUTE $pol$ CREATE POLICY addresses_update_own ON addresses FOR UPDATE TO authenticated USING (user_id::text = auth.uid()::text) WITH CHECK (user_id::text = auth.uid()::text); $pol$;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='addresses' AND policyname='addresses_delete_own') THEN
        EXECUTE $pol$ CREATE POLICY addresses_delete_own ON addresses FOR DELETE TO authenticated USING (user_id::text = auth.uid()::text); $pol$;
      END IF;
    END IF;
  END IF;
END $$;

-- Driver locations: select own, update/insert own
DO $$
DECLARE has_driver_id boolean;
BEGIN
  IF to_regclass('public.driver_locations') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='driver_locations' AND column_name='driver_id'
    ) INTO has_driver_id;
    IF has_driver_id THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='driver_locations' AND policyname='driver_locations_read_own') THEN
        EXECUTE $pol$ CREATE POLICY driver_locations_read_own ON driver_locations FOR SELECT TO authenticated USING (driver_id::text = auth.uid()::text OR EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND u.role IN ('admin','super_admin'))); $pol$;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='driver_locations' AND policyname='driver_locations_upsert_own') THEN
        EXECUTE $pol$ CREATE POLICY driver_locations_upsert_own ON driver_locations FOR INSERT TO authenticated WITH CHECK (driver_id::text = auth.uid()::text); $pol$;
        EXECUTE $pol$ CREATE POLICY driver_locations_update_own ON driver_locations FOR UPDATE TO authenticated USING (driver_id::text = auth.uid()::text) WITH CHECK (driver_id::text = auth.uid()::text); $pol$;
      END IF;
    END IF;
  END IF;
END $$;

-- Reviews: read all for a restaurant, write by owner
DO $$
DECLARE has_user_id boolean; has_restaurant_id boolean;
BEGIN
  IF to_regclass('public.reviews') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reviews' AND column_name='user_id') INTO has_user_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reviews' AND column_name='restaurant_id') INTO has_restaurant_id;
    IF has_user_id THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='reviews_insert_own') THEN
        EXECUTE $pol$ CREATE POLICY reviews_insert_own ON reviews FOR INSERT TO authenticated WITH CHECK (user_id::text = auth.uid()::text); $pol$;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='reviews_update_own') THEN
        EXECUTE $pol$ CREATE POLICY reviews_update_own ON reviews FOR UPDATE TO authenticated USING (user_id::text = auth.uid()::text) WITH CHECK (user_id::text = auth.uid()::text); $pol$;
      END IF;
    END IF;
    IF has_restaurant_id THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='reviews_read_public') THEN
        EXECUTE $pol$ CREATE POLICY reviews_read_public ON reviews FOR SELECT TO anon, authenticated USING (true); $pol$;
      END IF;
    END IF;
  END IF;
END $$;

-- Payouts: read by restaurant admins and super_admin, service role can insert/update
DO $$
DECLARE has_restaurant_id boolean;
BEGIN
  IF to_regclass('public.payouts') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payouts' AND column_name='restaurant_id') INTO has_restaurant_id;
    IF has_restaurant_id THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payouts' AND policyname='payouts_read') THEN
        EXECUTE $pol$ CREATE POLICY payouts_read ON payouts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND (u.role = 'super_admin' OR (u.role='admin' AND u.restaurant_id::text = payouts.restaurant_id::text)))); $pol$;
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payouts' AND policyname='payouts_insert_service') THEN
      EXECUTE $pol$ CREATE POLICY payouts_insert_service ON payouts FOR INSERT TO authenticated WITH CHECK (auth.role() = 'service_role'); $pol$;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payouts' AND policyname='payouts_update_service') THEN
      EXECUTE $pol$ CREATE POLICY payouts_update_service ON payouts FOR UPDATE TO authenticated USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role'); $pol$;
    END IF;
  END IF;
END $$;

-- Restaurants: public read, admins of that restaurant can write
DO $$
DECLARE has_id boolean;
BEGIN
  IF to_regclass('public.restaurants') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='restaurants' AND column_name='id') INTO has_id;
    IF has_id THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='restaurants' AND policyname='restaurants_read_public') THEN
        EXECUTE $pol$ CREATE POLICY restaurants_read_public ON restaurants FOR SELECT TO anon, authenticated USING (true); $pol$;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='restaurants' AND policyname='restaurants_update_admin') THEN
        EXECUTE $pol$ CREATE POLICY restaurants_update_admin ON restaurants FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND (u.role='super_admin' OR (u.role='admin' AND u.restaurant_id::text = restaurants.id::text)))) WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND (u.role='super_admin' OR (u.role='admin' AND u.restaurant_id::text = restaurants.id::text)))); $pol$;
      END IF;
    END IF;
  END IF;
END $$;

-- Menu items: public read, admins for the restaurant can write
DO $$
DECLARE has_restaurant_id boolean;
BEGIN
  IF to_regclass('public.menu_items') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='menu_items' AND column_name='restaurant_id') INTO has_restaurant_id;
    IF has_restaurant_id THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_items' AND policyname='menu_items_read_public') THEN
        EXECUTE $pol$ CREATE POLICY menu_items_read_public ON menu_items FOR SELECT TO anon, authenticated USING (true); $pol$;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='menu_items' AND policyname='menu_items_write_admin') THEN
        EXECUTE $pol$ CREATE POLICY menu_items_write_admin ON menu_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND (u.role='super_admin' OR (u.role='admin' AND u.restaurant_id::text = menu_items.restaurant_id::text)))); $pol$;
        EXECUTE $pol$ CREATE POLICY menu_items_update_admin ON menu_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND (u.role='super_admin' OR (u.role='admin' AND u.restaurant_id::text = menu_items.restaurant_id::text)))) WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND (u.role='super_admin' OR (u.role='admin' AND u.restaurant_id::text = menu_items.restaurant_id::text)))); $pol$;
      END IF;
    END IF;
  END IF;
END $$;

-- Order items: read if you can read the parent order (user/driver/restaurant admin)
DO $$
DECLARE has_order_id boolean;
BEGIN
  IF to_regclass('public.order_items') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='order_items' AND column_name='order_id') INTO has_order_id;
    IF has_order_id THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='order_items' AND policyname='order_items_read_via_order') THEN
        EXECUTE $pol$
          CREATE POLICY order_items_read_via_order ON order_items
          FOR SELECT TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM orders o
              WHERE o.id::text = order_items.order_id::text
              AND (
                o.user_id::text = auth.uid()::text OR
                o.driver_id::text = auth.uid()::text OR
                EXISTS (SELECT 1 FROM users u WHERE u.id::text = auth.uid()::text AND (u.role='super_admin' OR (u.role='admin' AND u.restaurant_id::text = o.restaurant_id::text)))
              )
            )
          );
        $pol$;
      END IF;
    END IF;
  END IF;
END $$;

-- Notifications: read own, service role insert
DO $$
DECLARE has_user_id boolean;
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='user_id') INTO has_user_id;
    IF has_user_id THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_read_own') THEN
        EXECUTE $pol$ CREATE POLICY notifications_read_own ON notifications FOR SELECT TO authenticated USING (user_id::text = auth.uid()::text); $pol$;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_insert_service') THEN
        EXECUTE $pol$ CREATE POLICY notifications_insert_service ON notifications FOR INSERT TO authenticated WITH CHECK (auth.role() = 'service_role'); $pol$;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_update_service') THEN
        EXECUTE $pol$ CREATE POLICY notifications_update_service ON notifications FOR UPDATE TO authenticated USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role'); $pol$;
      END IF;
    END IF;
  END IF;
END $$;

