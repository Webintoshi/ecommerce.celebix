-- Add missing columns to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS subcategory TEXT,
ADD COLUMN IF NOT EXISTS rating NUMERIC DEFAULT 5,
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_bestseller BOOLEAN DEFAULT false;

-- Update existing products with default values
UPDATE products
SET rating = 5,
    review_count = 0,
    is_featured = false,
    is_bestseller = false
WHERE rating IS NULL;

-- Create index on rating for performance
CREATE INDEX IF NOT EXISTS idx_products_rating ON products(rating);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_is_bestseller ON products(is_bestseller);
