-- Light PostgreSQL subset schema for storefront/catalog read-path pilots.
-- Scope intentionally excludes auth, customers, orders, payments, reviews,
-- abandoned carts, and Supabase-specific RLS/policy objects.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  short_description TEXT,
  images TEXT[] DEFAULT '{}',
  images_v2 JSONB DEFAULT '[]'::jsonb,
  category TEXT,
  subcategory TEXT,
  tags TEXT[] DEFAULT '{}',
  is_featured BOOLEAN DEFAULT false,
  is_bestseller BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  is_new BOOLEAN DEFAULT false,
  vegan BOOLEAN DEFAULT false,
  gluten_free BOOLEAN DEFAULT false,
  sugar_free BOOLEAN DEFAULT false,
  high_protein BOOLEAN DEFAULT false,
  rating NUMERIC(3, 2) DEFAULT 5,
  review_count INTEGER DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  status TEXT DEFAULT 'published',
  is_draft BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  tax_rate INTEGER DEFAULT 0,
  brand TEXT,
  country_of_origin TEXT DEFAULT 'Turkiye',
  sku TEXT,
  gtin TEXT,
  dimensions JSONB DEFAULT '{}'::jsonb,
  related_products UUID[] DEFAULT '{}',
  complementary_products UUID[] DEFAULT '{}',
  seo_keywords TEXT[] DEFAULT '{}',
  seo_focus_keyword TEXT,
  og_image TEXT,
  canonical_url TEXT,
  seo_robots TEXT DEFAULT 'index,follow',
  track_stock BOOLEAN DEFAULT true,
  low_stock_threshold INTEGER DEFAULT 10,
  allergens TEXT[] DEFAULT '{}',
  nutrition_basis TEXT DEFAULT 'per_100g',
  serving_size INTEGER DEFAULT 100,
  serving_per_container INTEGER DEFAULT 1,
  vitamins JSONB DEFAULT '{}'::jsonb,
  ingredients TEXT,
  storage_conditions TEXT,
  shelf_life_days INTEGER,
  calories NUMERIC(10, 2) DEFAULT 0,
  protein NUMERIC(10, 2) DEFAULT 0,
  carbs NUMERIC(10, 2) DEFAULT 0,
  fat NUMERIC(10, 2) DEFAULT 0,
  fiber NUMERIC(10, 2) DEFAULT 0,
  sugar NUMERIC(10, 2) DEFAULT 0,
  saturated_fat NUMERIC(10, 2) DEFAULT 0,
  sodium NUMERIC(10, 2) DEFAULT 0,
  shopify_metadata JSONB DEFAULT '{}'::jsonb,
  shopify_metafields JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  price DECIMAL(10, 2) NOT NULL,
  original_price DECIMAL(10, 2),
  stock INTEGER DEFAULT 0,
  weight TEXT,
  cost DECIMAL(10, 2),
  barcode TEXT,
  group_name TEXT,
  images TEXT[] DEFAULT '{}',
  unit TEXT DEFAULT 'adet',
  max_purchase_quantity INTEGER,
  warehouse_location TEXT,
  attributes JSONB DEFAULT '[]'::jsonb,
  shopify_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  image TEXT,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  seo_keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL DEFAULT '',
  schema_type TEXT NOT NULL DEFAULT 'WebPage',
  icon TEXT,
  seo_title TEXT,
  seo_description TEXT,
  seo_keywords TEXT[] DEFAULT '{}',
  faq JSONB DEFAULT '[]'::jsonb,
  geo_data JSONB DEFAULT '{"keyTakeaways": [], "entities": []}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active_status ON products(is_active, status);
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_products_images_v2 ON products USING GIN(images_v2);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_pages_active_sort ON pages(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_pages_faq ON pages USING GIN(faq);
CREATE INDEX IF NOT EXISTS idx_pages_geo_data ON pages USING GIN(geo_data);

DROP TRIGGER IF EXISTS set_products_updated_at ON products;
CREATE TRIGGER set_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS set_categories_updated_at ON categories;
CREATE TRIGGER set_categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS set_settings_updated_at ON settings;
CREATE TRIGGER set_settings_updated_at
BEFORE UPDATE ON settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS set_pages_updated_at ON pages;
CREATE TRIGGER set_pages_updated_at
BEFORE UPDATE ON pages
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
