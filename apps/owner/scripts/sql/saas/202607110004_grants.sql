-- Phase 2A1 least-privilege table/column and function grants.
-- Apply after the foundation migration and before catalog assertions.

BEGIN;

DO $phase2a1_grants_precondition$
BEGIN
  IF pg_catalog.to_regnamespace('saas') IS NULL THEN
    RAISE EXCEPTION 'PHASE2A1_GRANT_PRECONDITION_FAILED: schema saas is missing';
  END IF;
END
$phase2a1_grants_precondition$;

SET LOCAL ROLE celebix_saas_owner;

REVOKE ALL ON SCHEMA saas FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA saas FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA saas FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE celebix_saas_owner IN SCHEMA saas
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE celebix_saas_owner IN SCHEMA saas
  REVOKE ALL ON FUNCTIONS FROM PUBLIC;

GRANT USAGE ON SCHEMA saas TO celebix_saas_bootstrap;
GRANT USAGE ON SCHEMA saas TO celebix_saas_app;
GRANT USAGE ON SCHEMA saas TO celebix_saas_host_resolver;

GRANT SELECT (
  id, issuer, subject, email, email_verified, created_at, updated_at
) ON saas.principals TO celebix_saas_bootstrap;
GRANT INSERT (
  id, issuer, subject, email, email_verified, created_at, updated_at
) ON saas.principals TO celebix_saas_bootstrap;
GRANT UPDATE (email, email_verified, updated_at)
  ON saas.principals TO celebix_saas_bootstrap;

GRANT SELECT (
  id, name, slug, status, locale, currency, theme_key, created_at, updated_at
) ON saas.stores TO celebix_saas_bootstrap;
GRANT INSERT (
  id, name, slug, status, locale, currency, theme_key, created_at, updated_at
) ON saas.stores TO celebix_saas_bootstrap;

GRANT SELECT (
  id, store_id, normalized_hostname, domain_type, status, canonical,
  cache_version, created_at, updated_at
) ON saas.domains TO celebix_saas_bootstrap;
GRANT INSERT (
  id, store_id, normalized_hostname, domain_type, status, canonical,
  cache_version, created_at, updated_at
) ON saas.domains TO celebix_saas_bootstrap;

GRANT SELECT (
  id, principal_id, store_id, role, status, created_at, updated_at
) ON saas.memberships TO celebix_saas_bootstrap;
GRANT INSERT (
  id, principal_id, store_id, role, status, created_at, updated_at
) ON saas.memberships TO celebix_saas_bootstrap;

GRANT SELECT (
  id, plan_code, version, status, valid_from, valid_until, created_at, updated_at
) ON saas.plans TO celebix_saas_bootstrap;
GRANT SELECT (plan_id, feature_key, feature_ordinal, enabled)
  ON saas.plan_features TO celebix_saas_bootstrap;
GRANT SELECT (plan_id, limit_key, limit_ordinal, limit_value, effective_limit)
  ON saas.plan_limits TO celebix_saas_bootstrap;

GRANT SELECT (
  id, store_id, plan_id, plan_code, plan_version, status,
  valid_from, valid_until, created_at, updated_at
) ON saas.subscriptions TO celebix_saas_bootstrap;
GRANT INSERT (
  id, store_id, plan_id, plan_code, plan_version, status,
  valid_from, valid_until, created_at, updated_at
) ON saas.subscriptions TO celebix_saas_bootstrap;

GRANT SELECT (id, store_id, key, value, created_at, updated_at)
  ON saas.store_settings TO celebix_saas_bootstrap;
GRANT INSERT (id, store_id, key, value, created_at, updated_at)
  ON saas.store_settings TO celebix_saas_bootstrap;

GRANT SELECT (
  id, idempotency_key, payload_fingerprint, status, result_store_id,
  result_domain_id, result_membership_id, result_principal_id, result_subscription_id,
  result_plan_id, result_payload, requested_at, committed_at, created_at, updated_at
) ON saas.tenant_operations TO celebix_saas_bootstrap;
GRANT INSERT (
  id, idempotency_key, payload_fingerprint, status,
  requested_at, created_at, updated_at
) ON saas.tenant_operations TO celebix_saas_bootstrap;
GRANT UPDATE (
  status, result_store_id, result_domain_id, result_membership_id, result_principal_id,
  result_subscription_id, result_plan_id, result_payload, committed_at, updated_at
) ON saas.tenant_operations TO celebix_saas_bootstrap;

GRANT SELECT (id, issuer, subject, email, email_verified, created_at, updated_at)
  ON saas.principals TO celebix_saas_app;
GRANT SELECT (id, name, slug, status, locale, currency, theme_key, created_at, updated_at)
  ON saas.stores TO celebix_saas_app;
GRANT UPDATE (name, locale, currency, theme_key, updated_at)
  ON saas.stores TO celebix_saas_app;
GRANT SELECT (
  id, store_id, normalized_hostname, domain_type, status, canonical,
  cache_version, created_at, updated_at
) ON saas.domains TO celebix_saas_app;
GRANT SELECT (id, principal_id, store_id, role, status, created_at, updated_at)
  ON saas.memberships TO celebix_saas_app;
GRANT SELECT (id, plan_code, version, status, valid_from, valid_until, created_at, updated_at)
  ON saas.plans TO celebix_saas_app;
GRANT SELECT (plan_id, feature_key, feature_ordinal, enabled)
  ON saas.plan_features TO celebix_saas_app;
GRANT SELECT (plan_id, limit_key, limit_ordinal, limit_value, effective_limit)
  ON saas.plan_limits TO celebix_saas_app;
GRANT SELECT (
  id, store_id, plan_id, plan_code, plan_version, status,
  valid_from, valid_until, created_at, updated_at
) ON saas.subscriptions TO celebix_saas_app;
GRANT SELECT (id, store_id, key, value, created_at, updated_at)
  ON saas.store_settings TO celebix_saas_app;
GRANT INSERT (id, store_id, key, value, created_at, updated_at)
  ON saas.store_settings TO celebix_saas_app;
GRANT UPDATE (value, updated_at) ON saas.store_settings TO celebix_saas_app;
GRANT DELETE ON saas.store_settings TO celebix_saas_app;
GRANT SELECT (
  id, status, result_store_id, result_domain_id, result_membership_id,
  result_principal_id, result_plan_id, result_payload, committed_at, created_at, updated_at
) ON saas.tenant_operations TO celebix_saas_app;

GRANT EXECUTE ON FUNCTION saas.has_active_membership(uuid, text[])
  TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.resolve_store_host(text)
  TO celebix_saas_host_resolver;

-- Workflow/session and observability roles are deliberate placeholders in 2A1.
-- They receive no schema usage, tenant-table access, bootstrap authority, or raw PII access.

COMMIT;
