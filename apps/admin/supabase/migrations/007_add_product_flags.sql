-- Add product status and attribute columns
ALTER TABLE products
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS vegan BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS gluten_free BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sugar_free BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS high_protein BOOLEAN DEFAULT false;

-- Update existing products
UPDATE products
SET is_active = true,
    is_new = false,
    vegan = false,
    gluten_free = false,
    sugar_free = false,
    high_protein = false
WHERE is_active IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_is_new ON products(is_new);
CREATE INDEX IF NOT EXISTS idx_products_vegan ON products(vegan);
CREATE INDEX IF NOT EXISTS idx_products_gluten_free ON products(gluten_free);
CREATE INDEX IF NOT EXISTS idx_products_sugar_free ON products(sugar_free);
