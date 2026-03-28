-- =====================================================
-- CATEGORIES TABLE - Dinamik Kategori Sistemi
-- =====================================================

-- Once kolon var mi kontrol et, yoksa ekle
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE categories ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'sort_order'
    ) THEN
        ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'icon'
    ) THEN
        ALTER TABLE categories ADD COLUMN icon TEXT DEFAULT '📦';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'image'
    ) THEN
        ALTER TABLE categories ADD COLUMN image TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE categories ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order);

-- RLS Enable
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Public can view active categories" ON categories;
CREATE POLICY "Public can view active categories" 
ON categories FOR SELECT 
USING (is_active = true);

DROP POLICY IF EXISTS "Service role can manage categories" ON categories;
CREATE POLICY "Service role can manage categories" 
ON categories FOR ALL 
USING (auth.role() = 'service_role');

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_categories_updated_at();

-- Ornek kategoriler ekle
INSERT INTO categories (name, slug, description, image, icon, sort_order, is_active) VALUES
('Fistik Ezmeleri', 'fistik-ezmesi', 'Dogal fistik ezmeleri', '/fistik_ezmesi_kategori_gorsel.webp', 'peanut', 1, true),
('Findik Ezmeleri', 'findik-ezmesi', 'Karadeniz findik ezmeleri', '/Findik_Ezmeleri_Kategorisi.webp', 'hazelnut', 2, true),
('Kuruyemisler', 'kuruyemis', 'Dogal kuruyemisler', '/KURUYEMIS_KATEGORISI_BANNER.svg', 'nuts', 3, true)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    image = EXCLUDED.image,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;
