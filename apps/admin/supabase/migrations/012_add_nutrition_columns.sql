-- =====================================================
-- BESİN DEĞERLERİ TABLOSU EKLENMESİ
-- Ürün ekleme formunda girilen makro besin değerleri için
-- =====================================================

-- Makro besin değerleri (100g veya serving başına)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS calories DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS protein DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS carbs DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS fat DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS fiber DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS sugar DECIMAL(10, 2) DEFAULT 0;

-- Doymuş yağ (satürat)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS saturated_fat DECIMAL(10, 2) DEFAULT 0;

-- Sodyum
ALTER TABLE products
ADD COLUMN IF NOT EXISTS sodium DECIMAL(10, 2) DEFAULT 0;

-- INDEX'LER
CREATE INDEX IF NOT EXISTS idx_products_calories ON products(calories);
CREATE INDEX IF NOT EXISTS idx_products_protein ON products(protein);
CREATE INDEX IF NOT EXISTS idx_products_vegan ON products(vegan);
CREATE INDEX IF NOT EXISTS idx_products_gluten_free ON products(gluten_free);
CREATE INDEX IF NOT EXISTS idx_products_sugar_free ON products(sugar_free);
CREATE INDEX IF NOT EXISTS idx_products_high_protein ON products(high_protein);

-- =====================================================
-- ÜRÜN DURUMU ENUM DEĞERLERİ
-- =====================================================

-- Mevcut status alanını genişlet
ALTER TABLE products
ALTER COLUMN status TYPE TEXT;

-- Ürün görünürlüğü (aktif/pasif)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Ön izleme modu
ALTER TABLE products
ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT false;

-- =====================================================
-- İNDEKS OPTİMİZASYONU
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_products_category_subcategory ON products(category, subcategory);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at DESC);
