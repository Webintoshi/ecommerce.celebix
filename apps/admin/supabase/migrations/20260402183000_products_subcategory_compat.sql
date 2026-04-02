ALTER TABLE products
ADD COLUMN IF NOT EXISTS subcategory TEXT;

CREATE INDEX IF NOT EXISTS idx_products_category_subcategory
ON products(category, subcategory);
