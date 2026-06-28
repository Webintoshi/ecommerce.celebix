-- PROPOSAL ONLY - DO NOT APPLY TO PRODUCTION YET
-- Celebix self-serve store registry target schema.
-- Phase 2C aligns this proposal with the live owner DB inventory from ecommerce.celebix.co.
-- Existing owner_* tables remain runtime authority until a separately approved cutover.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- stores: canonical SaaS store identity and lifecycle registry.
-- Phase 2C backfill source is owner_stores only. Runtime reads stay on owner_stores.
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
  source text NOT NULL DEFAULT 'legacy_owner_stores',
  source_ref text,
  mirrored_at timestamptz,
  disabled_at timestamptz,
  deleted_at timestamptz,
  status_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stores_slug_unique UNIQUE (slug),
  CONSTRAINT stores_legacy_owner_store_unique UNIQUE (legacy_owner_store_id),
  CONSTRAINT stores_status_check CHECK (
    status IN ('draft', 'active', 'suspended', 'failed', 'cancelled', 'archived')
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
  CONSTRAINT stores_source_check CHECK (
    source IN ('legacy_owner_stores', 'self_serve_onboarding', 'manual_import', 'support_import')
  )
);

CREATE INDEX IF NOT EXISTS stores_status_idx ON public.stores (status, provisioning_status);
CREATE INDEX IF NOT EXISTS stores_active_idx ON public.stores (slug)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS stores_source_idx ON public.stores (source, source_ref);

-- store_domains: storefront, admin, platform subdomain, and custom domain authority.
-- Admin domains such as admin.<store-domain> are expected legacy/control-plane domains and are exempt from
-- storefront-reserved-domain warnings when domain_type = 'admin'.
CREATE TABLE IF NOT EXISTS public.store_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  hostname_normalized text NOT NULL,
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
  source text NOT NULL DEFAULT 'legacy_owner_stores',
  source_ref text,
  mirrored_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_domains_hostname_normalized_unique UNIQUE (hostname_normalized),
  CONSTRAINT store_domains_type_check CHECK (
    domain_type IN ('storefront', 'admin', 'platform_subdomain', 'custom')
  ),
  CONSTRAINT store_domains_status_check CHECK (
    status IN ('pending', 'verifying', 'verified', 'active', 'failed', 'disabled')
  ),
  CONSTRAINT store_domains_source_check CHECK (
    source IN ('legacy_owner_stores', 'self_serve_onboarding', 'manual_import', 'support_import')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS store_domains_one_primary_per_type_idx
  ON public.store_domains (store_id, domain_type)
  WHERE is_primary = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS store_domains_store_idx ON public.store_domains (store_id, status);
CREATE INDEX IF NOT EXISTS store_domains_active_hostname_idx ON public.store_domains (hostname_normalized)
  WHERE deleted_at IS NULL;

-- store_memberships: future store-level authorization authority.
-- Phase 2C intentionally does not backfill memberships because owner_store_access has 0 rows and no owner DB
-- auth_principals/auth_store_memberships/store_user_roles source exists. Store owner inference is forbidden.
CREATE TABLE IF NOT EXISTS public.store_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  principal_id uuid NOT NULL,
  principal_source text NOT NULL DEFAULT 'platform_account',
  subject_type text NOT NULL DEFAULT 'admin',
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  permission_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  invited_by_principal_id uuid,
  joined_at timestamptz,
  disabled_at timestamptz,
  removed_at timestamptz,
  source text NOT NULL DEFAULT 'migration_mirror',
  source_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_memberships_unique UNIQUE (store_id, principal_id, subject_type, role),
  CONSTRAINT store_memberships_principal_source_check CHECK (
    principal_source IN ('platform_account', 'logto', 'owner_supabase', 'store_local', 'automation')
  ),
  CONSTRAINT store_memberships_subject_type_check CHECK (
    subject_type IN ('owner', 'admin', 'staff', 'support', 'customer', 'automation')
  ),
  CONSTRAINT store_memberships_role_check CHECK (
    role IN (
      'store_owner',
      'store_admin',
      'store_staff',
      'support_admin',
      'super_admin',
      'storefront_customer',
      'automation'
    )
  ),
  CONSTRAINT store_memberships_status_check CHECK (status IN ('invited', 'active', 'disabled', 'removed')),
  CONSTRAINT store_memberships_source_check CHECK (
    source IN ('migration_mirror', 'self_serve_onboarding', 'manual_invite', 'support_import')
  )
);

CREATE INDEX IF NOT EXISTS store_memberships_principal_idx ON public.store_memberships (principal_id, status);
CREATE INDEX IF NOT EXISTS store_memberships_store_role_idx ON public.store_memberships (store_id, role, status);
CREATE INDEX IF NOT EXISTS store_memberships_active_admin_idx
  ON public.store_memberships (store_id, principal_id)
  WHERE status = 'active' AND subject_type IN ('owner', 'admin', 'staff', 'support', 'automation');

-- store_invitations: future store admin/staff invitation lifecycle.
-- Store only token hashes, never raw invite tokens.
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

-- store_onboarding_sessions: draft self-serve wizard state before provisioning.
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

-- store_provisioning_jobs: durable provisioning queue replacing request-lifetime side effects.
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

-- store_billing_accounts: future SaaS plan/trial/subscription authority.
-- Billing is red in Phase 2B readiness and must not be cut over by this proposal.
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
