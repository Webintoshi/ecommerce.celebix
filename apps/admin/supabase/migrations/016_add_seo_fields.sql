-- =====================================================
-- SEO FIELDS - Add SEO, FAQ, and GEO fields to products and categories
-- =====================================================

-- Add SEO fields to products table
DO $$
BEGIN
    -- FAQ field (JSONB for flexible FAQ storage)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'faq'
    ) THEN
        ALTER TABLE products ADD COLUMN faq JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- GEO data field (JSONB for LLM/GEO optimization data)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'geo_data'
    ) THEN
        ALTER TABLE products ADD COLUMN geo_data JSONB DEFAULT '{"keyTakeaways": [], "entities": []}'::jsonb;
    END IF;
END $$;

-- Add SEO fields to categories table
DO $$
BEGIN
    -- SEO Title
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'seo_title'
    ) THEN
        ALTER TABLE categories ADD COLUMN seo_title TEXT;
    END IF;
    
    -- SEO Description
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'seo_description'
    ) THEN
        ALTER TABLE categories ADD COLUMN seo_description TEXT;
    END IF;
    
    -- SEO Keywords
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'seo_keywords'
    ) THEN
        ALTER TABLE categories ADD COLUMN seo_keywords TEXT[] DEFAULT '{}';
    END IF;
    
    -- FAQ field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'faq'
    ) THEN
        ALTER TABLE categories ADD COLUMN faq JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- GEO data field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'geo_data'
    ) THEN
        ALTER TABLE categories ADD COLUMN geo_data JSONB DEFAULT '{"keyTakeaways": [], "entities": []}'::jsonb;
    END IF;
END $$;

-- Create indexes for SEO fields
CREATE INDEX IF NOT EXISTS idx_products_faq ON products USING GIN(faq);
CREATE INDEX IF NOT EXISTS idx_products_geo_data ON products USING GIN(geo_data);
CREATE INDEX IF NOT EXISTS idx_categories_seo_title ON categories(seo_title);
CREATE INDEX IF NOT EXISTS idx_categories_faq ON categories USING GIN(faq);
CREATE INDEX IF NOT EXISTS idx_categories_geo_data ON categories USING GIN(geo_data);
