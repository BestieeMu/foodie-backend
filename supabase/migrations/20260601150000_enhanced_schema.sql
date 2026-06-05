-- ============================================================================
-- Enhanced Schema Migration: Next-Gen Foodie Ecosystem
-- Adds: messages table, menu multi-image, driver busy status,
--        order routing history, notification preferences
-- ============================================================================

-- 1. Orders table enhancements
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS driver_accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS routing_history JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS group_id TEXT;

-- Alter column to TEXT if it was previously created as UUID
ALTER TABLE orders ALTER COLUMN group_id TYPE TEXT;

-- 2. Menu items enhancements: multi-image + modifiers
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]';

-- 3. Driver locations enhancements: busy tracking
ALTER TABLE driver_locations
ADD COLUMN IF NOT EXISTS is_busy BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS current_order_id TEXT,
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ DEFAULT NOW();

-- Alter column to TEXT if it was previously created as UUID
ALTER TABLE driver_locations ALTER COLUMN current_order_id TYPE TEXT;

-- 4. Messages table for in-app chat (matching TEXT type of orders.id)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'system')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Notification preferences (matching TEXT type of users.id)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  sound_profile TEXT DEFAULT 'chime' CHECK (sound_profile IN ('chime', 'voice', 'silent')),
  volume INTEGER DEFAULT 80 CHECK (volume >= 0 AND volume <= 100),
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Dispatch tracking table (matching TEXT type of orders.id)
CREATE TABLE IF NOT EXISTS dispatch_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'timeout')),
  distance_km NUMERIC(8,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

-- 7. Performance indexes
CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_locations_busy ON driver_locations(is_busy, last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_order ON dispatch_attempts(order_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_driver ON dispatch_attempts(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_group_id ON orders(group_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id);

-- 8. RLS policies for messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select_policy ON messages;
CREATE POLICY messages_select_policy ON messages
  FOR SELECT USING (
    sender_id = auth.uid()::text OR receiver_id = auth.uid()::text
  );

DROP POLICY IF EXISTS messages_insert_policy ON messages;
CREATE POLICY messages_insert_policy ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()::text
  );

-- 9. RLS policies for notification_preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_prefs_select ON notification_preferences;
CREATE POLICY notif_prefs_select ON notification_preferences
  FOR SELECT USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS notif_prefs_upsert ON notification_preferences;
CREATE POLICY notif_prefs_upsert ON notification_preferences
  FOR ALL USING (user_id = auth.uid()::text);

-- 10. RLS for dispatch_attempts (admin-only read)
ALTER TABLE dispatch_attempts ENABLE ROW LEVEL SECURITY;
