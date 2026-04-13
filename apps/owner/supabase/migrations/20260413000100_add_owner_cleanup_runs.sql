CREATE TABLE IF NOT EXISTS public.owner_cleanup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  store_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('resolved', 'orphaned')),
  authority_deleted_at TIMESTAMPTZ,
  targets JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS owner_cleanup_runs_slug_idx ON public.owner_cleanup_runs(slug);
CREATE INDEX IF NOT EXISTS owner_cleanup_runs_status_idx ON public.owner_cleanup_runs(status);
CREATE INDEX IF NOT EXISTS owner_cleanup_runs_created_idx ON public.owner_cleanup_runs(created_at DESC);

ALTER TABLE public.owner_cleanup_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access owner_cleanup_runs" ON public.owner_cleanup_runs;
CREATE POLICY "Service role full access owner_cleanup_runs"
ON public.owner_cleanup_runs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Owner cleanup super admin read" ON public.owner_cleanup_runs;
CREATE POLICY "Owner cleanup super admin read"
ON public.owner_cleanup_runs
FOR SELECT
USING (public.owner_is_super_admin());

DROP TRIGGER IF EXISTS owner_cleanup_runs_updated_at ON public.owner_cleanup_runs;
CREATE TRIGGER owner_cleanup_runs_updated_at
BEFORE UPDATE ON public.owner_cleanup_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
