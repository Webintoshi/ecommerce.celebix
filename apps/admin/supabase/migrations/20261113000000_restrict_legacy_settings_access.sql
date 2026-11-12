BEGIN;

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Settings are viewable by everyone" ON public.settings;
DROP POLICY IF EXISTS "Authenticated can update settings" ON public.settings;
DROP POLICY IF EXISTS "Anyone can read settings" ON public.settings;
DROP POLICY IF EXISTS "Anyone can insert settings" ON public.settings;
DROP POLICY IF EXISTS "Anyone can update settings" ON public.settings;

-- Storefront settings are read by the server and projected by the public storefront APIs.
REVOKE ALL PRIVILEGES ON TABLE public.settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.settings TO service_role;

COMMIT;
