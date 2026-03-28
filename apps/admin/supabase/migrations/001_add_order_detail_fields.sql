-- =====================================================
-- ADD ORDER DETAIL PAGE FIELDS
-- Run this in Supabase SQL Editor to add new fields
-- =====================================================

-- Add new columns to orders table if they don't exist
DO $$
BEGIN
    -- Check and add shipping_carrier
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'shipping_carrier'
    ) THEN
        ALTER TABLE orders ADD COLUMN shipping_carrier TEXT;
    END IF;

    -- Check and add tracking_number
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'tracking_number'
    ) THEN
        ALTER TABLE orders ADD COLUMN tracking_number TEXT;
    END IF;

    -- Check and add estimated_delivery
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'estimated_delivery'
    ) THEN
        ALTER TABLE orders ADD COLUMN estimated_delivery DATE;
    END IF;

    -- Check and add internal_notes
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'internal_notes'
    ) THEN
        ALTER TABLE orders ADD COLUMN internal_notes TEXT;
    END IF;
END
$$;

-- Create order_activity_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS order_activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    admin_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_order_activity_log_order ON order_activity_log(order_id);
CREATE INDEX IF NOT EXISTS idx_order_activity_log_created ON order_activity_log(created_at DESC);

-- DISABLE RLS on order_activity_log since we only access it from server components
-- with service role key (which bypasses RLS anyway)
ALTER TABLE order_activity_log DISABLE ROW LEVEL SECURITY;

-- Create initial activity log entries for existing orders
-- (Optional: Comment out if you don't want to backfill data)
INSERT INTO order_activity_log (order_id, action, new_value, created_at)
SELECT
    id,
    'order_created',
    jsonb_build_object('status', status, 'total', total::text),
    created_at
FROM orders
WHERE NOT EXISTS (
    SELECT 1 FROM order_activity_log
    WHERE order_activity_log.order_id = orders.id
    AND action = 'order_created'
);
