ALTER TABLE public.owner_store_secrets
  ADD COLUMN IF NOT EXISTS supabase_anon_key TEXT,
  ADD COLUMN IF NOT EXISTS supabase_legacy_url TEXT,
  ADD COLUMN IF NOT EXISTS supabase_legacy_anon_key TEXT;
