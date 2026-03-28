-- =====================================================
-- FIX: Product Variants RLS Policies
-- product_variants tablosu için SELECT policy eksik
-- =====================================================

-- Önce RLS'i etkinleştir (eğer kapalıysa)
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- Mevcut policy'leri temizle (varsa)
DROP POLICY IF EXISTS "Public can view product variants" ON product_variants;
DROP POLICY IF EXISTS "Service role can manage product variants" ON product_variants;
DROP POLICY IF EXISTS "Authenticated users can manage product variants" ON product_variants;

-- Herkes görüntüleyebilir (anon ve authenticated)
CREATE POLICY "Public can view product variants" 
ON product_variants FOR SELECT 
USING (true);

-- Service role tam yetki
CREATE POLICY "Service role can manage product variants" 
ON product_variants FOR ALL 
USING (auth.role() = 'service_role');

-- Admin kullanıcılar tam yetki
CREATE POLICY "Authenticated users can manage product variants" 
ON product_variants FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('admin', 'manager')
    )
);

-- =====================================================
-- Ayrıca products tablosunun RLS policy'lerini de kontrol et
-- =====================================================

-- Products için public SELECT policy (eğer yoksa)
DROP POLICY IF EXISTS "Public can view active products" ON products;

CREATE POLICY "Public can view active products" 
ON products FOR SELECT 
USING (is_active = true);
