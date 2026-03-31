ALTER TABLE products
ADD COLUMN IF NOT EXISTS shopify_metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS shopify_metafields JSONB DEFAULT '{}'::jsonb;

ALTER TABLE product_variants
ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '[]'::jsonb;

ALTER TABLE product_variants
ADD COLUMN IF NOT EXISTS shopify_metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_products_shopify_metadata ON products USING GIN (shopify_metadata);
CREATE INDEX IF NOT EXISTS idx_products_shopify_metafields ON products USING GIN (shopify_metafields);
CREATE INDEX IF NOT EXISTS idx_product_variants_attributes ON product_variants USING GIN (attributes);
CREATE INDEX IF NOT EXISTS idx_product_variants_shopify_metadata ON product_variants USING GIN (shopify_metadata);
