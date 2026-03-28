-- =====================================================
-- MIGRATION: Add Customer Preferred Products
-- =====================================================

-- Table: Customer Preferred Products
CREATE TABLE IF NOT EXISTS customer_preferred_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name VARCHAR(255),
  variant_name VARCHAR(255),
  category VARCHAR(100),
  purchase_count INTEGER DEFAULT 1,
  total_quantity INTEGER DEFAULT 1,
  total_spent NUMERIC(10, 2) DEFAULT 0,
  last_purchased_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure unique product per customer
  UNIQUE(customer_id, product_id, variant_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_customer_preferred_products_customer ON customer_preferred_products(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_preferred_products_product ON customer_preferred_products(product_id);
CREATE INDEX IF NOT EXISTS idx_customer_preferred_products_category ON customer_preferred_products(category);
CREATE INDEX IF NOT EXISTS idx_customer_preferred_products_popularity ON customer_preferred_products(purchase_count DESC, total_quantity DESC);

-- RLS Policies
ALTER TABLE customer_preferred_products ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access to preferred products"
  ON customer_preferred_products
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own preferences
DROP POLICY IF EXISTS "Users can view own preferred products" ON customer_preferred_products;
CREATE POLICY "Users can view own preferred products"
  ON customer_preferred_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM customers 
      WHERE customers.id = customer_preferred_products.customer_id 
      AND customers.user_id = auth.uid()
    )
  );

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_customer_preferred_products_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customer_preferred_products_timestamp_trigger ON customer_preferred_products;
CREATE TRIGGER update_customer_preferred_products_timestamp_trigger
    BEFORE UPDATE ON customer_preferred_products
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_preferred_products_timestamp();
