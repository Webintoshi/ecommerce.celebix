-- =====================================================
-- MIGRATION: Add Customer Addresses Table
-- =====================================================

CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  title VARCHAR(100),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  district VARCHAR(100),
  postal_code VARCHAR(10),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);

-- RLS Policies
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

-- Users can view their own addresses
DROP POLICY IF EXISTS "Users can view own addresses" ON customer_addresses;
CREATE POLICY "Users can view own addresses"
  ON customer_addresses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM customers 
      WHERE customers.id = customer_addresses.customer_id 
      AND customers.user_id = auth.uid()
    )
  );

-- Users can insert their own addresses
DROP POLICY IF EXISTS "Users can insert own addresses" ON customer_addresses;
CREATE POLICY "Users can insert own addresses"
  ON customer_addresses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM customers 
      WHERE customers.id = customer_addresses.customer_id 
      AND customers.user_id = auth.uid()
    )
  );

-- Users can update their own addresses
DROP POLICY IF EXISTS "Users can update own addresses" ON customer_addresses;
CREATE POLICY "Users can update own addresses"
  ON customer_addresses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM customers 
      WHERE customers.id = customer_addresses.customer_id 
      AND customers.user_id = auth.uid()
    )
  );

-- Users can delete their own addresses
DROP POLICY IF EXISTS "Users can delete own addresses" ON customer_addresses;
CREATE POLICY "Users can delete own addresses"
  ON customer_addresses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM customers 
      WHERE customers.id = customer_addresses.customer_id 
      AND customers.user_id = auth.uid()
    )
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_customer_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customer_addresses_updated_at ON customer_addresses;
CREATE TRIGGER update_customer_addresses_updated_at
    BEFORE UPDATE ON customer_addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_addresses_updated_at();
