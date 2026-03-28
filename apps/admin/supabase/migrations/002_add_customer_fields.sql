-- =====================================================
-- MIGRATION: Add missing customer fields
-- =====================================================

-- Add status field to customers
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' 
CHECK (status IN ('active', 'inactive', 'blocked'));

-- Add last_order_at field
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMPTZ;

-- Add updated_at field
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add notes field for internal notes
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create index for status
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

-- Create index for last_order_at
CREATE INDEX IF NOT EXISTS idx_customers_last_order ON customers(last_order_at DESC);

-- Update existing customers to have status
UPDATE customers SET status = 'active' WHERE status IS NULL;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_customers_updated_at();

-- =====================================================
-- FUNCTION: Update customer stats on order
-- =====================================================
CREATE OR REPLACE FUNCTION update_customer_on_order()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process if customer_id exists
    IF NEW.customer_id IS NOT NULL THEN
        UPDATE customers
        SET 
            total_orders = total_orders + 1,
            total_spent = total_spent + NEW.total,
            last_order_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_update_customer_on_order ON orders;

-- Create trigger to update customer stats when order is created
CREATE TRIGGER trigger_update_customer_on_order
    AFTER INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_on_order();

-- =====================================================
-- FUNCTION: Update customer stats on order delete
-- =====================================================
CREATE OR REPLACE FUNCTION update_customer_on_order_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.customer_id IS NOT NULL THEN
        UPDATE customers
        SET 
            total_orders = GREATEST(0, total_orders - 1),
            total_spent = GREATEST(0, total_spent - OLD.total),
            updated_at = NOW()
        WHERE id = OLD.customer_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_customer_on_delete ON orders;

CREATE TRIGGER trigger_update_customer_on_delete
    BEFORE DELETE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_on_order_delete();
