-- ============================================================================
-- Enhanced Reviews Migration: Next-Gen Foodie Ecosystem
-- Adds: driver rating, platform rating, and restaurant response fields
-- ============================================================================

-- 1. Alter reviews table to add new columns
ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS driver_id TEXT REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS driver_rating INTEGER CHECK (driver_rating IS NULL OR (driver_rating >= 1 AND driver_rating <= 5)),
ADD COLUMN IF NOT EXISTS driver_comment TEXT,
ADD COLUMN IF NOT EXISTS platform_rating INTEGER CHECK (platform_rating IS NULL OR (platform_rating >= 1 AND platform_rating <= 5)),
ADD COLUMN IF NOT EXISTS platform_comment TEXT,
ADD COLUMN IF NOT EXISTS restaurant_response TEXT,
ADD COLUMN IF NOT EXISTS restaurant_responded_at TIMESTAMP WITH TIME ZONE;

-- 2. Indexes for faster retrieval of driver reviews
CREATE INDEX IF NOT EXISTS idx_reviews_driver_id ON reviews(driver_id);
