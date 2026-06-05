-- ============================================================================
-- Schema Migration: Add Cancellation Reason to Orders Table
-- Adds: cancellation_reason TEXT
-- ============================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
