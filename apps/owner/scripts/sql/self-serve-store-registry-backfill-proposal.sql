-- PROPOSAL ONLY - DO NOT APPLY TO PRODUCTION YET
-- Phase 2C owner_stores -> self-serve registry backfill proposal.
-- This file is review material only. Do not run against production until backup, restore test,
-- SQL review, rollback review, and read-only parity dry-run gates are complete.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- 1) Backfill canonical store rows from legacy owner_stores.
-- Idempotency:
-- - slug remains unique.
-- - legacy_owner_store_id remains unique.
-- - retry updates only rows already sourced from legacy_owner_stores or matching the same legacy id.
-- Safety:
-- - owner_store_secrets are represented as boolean/count metadata only; no secret values are selected.
-- - owner_cleanup_runs are not inserted as stores. Slug tombstones remain a review input.
WITH source_owner_stores AS (
  SELECT
    os.id AS legacy_owner_store_id,
    os.slug,
    os.name,
    os.status::text AS owner_status,
    os.storefront_status::text AS storefront_status,
    os.theme_key,
    os.theme_label,
    os.storefront_domain,
    os.admin_domain,
    os.r2_bucket_name,
    os.r2_public_url,
    os.r2_managed_domain,
    os.storefront_app_dir,
    os.created_at,
    os.updated_at,
    COALESCE(
      NULLIF(os.metadata ->> 'databaseMode', ''),
      NULLIF(os.metadata #>> '{database,mode}', ''),
      NULLIF(os.metadata #>> '{lightPostgres,databaseMode}', ''),
      'light_postgres'
    ) AS raw_database_mode,
    EXISTS (
      SELECT 1
      FROM public.owner_store_secrets oss
      WHERE oss.store_id = os.id
    ) AS owner_secret_row_present,
    (
      SELECT count(*)::integer
      FROM public.owner_cleanup_runs ocr
      WHERE ocr.slug = os.slug
    ) AS cleanup_run_count
  FROM public.owner_stores os
),
mapped_stores AS (
  SELECT
    legacy_owner_store_id,
    slug,
    name,
    CASE
      WHEN owner_status = 'active' THEN 'active'
      WHEN owner_status = 'paused' THEN 'suspended'
      ELSE 'draft'
    END AS status,
    CASE
      WHEN owner_status = 'active' THEN 'ready'
      WHEN owner_status = 'paused' THEN 'pending_repair'
      ELSE 'not_started'
    END AS provisioning_status,
    CASE
      WHEN raw_database_mode IN ('light_postgres', 'full_supabase') THEN raw_database_mode
      ELSE 'light_postgres'
    END AS database_mode,
    jsonb_strip_nulls(
      jsonb_build_object(
        'phase', '2c',
        'sourceTable', 'owner_stores',
        'ownerStatus', owner_status,
        'storefrontStatus', storefront_status,
        'themeKey', theme_key,
        'themeLabel', theme_label,
        'storefrontDomain', storefront_domain,
        'adminDomain', admin_domain,
        'r2BucketNamePresent', r2_bucket_name IS NOT NULL,
        'r2PublicUrlPresent', r2_public_url IS NOT NULL,
        'r2ManagedDomainPresent', r2_managed_domain IS NOT NULL,
        'storefrontAppDirPresent', storefront_app_dir IS NOT NULL,
        'ownerSecretRowPresent', owner_secret_row_present,
        'cleanupRunCount', cleanup_run_count,
        'backfilledFrom', 'owner_stores',
        'backfilledAt', now()
      )
    ) AS metadata
  FROM source_owner_stores
)
INSERT INTO public.stores (
  legacy_owner_store_id,
  slug,
  name,
  status,
  provisioning_status,
  database_mode,
  source,
  source_ref,
  mirrored_at,
  metadata,
  created_at,
  updated_at
)
SELECT
  legacy_owner_store_id,
  slug,
  name,
  status,
  provisioning_status,
  database_mode,
  'legacy_owner_stores',
  legacy_owner_store_id::text,
  now(),
  metadata,
  now(),
  now()
FROM mapped_stores
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  provisioning_status = EXCLUDED.provisioning_status,
  database_mode = EXCLUDED.database_mode,
  legacy_owner_store_id = COALESCE(public.stores.legacy_owner_store_id, EXCLUDED.legacy_owner_store_id),
  source = EXCLUDED.source,
  source_ref = EXCLUDED.source_ref,
  mirrored_at = EXCLUDED.mirrored_at,
  metadata = public.stores.metadata || EXCLUDED.metadata,
  updated_at = now()
WHERE public.stores.source = 'legacy_owner_stores'
   OR public.stores.legacy_owner_store_id = EXCLUDED.legacy_owner_store_id;

-- 2) Backfill storefront/admin domains from owner_stores.
-- Expected count from Phase 2B inventory: 20 rows if all 10 stores have storefront_domain and admin_domain.
-- Admin domains are stored as domain_type = 'admin' and are reserved-policy exempt from storefront/custom checks.
WITH source_domains AS (
  SELECT
    s.id AS store_id,
    os.id AS legacy_owner_store_id,
    os.slug,
    os.storefront_domain AS hostname,
    'storefront' AS domain_type,
    os.status::text AS owner_status,
    true AS is_primary
  FROM public.owner_stores os
  JOIN public.stores s ON s.legacy_owner_store_id = os.id
  WHERE NULLIF(trim(os.storefront_domain), '') IS NOT NULL

  UNION ALL

  SELECT
    s.id AS store_id,
    os.id AS legacy_owner_store_id,
    os.slug,
    os.admin_domain AS hostname,
    'admin' AS domain_type,
    os.status::text AS owner_status,
    true AS is_primary
  FROM public.owner_stores os
  JOIN public.stores s ON s.legacy_owner_store_id = os.id
  WHERE NULLIF(trim(os.admin_domain), '') IS NOT NULL
),
mapped_domains AS (
  SELECT
    store_id,
    legacy_owner_store_id,
    slug,
    trim(hostname) AS hostname,
    lower(regexp_replace(regexp_replace(trim(hostname), '^https?://', '', 'i'), '/.*$', '')) AS hostname_normalized,
    domain_type,
    CASE WHEN owner_status = 'active' THEN 'active' ELSE 'pending' END AS status,
    is_primary,
    jsonb_build_object(
      'phase', '2c',
      'sourceTable', 'owner_stores',
      'legacyOwnerStoreId', legacy_owner_store_id,
      'legacySlug', slug,
      'reservedPolicyExempt', domain_type = 'admin'
    ) AS metadata
  FROM source_domains
)
INSERT INTO public.store_domains (
  store_id,
  hostname,
  hostname_normalized,
  domain_type,
  status,
  is_primary,
  source,
  source_ref,
  mirrored_at,
  metadata,
  created_at,
  updated_at
)
SELECT
  store_id,
  hostname,
  hostname_normalized,
  domain_type,
  status,
  is_primary,
  'legacy_owner_stores',
  legacy_owner_store_id::text || ':' || domain_type,
  now(),
  metadata,
  now(),
  now()
FROM mapped_domains
ON CONFLICT (hostname_normalized) DO UPDATE SET
  store_id = EXCLUDED.store_id,
  hostname = EXCLUDED.hostname,
  domain_type = EXCLUDED.domain_type,
  status = EXCLUDED.status,
  is_primary = EXCLUDED.is_primary,
  source = EXCLUDED.source,
  source_ref = EXCLUDED.source_ref,
  mirrored_at = EXCLUDED.mirrored_at,
  metadata = public.store_domains.metadata || EXCLUDED.metadata,
  updated_at = now()
WHERE public.store_domains.source = 'legacy_owner_stores'
   OR public.store_domains.source_ref = EXCLUDED.source_ref;

-- 3) Membership backfill is intentionally blocked in Phase 2C.
-- Do not infer store ownership from owner_profiles, email, slug, domain, or store name.
-- owner_store_access has 0 rows in the live inventory and owner DB lacks auth_principals,
-- auth_store_memberships, and store_user_roles.

-- 4) Read-only parity checks to run after a temporary-restore apply, before any production apply.
SELECT 'owner_store_count' AS check_name, count(*) AS value FROM public.owner_stores;
SELECT 'proposed_store_count' AS check_name, count(*) AS value FROM public.stores WHERE source = 'legacy_owner_stores';
SELECT status::text AS owner_status, count(*) FROM public.owner_stores GROUP BY status::text ORDER BY owner_status;
SELECT status AS proposed_status, count(*) FROM public.stores GROUP BY status ORDER BY proposed_status;
SELECT slug, count(*) FROM public.stores GROUP BY slug HAVING count(*) > 1;
SELECT hostname_normalized, count(*) FROM public.store_domains GROUP BY hostname_normalized HAVING count(*) > 1;
SELECT domain_type, count(*) FROM public.store_domains GROUP BY domain_type ORDER BY domain_type;
SELECT s.slug
FROM public.stores s
LEFT JOIN public.store_domains sd ON sd.store_id = s.id AND sd.domain_type = 'storefront'
WHERE s.source = 'legacy_owner_stores' AND sd.id IS NULL;
SELECT s.slug
FROM public.stores s
LEFT JOIN public.store_domains sd ON sd.store_id = s.id AND sd.domain_type = 'admin'
WHERE s.source = 'legacy_owner_stores' AND sd.id IS NULL;
SELECT store_id, domain_type, count(*)
FROM public.store_domains
WHERE is_primary = true AND deleted_at IS NULL
GROUP BY store_id, domain_type
HAVING count(*) > 1;
SELECT count(*) AS blocked_membership_count FROM public.store_memberships WHERE source = 'migration_mirror';

ROLLBACK;
