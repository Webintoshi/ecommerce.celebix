-- PROPOSAL ONLY - DO NOT APPLY TO PRODUCTION YET
-- Celebix self-serve store registry model.
-- Phase 2A refines the target schema for read-only mirror and migration review only.
-- Existing owner_stores, stores/registry.json, and stores/*/store.config.json remain the runtime authority until a separately approved cutover.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- stores: platform-wide store identity and lifecycle authority.
-- Existing source mapping: mirror owner_stores rows and local stores/*/store.config.json before moving writes.
-- Soft delete strategy: set deleted_at for historical removal; set disabled_at for operational suspension.
CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  legal_name text,
  status text NOT NULL DEFAULT 'draft',
  provisioning_status text NOT NULL DEFAULT 'not_started',
  database_mode text NOT NULL DEFAULT 'light_postgres',
  plan_key text,
  trial_ends_at timestamptz,
  primary_owner_principal_id uuid,
  legacy_owner_store_id uuid,
  source_system text NOT NULL DEFAULT 'owner_mirror',
  source_ref text,
  mirrored_at timestamptz,
  disabled_at timestamptz,
  deleted_at timestamptz,
  status_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stores_slug_unique UNIQUE (slug),
  CONSTRAINT stores_status_check CHECK (
    status IN ('draft', 'reserved', 'provisioning', 'ready', 'suspended', 'failed', 'cancelled')
  ),
  CONSTRAINT stores_provisioning_status_check CHECK (
    provisioning_status IN (
      'not_started',
      'queued',
      'running',
      'pending_auth',
      'pending_analytics',
      'pending_payment',
      'pending_dns',
      'pending_repair',
      'ready',
      'failed'
    )
  ),
  CONSTRAINT stores_database_mode_check CHECK (database_mode IN ('light_postgres', 'full_supabase')),
  CONSTRAINT stores_source_system_check CHECK (
    source_system IN ('owner_mirror', 'self_serve_onboarding', 'manual_import', 'support_import')
  )
);

CREATE INDEX IF NOT EXISTS stores_status_idx ON public.stores (status, provisioning_status);
CREATE INDEX IF NOT EXISTS stores_legacy_owner_store_idx ON public.stores (legacy_owner_store_id)
  WHERE legacy_owner_store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stores_active_idx ON public.stores (slug)
  WHERE deleted_at IS NULL;

-- store_domains: domain authority for platform subdomains, custom storefront domains, and legacy admin domains.
-- Existing source mapping: mirror store.config domains and owner_stores storefront/admin_domain.
-- Idempotency note: hostname is globally unique, so retries should upsert by hostname.
CREATE TABLE IF NOT EXISTS public.store_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  domain_type text NOT NULL DEFAULT 'platform_subdomain',
  status text NOT NULL DEFAULT 'pending',
  is_primary boolean NOT NULL DEFAULT false,
  verification_method text,
  verification_token_hash text,
  verified_at timestamptz,
  activated_at timestamptz,
  disabled_at timestamptz,
  deleted_at timestamptz,
  last_error text,
  source_system text NOT NULL DEFAULT 'owner_mirror',
  source_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_domains_hostname_unique UNIQUE (hostname),
  CONSTRAINT store_domains_type_check CHECK (
    domain_type IN ('platform_subdomain', 'custom_storefront', 'legacy_admin')
  ),
  CONSTRAINT store_domains_status_check CHECK (
    status IN ('pending', 'verifying', 'verified', 'active', 'failed', 'disabled')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS store_domains_one_primary_per_type_idx
  ON public.store_domains (store_id, domain_type)
  WHERE is_primary = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS store_domains_store_idx ON public.store_domains (store_id, status);
CREATE INDEX IF NOT EXISTS store_domains_active_hostname_idx ON public.store_domains (hostname)
  WHERE deleted_at IS NULL;

-- store_memberships: DB authority for store owners, admins, staff, support, and automation.
-- Logto provides identity only; this table grants store-level authorization.
-- Existing source mapping: owner_profiles/owner_store_access and store-local users/store_user_roles become mapping inputs only.
-- Customer auth_principals/auth_store_memberships must not grant admin access unless subject_type/role allow it.
CREATE TABLE IF NOT EXISTS public.store_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  principal_id uuid NOT NULL,
  subject_type text NOT NULL DEFAULT 'admin',
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  permission_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  invited_by_principal_id uuid,
  joined_at timestamptz,
  disabled_at timestamptz,
  removed_at timestamptz,
  source_system text NOT NULL DEFAULT 'migration_mirror',
  source_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_memberships_unique UNIQUE (store_id, principal_id, subject_type, role),
  CONSTRAINT store_memberships_subject_type_check CHECK (
    subject_type IN ('owner', 'admin', 'staff', 'support', 'customer', 'automation')
  ),
  CONSTRAINT store_memberships_role_check CHECK (
    role IN ('store_owner', 'store_admin', 'store_staff', 'support_admin', 'super_admin', 'storefront_customer', 'automation')
  ),
  CONSTRAINT store_memberships_status_check CHECK (status IN ('invited', 'active', 'disabled', 'removed'))
);

CREATE INDEX IF NOT EXISTS store_memberships_principal_idx ON public.store_memberships (principal_id, status);
CREATE INDEX IF NOT EXISTS store_memberships_store_role_idx ON public.store_memberships (store_id, role, status);
CREATE INDEX IF NOT EXISTS store_memberships_active_admin_idx
  ON public.store_memberships (store_id, principal_id)
  WHERE status = 'active' AND subject_type IN ('owner', 'admin', 'staff', 'support', 'automation');

-- store_invitations: invite workflow for store admins and staff.
-- Security note: store only token hashes, never raw invite tokens.
-- Existing source mapping: no current canonical source; Phase 2A does not create live invitations.
CREATE TABLE IF NOT EXISTS public.store_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  role text NOT NULL,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  invited_by_principal_id uuid,
  accepted_by_principal_id uuid,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_invitations_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT store_invitations_role_check CHECK (role IN ('store_owner', 'store_admin', 'store_staff', 'support_admin')),
  CONSTRAINT store_invitations_status_check CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

CREATE INDEX IF NOT EXISTS store_invitations_store_status_idx
  ON public.store_invitations (store_id, status, expires_at);
CREATE INDEX IF NOT EXISTS store_invitations_email_idx
  ON public.store_invitations (email_normalized, status);

-- store_onboarding_sessions: draft wizard state before live provisioning starts.
-- Existing source mapping: new self-serve onboarding drafts only; legacy stores should not be backfilled here.
-- Idempotency note: idempotency_key can protect repeated form submits before job creation.
CREATE TABLE IF NOT EXISTS public.store_onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id uuid NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  idempotency_key text,
  status text NOT NULL DEFAULT 'draft',
  current_step text NOT NULL DEFAULT 'platform_account',
  draft_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  submitted_at timestamptz,
  cancelled_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_onboarding_sessions_status_check CHECK (
    status IN ('draft', 'submitted', 'converted', 'cancelled', 'expired')
  ),
  CONSTRAINT store_onboarding_sessions_idempotency_unique UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS store_onboarding_sessions_one_active_idx
  ON public.store_onboarding_sessions (principal_id)
  WHERE status IN ('draft', 'submitted');
CREATE INDEX IF NOT EXISTS store_onboarding_sessions_store_idx
  ON public.store_onboarding_sessions (store_id, status);

-- store_provisioning_jobs: durable queue replacing request-lifetime queueMicrotask.
-- Existing source mapping: no legacy runtime cutover in Phase 2A; jobs begin only after later explicit approval.
-- Idempotency note: retry workers must reuse idempotency_key per store/job_type.
CREATE TABLE IF NOT EXISTS public.store_provisioning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'initial_provisioning',
  status text NOT NULL DEFAULT 'queued',
  idempotency_key text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  locked_at timestamptz,
  locked_by text,
  run_after timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  last_error text,
  step_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_provisioning_jobs_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT store_provisioning_jobs_attempts_check CHECK (attempt_count >= 0 AND max_attempts > 0),
  CONSTRAINT store_provisioning_jobs_status_check CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'blocked')
  )
);

CREATE INDEX IF NOT EXISTS store_provisioning_jobs_queue_idx
  ON public.store_provisioning_jobs (status, run_after, created_at);
CREATE INDEX IF NOT EXISTS store_provisioning_jobs_store_idx
  ON public.store_provisioning_jobs (store_id, job_type, status);

-- store_billing_accounts: plan/trial/subscription authority for SaaS entitlements.
-- Existing source mapping: current package fields are incomplete; Phase 2A mirrors only as metadata until billing cutover.
CREATE TABLE IF NOT EXISTS public.store_billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  plan_key text NOT NULL DEFAULT 'trial',
  billing_status text NOT NULL DEFAULT 'trialing',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  suspended_at timestamptz,
  cancelled_at timestamptz,
  entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_billing_accounts_store_unique UNIQUE (store_id),
  CONSTRAINT store_billing_accounts_status_check CHECK (
    billing_status IN ('trialing', 'active', 'past_due', 'unpaid', 'suspended', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS store_billing_accounts_status_idx
  ON public.store_billing_accounts (billing_status, trial_ends_at);
CREATE INDEX IF NOT EXISTS store_billing_accounts_provider_idx
  ON public.store_billing_accounts (provider, provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;
