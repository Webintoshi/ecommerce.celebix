-- =====================================================
-- LOGTO ADMIN AUTH BRIDGE (PREP ONLY)
-- Prepared for DeryCraft 2 admin auth pilot.
-- Do not auto-apply during pilot skeleton phases.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,
  primary_email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.auth_provider_links (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'logto'),
  provider_subject TEXT NOT NULL,
  email_snapshot TEXT,
  legacy_supabase_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_auth_provider_links_user_id
  ON public.auth_provider_links(user_id);

CREATE TABLE IF NOT EXISTS public.store_user_roles (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  store_slug TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'product_manager', 'content_creator', 'order_manager')),
  task_definition TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, store_slug, role)
);

CREATE INDEX IF NOT EXISTS idx_store_user_roles_store_slug
  ON public.store_user_roles(store_slug);

CREATE INDEX IF NOT EXISTS idx_store_user_roles_user_id
  ON public.store_user_roles(user_id);
