CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  CREATE TYPE public.owner_user_role AS ENUM ('super_admin', 'affiliate_admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.owner_record_status AS ENUM ('draft', 'active', 'paused');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.storefront_launch_status AS ENUM ('not_started', 'scaffolded', 'active');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.owner_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role public.owner_user_role NOT NULL DEFAULT 'affiliate_admin',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.owner_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status public.owner_record_status NOT NULL DEFAULT 'draft',
  theme_key TEXT NOT NULL,
  theme_label TEXT,
  storefront_domain TEXT NOT NULL,
  admin_domain TEXT NOT NULL,
  support_email TEXT,
  support_phone TEXT,
  tagline TEXT,
  supabase_project_ref TEXT,
  supabase_url TEXT,
  r2_bucket_name TEXT,
  r2_public_url TEXT,
  r2_managed_domain TEXT,
  storefront_app_dir TEXT,
  storefront_status public.storefront_launch_status NOT NULL DEFAULT 'not_started',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.owner_store_metrics (
  store_id UUID PRIMARY KEY REFERENCES public.owner_stores(id) ON DELETE CASCADE,
  product_count INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  customer_count INTEGER NOT NULL DEFAULT 0,
  pending_order_count INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  average_order_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.owner_store_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.owner_profiles(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.owner_stores(id) ON DELETE CASCADE,
  commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, store_id)
);

CREATE TABLE IF NOT EXISTS public.owner_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.owner_profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS owner_stores_status_idx ON public.owner_stores(status);
CREATE INDEX IF NOT EXISTS owner_stores_storefront_status_idx ON public.owner_stores(storefront_status);
CREATE INDEX IF NOT EXISTS owner_store_access_profile_idx ON public.owner_store_access(profile_id);
CREATE INDEX IF NOT EXISTS owner_store_access_store_idx ON public.owner_store_access(store_id);
CREATE INDEX IF NOT EXISTS owner_audit_logs_actor_idx ON public.owner_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS owner_audit_logs_created_idx ON public.owner_audit_logs(created_at DESC);

CREATE OR REPLACE FUNCTION public.owner_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.owner_profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'
      AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.owner_has_store_access(target_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.owner_is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.owner_store_access
      WHERE profile_id = auth.uid()
        AND store_id = target_store_id
    );
$$;

CREATE OR REPLACE FUNCTION public.handle_owner_user_created()
RETURNS TRIGGER AS $$
DECLARE
  super_admin_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO super_admin_count
  FROM public.owner_profiles
  WHERE role = 'super_admin';

  INSERT INTO public.owner_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.owner_profiles.full_name),
    role = CASE
      WHEN public.owner_profiles.role = 'super_admin' THEN public.owner_profiles.role
      WHEN super_admin_count = 0 THEN 'super_admin'::public.owner_user_role
      ELSE public.owner_profiles.role
    END,
    updated_at = NOW();

  IF super_admin_count = 0 THEN
    UPDATE public.owner_profiles
    SET role = 'super_admin'
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_owner_auth_user_created ON auth.users;
CREATE TRIGGER on_owner_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_owner_user_created();

ALTER TABLE public.owner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_store_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_store_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access owner_profiles" ON public.owner_profiles;
CREATE POLICY "Service role full access owner_profiles"
ON public.owner_profiles
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Owner profiles own read" ON public.owner_profiles;
CREATE POLICY "Owner profiles own read"
ON public.owner_profiles
FOR SELECT
USING (id = auth.uid() OR public.owner_is_super_admin());

DROP POLICY IF EXISTS "Owner profiles own update" ON public.owner_profiles;
CREATE POLICY "Owner profiles own update"
ON public.owner_profiles
FOR UPDATE
USING (id = auth.uid() OR public.owner_is_super_admin())
WITH CHECK (id = auth.uid() OR public.owner_is_super_admin());

DROP POLICY IF EXISTS "Service role full access owner_stores" ON public.owner_stores;
CREATE POLICY "Service role full access owner_stores"
ON public.owner_stores
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Owner stores read access" ON public.owner_stores;
CREATE POLICY "Owner stores read access"
ON public.owner_stores
FOR SELECT
USING (public.owner_has_store_access(id));

DROP POLICY IF EXISTS "Owner stores super admin manage" ON public.owner_stores;
CREATE POLICY "Owner stores super admin manage"
ON public.owner_stores
FOR ALL
USING (public.owner_is_super_admin())
WITH CHECK (public.owner_is_super_admin());

DROP POLICY IF EXISTS "Service role full access owner_store_metrics" ON public.owner_store_metrics;
CREATE POLICY "Service role full access owner_store_metrics"
ON public.owner_store_metrics
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Owner metrics read access" ON public.owner_store_metrics;
CREATE POLICY "Owner metrics read access"
ON public.owner_store_metrics
FOR SELECT
USING (public.owner_has_store_access(store_id));

DROP POLICY IF EXISTS "Owner metrics super admin manage" ON public.owner_store_metrics;
CREATE POLICY "Owner metrics super admin manage"
ON public.owner_store_metrics
FOR ALL
USING (public.owner_is_super_admin())
WITH CHECK (public.owner_is_super_admin());

DROP POLICY IF EXISTS "Service role full access owner_store_access" ON public.owner_store_access;
CREATE POLICY "Service role full access owner_store_access"
ON public.owner_store_access
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Owner access own read" ON public.owner_store_access;
CREATE POLICY "Owner access own read"
ON public.owner_store_access
FOR SELECT
USING (profile_id = auth.uid() OR public.owner_is_super_admin());

DROP POLICY IF EXISTS "Owner access super admin manage" ON public.owner_store_access;
CREATE POLICY "Owner access super admin manage"
ON public.owner_store_access
FOR ALL
USING (public.owner_is_super_admin())
WITH CHECK (public.owner_is_super_admin());

DROP POLICY IF EXISTS "Service role full access owner_audit_logs" ON public.owner_audit_logs;
CREATE POLICY "Service role full access owner_audit_logs"
ON public.owner_audit_logs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Owner audit super admin read" ON public.owner_audit_logs;
CREATE POLICY "Owner audit super admin read"
ON public.owner_audit_logs
FOR SELECT
USING (public.owner_is_super_admin());

DROP TRIGGER IF EXISTS owner_profiles_updated_at ON public.owner_profiles;
CREATE TRIGGER owner_profiles_updated_at
BEFORE UPDATE ON public.owner_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS owner_stores_updated_at ON public.owner_stores;
CREATE TRIGGER owner_stores_updated_at
BEFORE UPDATE ON public.owner_stores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
