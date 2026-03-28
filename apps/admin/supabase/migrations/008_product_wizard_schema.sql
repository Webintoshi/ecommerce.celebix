-- =====================================================
-- PRODUCT WIZARD SCHEMA UPDATE
-- 7 Adımlı Ürün Ekleme Sistemi için Database Değişiklikleri
-- =====================================================

-- =====================================================
-- 1. GÖRSELLER + ALT TEXT (Adım 2)
-- =====================================================

-- Görseller için JSONB yapısı (URL + alt text + ana görsel + sıra)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS images_v2 JSONB DEFAULT '[]';

-- Örnek: [{"url": "...", "alt": "...", "is_primary": true, "sort_order": 0}]

-- =====================================================
-- 2. VARYANT GELİŞTİRMELERİ (Adım 3)
-- =====================================================

-- Varyant maliyeti (kar marjı hesaplama)
ALTER TABLE product_variants 
ADD COLUMN IF NOT EXISTS cost DECIMAL(10, 2);

-- Varyant grubu (Gramaj, Renk, Ebat vb.)
ALTER TABLE product_variants 
ADD COLUMN IF NOT EXISTS group_name TEXT;

-- Varyant görselleri (opsiyonel - belirli varyanta özel görseller)
ALTER TABLE product_variants 
ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';

-- KDV oranı (ürün bazlı, varsayılan %10)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS tax_rate INTEGER DEFAULT 10 CHECK (tax_rate IN (1, 8, 10, 20));

-- Varyant barkod/EAN (standartlaştırılmış)
ALTER TABLE product_variants 
ADD COLUMN IF NOT EXISTS barcode TEXT;

-- =====================================================
-- 3. İNDİRİM KURALLARI TABLOSU (Adım 3)
-- =====================================================

CREATE TABLE IF NOT EXISTS product_discount_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- "2+1 Kampanyası", "Toplu Alım İndirimi"
    type TEXT NOT NULL CHECK (type IN ('buy_x_get_y', 'bulk', 'percentage', 'fixed')),
    config JSONB NOT NULL, -- {"buy": 2, "get": 1} veya {"min_qty": 3, "discount_percent": 10}
    is_active BOOLEAN DEFAULT true,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    priority INTEGER DEFAULT 0, -- Birden fazla kural varsa hangisi önce uygulanacak
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- İndirim kuralları için index
CREATE INDEX IF NOT EXISTS idx_product_discount_rules_product ON product_discount_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_product_discount_rules_active ON product_discount_rules(is_active) WHERE is_active = true;

-- =====================================================
-- 4. SEO GELİŞTİRMELERİ (Adım 5)
-- =====================================================

-- Anahtar kelimeler (array)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS seo_keywords TEXT[] DEFAULT '{}';

-- OG Image (sosyal medya için özel görsel)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS og_image TEXT;

-- Canonical URL (opsiyonel)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS canonical_url TEXT;

-- Focus anahtar kelime (ana hedef keyword)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS seo_focus_keyword TEXT;

-- Robots meta (index/noindex, follow/nofollow)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS seo_robots TEXT DEFAULT 'index,follow' 
    CHECK (seo_robots IN ('index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'));

-- =====================================================
-- 5. STOK YÖNETİMİ (Adım 4)
-- =====================================================

-- Stok takip toggle
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS track_stock BOOLEAN DEFAULT true;

-- Düşük stok uyarı eşiği
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 10;

-- Depo lokasyonu
ALTER TABLE product_variants 
ADD COLUMN IF NOT EXISTS warehouse_location TEXT;

-- Stok birimi (adet, kg, lt vb.)
ALTER TABLE product_variants 
ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'adet' 
    CHECK (unit IN ('adet', 'kg', 'g', 'lt', 'ml', 'paket', 'kutu'));

-- Maksimum satın alma limiti (opsiyonel)
ALTER TABLE product_variants 
ADD COLUMN IF NOT EXISTS max_purchase_quantity INTEGER;

-- =====================================================
-- 6. BESİN DEĞERLERİ + ALERJEN (Adım 6)
-- =====================================================

-- Alerjen listesi (array)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS allergens TEXT[] DEFAULT '{}';

-- Besin değeri bazı (100g mi, servis başı mı?)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS nutrition_basis TEXT DEFAULT 'per_100g' 
    CHECK (nutrition_basis IN ('per_100g', 'per_serving'));

-- Servis gramajı
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS serving_size INTEGER DEFAULT 100;

-- Servis başına adet (örn: 2 adet kurabiye)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS serving_per_container INTEGER DEFAULT 1;

-- Vitamin ve mineraller (JSONB - esnek yapı)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS vitamins JSONB DEFAULT '{}';

-- Örnek: {"a": "15%", "c": "20%", "d": "10%", "calcium": "8%", "iron": "12%"}

-- İçindekiler listesi (zengin metin)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS ingredients TEXT;

-- Saklama koşulları
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS storage_conditions TEXT;

-- Son tüketim tarihi / Raf ömrü (gün cinsinden)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;

-- =====================================================
-- 7. TASLAK SİSTEMİ (Auto-save için)
-- =====================================================

-- Ürün taslağı mı?
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;

-- Yayınlanma tarihi (gelecekte yayınlama için)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Yayınlanma durumu
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' 
    CHECK (status IN ('draft', 'published', 'archived', 'scheduled'));

-- =====================================================
-- 8. ÜRÜN İLİŞKİLERİ (Çapraz satış için)
-- =====================================================

-- Benzer ürünler (cross-sell)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS related_products UUID[] DEFAULT '{}';

-- Tamamlayıcı ürünler (up-sell)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS complementary_products UUID[] DEFAULT '{}';

-- =====================================================
-- 9. ÜRÜN ÖZELLİKLERİ (Teknik detaylar)
-- =====================================================

-- Marka
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS brand TEXT;

-- Üretici/Ülke
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS country_of_origin TEXT DEFAULT 'Türkiye';

-- Ürün kodu/SKU (ana ürün için)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS sku TEXT;

-- GTIN/EAN (barkod)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS gtin TEXT;

-- Boyutlar (cm)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS dimensions JSONB DEFAULT '{}';
-- Örnek: {"width": 10, "height": 15, "depth": 8, "weight": 450}

-- =====================================================
-- INDEX'LER
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_is_draft ON products(is_draft);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at for discount rules
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ 
BEGIN 
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_product_discount_rules_updated_at 
BEFORE UPDATE ON product_discount_rules 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- MEVCUT VERİLERİ GÜNCELLE
-- =====================================================

-- Mevcut ürünleri published yap
UPDATE products 
SET status = 'published', 
    is_draft = false 
WHERE status IS NULL OR status = 'draft';

-- Mevcut görselleri yeni formata dönüştür (varsa)
-- Not: Bu sadece örnek, gerçek dönüşüm kod tarafında yapılacak
-- UPDATE products SET images_v2 = jsonb_build_array(
--     SELECT jsonb_build_object('url', img, 'alt', '', 'is_primary', row_number() OVER () = 1, 'sort_order', row_number() OVER () - 1)
--     FROM unnest(images) AS img
-- ) WHERE images IS NOT NULL AND array_length(images, 1) > 0;

-- =====================================================
-- RLS POLICY'LERİ
-- =====================================================

-- Discount rules için RLS
ALTER TABLE product_discount_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to product_discount_rules" 
ON product_discount_rules FOR ALL 
USING (auth.role() = 'service_role');

CREATE POLICY "Public can view active discount rules" 
ON product_discount_rules FOR SELECT 
USING (is_active = true);
