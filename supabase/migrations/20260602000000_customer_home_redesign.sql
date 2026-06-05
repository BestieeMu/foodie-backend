-- ============================================================================
-- Customer Home Screen Redesign Migration
-- Adds tables for promotions, coupons, and extends restaurants and menu_items
-- ============================================================================

-- 1. Create promotions table
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT NOT NULL,
  campaign_type TEXT DEFAULT 'discount',
  link TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create coupons table
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_amount NUMERIC NOT NULL,
  is_percentage BOOLEAN DEFAULT FALSE,
  min_order_amount NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Alter restaurants table
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 500,
ADD COLUMN IF NOT EXISTS min_order NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS estimated_delivery_time TEXT DEFAULT '20-30 min',
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS promotional_badges JSONB DEFAULT '[]';

-- 4. Alter menu_items table
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS dietary_labels TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_trending BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0;

-- 5. RLS Policies
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- Read access for everyone
DROP POLICY IF EXISTS promotions_read ON promotions;
CREATE POLICY promotions_read ON promotions FOR SELECT USING (true);

DROP POLICY IF EXISTS coupons_read ON coupons;
CREATE POLICY coupons_read ON coupons FOR SELECT USING (true);
