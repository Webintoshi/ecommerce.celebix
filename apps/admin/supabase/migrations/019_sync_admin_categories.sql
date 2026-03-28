-- =====================================================
-- SYNC ADMIN CATEGORIES - Add missing categories from admin panel
-- This migration ensures DB has all categories defined in admin panel
-- =====================================================

-- First, let's see what categories currently exist
DO $$
DECLARE
    existing_slugs TEXT[];
BEGIN
    SELECT ARRAY_AGG(slug) INTO existing_slugs FROM categories WHERE is_active = true;
    RAISE NOTICE 'Existing category slugs: %', existing_slugs;
END $$;

-- Insert missing categories that exist in admin panel but not in DB
-- Note: In PostgreSQL, escape single quotes with double single quotes (''), not backslash
INSERT INTO categories (
    name, 
    slug, 
    description, 
    image, 
    icon, 
    sort_order, 
    is_active,
    seo_title,
    seo_description,
    seo_keywords,
    faq,
    geo_data
) VALUES 
-- 1. Fıstık Ezmesi (should exist but ensure it has SEO data)
(
    'Fıstık Ezmesi', 
    'fistik-ezmesi', 
    'Doğal fıstık ezmesi, sporcu besini olarak idealdir. Protein deposu, doğal enerji kaynağı.',
    '/fistik_ezmesi_kategori_gorsel.webp',
    E'🥜',
    1,
    true,
    'Fıstık Ezmesi Çeşitleri | Celebix E-ticaret',
    'En kaliteli doğal fıstık ezmesi çeşitleri. %100 fıstık, şekersiz, katkısız. Sporcu fıstık ezmesi, kakaolu ve sade seçenekler. Hemen sipariş verin!',
    ARRAY['fıstık ezmesi', 'doğal fıstık ezmesi', 'sporcu fıstık ezmesi', 'şekersiz fıstık ezmesi'],
    '[{"question": "Fıstık ezmesi sağlıklı mı?", "answer": "Evet, doğal fıstık ezmesi protein ve sağlıklı yağlar açısından zengindir. Katkısız ürünlerimiz sağlıklı beslenmenin vazgeçilmezidir."}, {"question": "Sporcu fıstık ezmesi nedir?", "answer": "Yüksek protein içeriğiyle sporcular için özel formüle edilmiş fıstık ezmesi çeşididir."}]'::jsonb,
    '{"keyTakeaways": ["Celebix E-ticaret katalogunda dogal fistik ezmesi cesitleri bulunur.", "Şeker ilavesiz ve katkısız üretim.", "Sporcular için ideal protein kaynağı."], "entities": ["ProductCategory", "Food", "HealthFood"]}'::jsonb
),

-- 2. Badem Ezmesi (NEW - was in admin panel but not in DB)
(
    'Badem Ezmesi',
    'badem-ezmesi',
    'Premium badem ezmesi, vegan ve glutensiz seçenekler. Taze öğütülmüş.',
    '/badem_ezmesi_kategori.webp',
    E'🌰',
    2,
    true,
    'Badem Ezmesi Çeşitleri | Celebix E-ticaret',
    'Premium kalite badem ezmesi. Taze öğütülmüş, doğal, şekersiz badem ezmesi seçenekleri. Vegan ve glutensiz. Türkiye geneli ücretsiz kargo.',
    ARRAY['badem ezmesi', 'doğal badem ezmesi', 'vegan badem ezmesi', 'glutensiz badem ezmesi'],
    '[{"question": "Badem ezmesi vegan mı?", "answer": "Evet, tüm badem ezmesi ürünlerimiz vegan dostudur. Hayvansal içerik içermez."}]'::jsonb,
    '{"keyTakeaways": ["Vegan ve glutensiz seçenekler.", "Taze öğütülmüş premium kalite.", "E vitamini ve antioksidan deposu."], "entities": ["ProductCategory", "VeganFood", "HealthFood"]}'::jsonb
),

-- 3. Fındık Ezmesi (should exist but ensure it has SEO data)
(
    'Fındık Ezmesi',
    'findik-ezmesi',
    'Karadeniz fındığından üretilen doğal fındık ezmesi.',
    '/Findik_Ezmeleri_Kategorisi.webp',
    E'🌰',
    3,
    true,
    'Fındık Ezmesi Çeşitleri | Celebix E-ticaret',
    'Gerçek Karadeniz fındığından hazırlanan doğal fındık ezmesi. Şekersiz, katkısız, %100 fındık. Kahvaltı ve atıştırmalık için ideal.',
    ARRAY['fındık ezmesi', 'karadeniz fındığı', 'doğal fındık ezmesi', 'şekersiz fındık ezmesi'],
    '[]'::jsonb,
    '{"keyTakeaways": ["Gerçek Karadeniz fındığı kullanılır.", "Kahvaltı ve atıştırmalık için ideal."], "entities": ["ProductCategory", "Food"]}'::jsonb
),

-- 4. Antep Fıstığı Ezmesi (NEW - was in admin panel but not in DB)
(
    'Antep Fıstığı Ezmesi',
    'antep-fistigi-ezmesi',
    'Gaziantep''in eşsiz lezzeti, premium Antep fıstığı ezmesi.',
    '/antep_fistigi_ezmesi_kategori.webp',
    E'💚',
    4,
    true,
    'Antep Fıstığı Ezmesi | Celebix E-ticaret',
    'Gaziantep''in ünlü Antep fıstığından hazırlanan premium ezme. Yeşil fıstık, doğal, katkısız. Tatlı ve tuzlu tarifler için mükemmel.',
    ARRAY['antep fıstığı ezmesi', 'gaziantep fıstığı', 'yeşil fıstık ezmesi', 'premium fıstık ezmesi'],
    '[]'::jsonb,
    '{"keyTakeaways": ["Gaziantep''in orijinal Antep fıstığı.", "Tatlı ve tuzlu tarifler için ideal."], "entities": ["ProductCategory", "PremiumFood"]}'::jsonb
),

-- 5. Karma Ezmeler (NEW - was in admin panel but not in DB)
(
    'Karma Ezmeler',
    'karma-ezmeler',
    'Farklı kuruyemişlerin mükemmel uyumu.',
    '/karma_ezmeler_kategori.webp',
    E'🥜',
    5,
    true,
    'Karma Ezme Çeşitleri | Celebix E-ticaret',
    'Farklı kuruyemişlerin birbirleriyle mükemmel uyumu. Karma ezmeler: fıstık-badem, fındık-kakao ve daha fazlası. Yeni tatlar keşfedin!',
    ARRAY['karma ezme', 'karışık ezme', 'fıstık badem karışımı', 'mix ezme'],
    '[]'::jsonb,
    '{"keyTakeaways": ["Farklı kuruyemişlerin uyumu.", "Benzersiz tat deneyimi."], "entities": ["ProductCategory", "MixedFood"]}'::jsonb
)

-- Update existing records if they exist, insert if not
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    image = EXCLUDED.image,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    seo_title = EXCLUDED.seo_title,
    seo_description = EXCLUDED.seo_description,
    seo_keywords = EXCLUDED.seo_keywords,
    faq = EXCLUDED.faq,
    geo_data = EXCLUDED.geo_data,
    updated_at = NOW();

-- Verify the sync
DO $$
DECLARE
    category_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO category_count FROM categories WHERE is_active = true;
    RAISE NOTICE 'Total active categories after sync: %', category_count;
    
    -- List all categories
    RAISE NOTICE 'Categories:';
    FOR category_record IN 
        SELECT name, slug, seo_title IS NOT NULL as has_seo 
        FROM categories 
        WHERE is_active = true 
        ORDER BY sort_order
    LOOP
        RAISE NOTICE '  - % (%): SEO=%', 
            category_record.name, 
            category_record.slug,
            category_record.has_seo;
    END LOOP;
END $$;

-- Create index for slug lookups if not exists
CREATE INDEX IF NOT EXISTS idx_categories_slug_active 
ON categories(slug) 
WHERE is_active = true;

-- Update RLS policies to ensure admin access
DROP POLICY IF EXISTS "Service role can manage categories" ON categories;
CREATE POLICY "Service role can manage categories" 
ON categories FOR ALL 
USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated users can manage categories" ON categories;
CREATE POLICY "Authenticated users can manage categories"
ON categories FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
