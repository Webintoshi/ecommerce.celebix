BEGIN;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
DROP POLICY IF EXISTS "Public can read products" ON public.products;
DROP POLICY IF EXISTS "Public can read published products" ON public.products;
CREATE POLICY "Public can read published products" ON public.products
    FOR SELECT TO anon, authenticated
    USING (
        is_active IS TRUE
        AND is_draft IS DISTINCT FROM TRUE
        AND (status = 'published' OR status IS NULL)
    );

DROP POLICY IF EXISTS "Product variants are viewable by everyone" ON public.product_variants;
DROP POLICY IF EXISTS "Public can view product variants" ON public.product_variants;
DROP POLICY IF EXISTS "Public can read product_variants" ON public.product_variants;
DROP POLICY IF EXISTS "Public can read variants of published products" ON public.product_variants;
CREATE POLICY "Public can read variants of published products" ON public.product_variants
    FOR SELECT TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.products AS product
            WHERE product.id = product_variants.product_id
              AND product.is_active IS TRUE
              AND product.is_draft IS DISTINCT FROM TRUE
              AND (product.status = 'published' OR product.status IS NULL)
        )
    );

COMMIT;
