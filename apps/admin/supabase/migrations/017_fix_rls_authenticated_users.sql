-- =====================================================
-- RLS Policy Fix: Add INSERT/UPDATE/DELETE for authenticated users
-- =====================================================

-- Products: Add authenticated users can manage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage products' AND tablename = 'products'
    ) THEN
        CREATE POLICY "Authenticated users can manage products"
        ON products FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- Product variants: Add authenticated users can manage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage product_variants' AND tablename = 'product_variants'
    ) THEN
        CREATE POLICY "Authenticated users can manage product_variants"
        ON product_variants FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- Categories: Add authenticated users can manage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage categories' AND tablename = 'categories'
    ) THEN
        CREATE POLICY "Authenticated users can manage categories"
        ON categories FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- Product discount rules: Add authenticated users can manage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage product_discount_rules' AND tablename = 'product_discount_rules'
    ) THEN
        CREATE POLICY "Authenticated users can manage product_discount_rules"
        ON product_discount_rules FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- Blog posts: Add authenticated users can manage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage blog_posts' AND tablename = 'blog_posts'
    ) THEN
        CREATE POLICY "Authenticated users can manage blog_posts"
        ON blog_posts FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;
