-- =====================================================
-- PAGES TABLE - Static Pages SEO Management
-- =====================================================

-- Create pages table
CREATE TABLE IF NOT EXISTS pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL DEFAULT '',
    schema_type TEXT NOT NULL DEFAULT 'WebPage',
    icon TEXT,
    
    -- SEO Fields
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT[] DEFAULT '{}',
    
    -- Structured Data
    faq JSONB DEFAULT '[]'::jsonb,
    geo_data JSONB DEFAULT '{"keyTakeaways": [], "entities": []}'::jsonb,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_active ON pages(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pages_sort ON pages(sort_order);
CREATE INDEX IF NOT EXISTS idx_pages_faq ON pages USING GIN(faq);
CREATE INDEX IF NOT EXISTS idx_pages_geo ON pages USING GIN(geo_data);

-- RLS
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Public can view active pages" ON pages;
CREATE POLICY "Public can view active pages" 
ON pages FOR SELECT 
USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated users can manage pages" ON pages;
CREATE POLICY "Authenticated users can manage pages"
ON pages FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_pages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_pages_updated_at ON pages;
CREATE TRIGGER update_pages_updated_at
    BEFORE UPDATE ON pages
    FOR EACH ROW
    EXECUTE FUNCTION update_pages_updated_at();

-- Seed default pages
INSERT INTO pages (name, slug, schema_type, icon, seo_title, seo_description, seo_keywords, faq, geo_data, is_active, sort_order) VALUES
(
    'Ana Sayfa',
    '',
    'WebSite',
    'Home',
    'Celebix E-ticaret | Ana Sayfa',
    'Celebix E-ticaret vitrini, urunler, kategoriler ve icerikleri tek noktada sunar.',
    ARRAY['doğal ezme', 'fıstık ezmesi', 'badem ezmesi', 'fındık ezmesi'],
    '[]'::jsonb,
    '{"keyTakeaways": [], "entities": ["WebSite", "Organization"]}'::jsonb,
    true,
    1
),
(
    'Ürünler',
    'urunler',
    'CollectionPage',
    'Package',
    'Tum Urunler | Celebix E-ticaret',
    'Celebix E-ticaret katalogundaki tum urunleri kesfedin.',
    ARRAY['ezme çeşitleri', 'doğal ezme', 'kuruyemiş ezmesi'],
    '[]'::jsonb,
    '{"keyTakeaways": [], "entities": ["CollectionPage"]}'::jsonb,
    true,
    2
),
(
    'İletişim',
    'iletisim',
    'ContactPage',
    'Mail',
    'Iletisim | Celebix E-ticaret',
    'Sorulariniz icin Celebix E-ticaret destek ekibiyle iletisime gecin.',
    ARRAY['iletişim', 'müşteri hizmetleri', 'destek'],
    '[]'::jsonb,
    '{"keyTakeaways": [], "entities": ["ContactPage"]}'::jsonb,
    true,
    3
),
(
    'Hakkımızda',
    'hakkimizda',
    'AboutPage',
    'Info',
    'Hakkimizda | Celebix E-ticaret',
    'Celebix E-ticaret markasinin hikayesi, degerleri ve operasyon yaklasimi.',
    ARRAY['hakkımızda', 'celebix e-ticaret', 'doğal üretim'],
    '[]'::jsonb,
    '{"keyTakeaways": [], "entities": ["AboutPage"]}'::jsonb,
    true,
    4
),
(
    'SSS',
    'sss',
    'FAQPage',
    'HelpCircle',
    'Sikca Sorulan Sorular | Celebix E-ticaret',
    'Celebix E-ticaret urunleri, siparis, kargo ve iade surecleri hakkindaki sik sorular.',
    ARRAY['sss', 'sıkça sorulan sorular', 'yardım'],
    '[]'::jsonb,
    '{"keyTakeaways": [], "entities": ["FAQPage"]}'::jsonb,
    true,
    5
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    schema_type = EXCLUDED.schema_type,
    icon = EXCLUDED.icon,
    seo_title = EXCLUDED.seo_title,
    seo_description = EXCLUDED.seo_description,
    seo_keywords = EXCLUDED.seo_keywords,
    updated_at = NOW();

-- Verify
SELECT name, slug, seo_title IS NOT NULL as has_seo 
FROM pages 
WHERE is_active = true 
ORDER BY sort_order;
