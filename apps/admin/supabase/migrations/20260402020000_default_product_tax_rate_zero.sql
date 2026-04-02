ALTER TABLE public.products
ALTER COLUMN tax_rate SET DEFAULT 0;

UPDATE public.products
SET tax_rate = 0
WHERE tax_rate IS NULL;

DO $$
DECLARE
    existing_constraint text;
BEGIN
    FOR existing_constraint IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'products'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%tax_rate%'
    LOOP
        EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT IF EXISTS %I', existing_constraint);
    END LOOP;
END $$;

ALTER TABLE public.products
ADD CONSTRAINT products_tax_rate_check
CHECK (tax_rate IN (0, 1, 8, 10, 20));
