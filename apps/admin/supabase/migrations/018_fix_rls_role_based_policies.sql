-- =====================================================
-- RLS Policy Fix: Role-based access control
-- =====================================================
-- BU MIGRATION: 017 numaralı migration'ı GÜVENLİ hale getirir
-- Sadece yetkili roller (super_admin, product_manager) ürün yönetebilir
-- =====================================================

-- ÖNCE GÜVENSİZ POLICY'LERİ SİL
-- Products: Drop the unsafe policy
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage products' AND tablename = 'products'
    ) THEN
        DROP POLICY IF EXISTS "Authenticated users can manage products" ON products;
    END IF;
END $$;

-- Product variants: Drop the unsafe policy
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage product_variants' AND tablename = 'product_variants'
    ) THEN
        DROP POLICY IF EXISTS "Authenticated users can manage product_variants" ON product_variants;
    END IF;
END $$;

-- Categories: Drop the unsafe policy
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage categories' AND tablename = 'categories'
    ) THEN
        DROP POLICY IF EXISTS "Authenticated users can manage categories" ON categories;
    END IF;
END $$;

-- Product discount rules: Drop the unsafe policy
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage product_discount_rules' AND tablename = 'product_discount_rules'
    ) THEN
        DROP POLICY IF EXISTS "Authenticated users can manage product_discount_rules" ON product_discount_rules;
    END IF;
END $$;

-- Blog posts: Drop the unsafe policy
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage blog_posts' AND tablename = 'blog_posts'
    ) THEN
        DROP POLICY IF EXISTS "Authenticated users can manage blog_posts" ON blog_posts;
    END IF;
END $$;

-- =====================================================
-- GÜVENLİ POLICY'LERİ OLUŞTUR
-- =====================================================

-- Yardımcı fonksiyon: Kullanıcının rolünü kontrol et
CREATE OR REPLACE FUNCTION user_has_role(required_roles text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM profiles
        WHERE id = auth.uid()
          AND role::text = ANY(required_roles)
    );
$$;

-- Products: Sadece super_admin ve product_manager yönetebilir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Product managers can manage products' AND tablename = 'products'
    ) THEN
        CREATE POLICY "Product managers can manage products"
        ON products FOR ALL
        TO authenticated
        USING (user_has_role(ARRAY['super_admin', 'product_manager']))
        WITH CHECK (user_has_role(ARRAY['super_admin', 'product_manager']));
    END IF;
END $$;

-- Products: Herkes okuyabilir (public read)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Public can read products' AND tablename = 'products'
    ) THEN
        CREATE POLICY "Public can read products"
        ON products FOR SELECT
        TO public
        USING (true);
    END IF;
END $$;

-- Product variants: Sadece super_admin ve product_manager yönetebilir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Product managers can manage product_variants' AND tablename = 'product_variants'
    ) THEN
        CREATE POLICY "Product managers can manage product_variants"
        ON product_variants FOR ALL
        TO authenticated
        USING (user_has_role(ARRAY['super_admin', 'product_manager']))
        WITH CHECK (user_has_role(ARRAY['super_admin', 'product_manager']));
    END IF;
END $$;

-- Product variants: Herkes okuyabilir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Public can read product_variants' AND tablename = 'product_variants'
    ) THEN
        CREATE POLICY "Public can read product_variants"
        ON product_variants FOR SELECT
        TO public
        USING (true);
    END IF;
END $$;

-- Categories: Sadece super_admin ve product_manager yönetebilir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Product managers can manage categories' AND tablename = 'categories'
    ) THEN
        CREATE POLICY "Product managers can manage categories"
        ON categories FOR ALL
        TO authenticated
        USING (user_has_role(ARRAY['super_admin', 'product_manager']))
        WITH CHECK (user_has_role(ARRAY['super_admin', 'product_manager']));
    END IF;
END $$;

-- Categories: Herkes okuyabilir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Public can read categories' AND tablename = 'categories'
    ) THEN
        CREATE POLICY "Public can read categories"
        ON categories FOR SELECT
        TO public
        USING (true);
    END IF;
END $$;

-- Product discount rules: Sadece super_admin ve product_manager yönetebilir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Product managers can manage product_discount_rules' AND tablename = 'product_discount_rules'
    ) THEN
        CREATE POLICY "Product managers can manage product_discount_rules"
        ON product_discount_rules FOR ALL
        TO authenticated
        USING (user_has_role(ARRAY['super_admin', 'product_manager']))
        WITH CHECK (user_has_role(ARRAY['super_admin', 'product_manager']));
    END IF;
END $$;

-- Blog posts: Sadece super_admin ve content_creator yönetebilir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Content creators can manage blog_posts' AND tablename = 'blog_posts'
    ) THEN
        CREATE POLICY "Content creators can manage blog_posts"
        ON blog_posts FOR ALL
        TO authenticated
        USING (user_has_role(ARRAY['super_admin', 'content_creator']))
        WITH CHECK (user_has_role(ARRAY['super_admin', 'content_creator']));
    END IF;
END $$;

-- Blog posts: Herkes okuyabilir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Public can read blog_posts' AND tablename = 'blog_posts'
    ) THEN
        CREATE POLICY "Public can read blog_posts"
        ON blog_posts FOR SELECT
        TO public
        USING (true);
    END IF;
END $$;

-- Order items: Sadece super_admin ve order_manager yönetebilir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Order managers can manage order_items' AND tablename = 'order_items'
    ) THEN
        CREATE POLICY "Order managers can manage order_items"
        ON order_items FOR ALL
        TO authenticated
        USING (user_has_role(ARRAY['super_admin', 'order_manager']))
        WITH CHECK (user_has_role(ARRAY['super_admin', 'order_manager']));
    END IF;
END $$;

-- =====================================================
-- SONUÇ
-- =====================================================
-- Artık:
-- - Sadece yetkili kullanıcılar ürün/kategori yönetebilir
-- - Herkes ürünleri okuyabilir (public read)
-- - Role-based güvenlik sağlandı
-- =====================================================
