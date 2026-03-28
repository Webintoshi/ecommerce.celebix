-- =====================================================
-- DIAGNOSTIC: Product Variants Sorunu Tespiti
-- =====================================================

-- 1. Önce ürünü bul
SELECT '=== 1. URUN BILGISI ===' as step;
SELECT id, name, slug, is_active, created_at 
FROM products 
WHERE slug = 'sekersiz-fistik-ezmesi-450g';

-- 2. Urun ID'sini al ve varyantlari kontrol et (eger varsa)
DO $$
DECLARE
    product_uuid UUID;
    variant_count INTEGER;
BEGIN
    -- Urunu bul
    SELECT id INTO product_uuid 
    FROM products 
    WHERE slug = 'sekersiz-fistik-ezmesi-450g';
    
    IF product_uuid IS NULL THEN
        RAISE NOTICE 'HATA: Urun bulunamadi! (slug: sekersiz-fistik-ezmesi-450g)';
    ELSE
        RAISE NOTICE 'Urun ID: %', product_uuid;
        
        -- Varyant sayisini kontrol et
        SELECT COUNT(*) INTO variant_count 
        FROM product_variants 
        WHERE product_id = product_uuid;
        
        RAISE NOTICE 'Varyant sayisi: %', variant_count;
    END IF;
END $$;

-- 3. RLS Policy kontrolu
SELECT '=== 2. RLS POLICY KONTROLU ===' as step;
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'product_variants';

-- 4. Tum varyantlari listele (product_id ile birlikte)
SELECT '=== 3. TUM VARYANTLAR ===' as step;
SELECT 
    pv.id,
    pv.product_id,
    pv.name,
    pv.price,
    pv.stock,
    p.name as product_name,
    p.slug as product_slug
FROM product_variants pv
LEFT JOIN products p ON pv.product_id = p.id
LIMIT 20;

-- 5. Supabase Anon role ile test
SELECT '=== 4. ANON ROLE TEST ===' as step;
SET ROLE anon;
SELECT COUNT(*) as anon_variant_count FROM product_variants;
RESET ROLE;

-- 6. Authenticated role ile test  
SELECT '=== 5. AUTHENTICATED ROLE TEST ===' as step;
SET ROLE authenticated;
SELECT COUNT(*) as auth_variant_count FROM product_variants;
RESET ROLE;

-- 7. Service role ile test
SELECT '=== 6. SERVICE ROLE TEST ===' as step;
SET ROLE service_role;
SELECT COUNT(*) as service_variant_count FROM product_variants;
RESET ROLE;
