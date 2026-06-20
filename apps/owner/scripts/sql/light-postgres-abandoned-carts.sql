-- Celebix light_postgres abandoned cart restore
-- Non-destructive/idempotent: creates or extends public.abandoned_carts only.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.celebix_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.abandoned_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text,
  store_slug text,
  cart_id text,
  session_id text,
  customer_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  is_anonymous boolean NOT NULL DEFAULT true,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric(12,2) NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  recovered boolean NOT NULL DEFAULT false,
  abandoned_at timestamptz,
  checkout_started_at timestamptz,
  recovered_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.abandoned_carts
  ADD COLUMN IF NOT EXISTS store_id text,
  ADD COLUMN IF NOT EXISTS store_slug text,
  ADD COLUMN IF NOT EXISTS cart_id text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS recovered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS abandoned_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'abandoned_carts_status_check'
      AND conrelid = 'public.abandoned_carts'::regclass
  ) THEN
    ALTER TABLE public.abandoned_carts
      ADD CONSTRAINT abandoned_carts_status_check
      CHECK (status IN ('active', 'abandoned', 'recovered', 'cleared')) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_store_slug ON public.abandoned_carts(store_slug);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_session_id ON public.abandoned_carts(session_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_cart_id ON public.abandoned_carts(cart_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_customer_id ON public.abandoned_carts(customer_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email ON public.abandoned_carts(email);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_status ON public.abandoned_carts(status);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_last_activity ON public.abandoned_carts(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_updated_at ON public.abandoned_carts(updated_at DESC);

DROP TRIGGER IF EXISTS abandoned_carts_set_updated_at ON public.abandoned_carts;
CREATE TRIGGER abandoned_carts_set_updated_at
BEFORE UPDATE ON public.abandoned_carts
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();
