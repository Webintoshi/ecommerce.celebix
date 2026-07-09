-- PROPOSAL ONLY - DO NOT APPLY TO PRODUCTION YET.
-- Self-serve free starter store foundation persistence proposal.
-- This file is not wired into any migration pipeline.
-- Production apply requires Atlas approval, fresh owner DB backup, temp restore rehearsal,
-- rollback review, and an explicit no-runtime-cutover plan.

begin;

create table if not exists self_serve_store_registrations (
  id uuid primary key default gen_random_uuid(),
  normalized_email text not null,
  -- Stores the normalized slug produced by normalizeSelfServeStoreSlug().
  store_slug text not null,
  idempotency_key text not null,
  store_name text not null,
  applicant_first_name text not null,
  applicant_last_name text not null,
  applicant_phone text not null,
  marketing_consent boolean not null default false,
  privacy_consent boolean not null,
  plan text not null default 'free_starter',
  creation_mode text not null default 'production_safe_pending',
  persistence_mode text not null default 'persistent_db_adapter',
  status text not null default 'processing',
  planned_store_url text not null,
  planned_admin_url text not null,
  auth_provider text not null default 'logto',
  password_stored boolean not null default false,
  admin_redirect_url text,
  last_error_code text,
  last_error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint self_serve_store_registrations_status_check check (
    status in (
      'processing',
      'pending_email_verification',
      'pending_provisioning',
      'ready_for_admin_handoff',
      'failed',
      'cancelled'
    )
  ),
  constraint self_serve_store_registrations_plan_check check (plan = 'free_starter'),
  constraint self_serve_store_registrations_creation_mode_check check (
    creation_mode in ('production_safe_pending', 'persistent_db_adapter')
  ),
  constraint self_serve_store_registrations_persistence_mode_check check (
    persistence_mode in ('persistent_db_adapter')
  ),
  constraint self_serve_store_registrations_password_never_stored check (password_stored = false),
  constraint self_serve_store_registrations_admin_redirect_safe check (
    admin_redirect_url is null or admin_redirect_url like 'https://%'
  )
);

create unique index if not exists self_serve_store_registrations_slug_key
  on self_serve_store_registrations (store_slug);

create unique index if not exists self_serve_store_registrations_email_slug_idempotency_key
  on self_serve_store_registrations (normalized_email, store_slug);

create unique index if not exists self_serve_store_registrations_idempotency_key
  on self_serve_store_registrations (idempotency_key);

-- Current product limit is one store per user/email. If the limit changes, replace this
-- with a scoped quota table before enabling production writes.
create unique index if not exists self_serve_store_registrations_email_key
  on self_serve_store_registrations (normalized_email);

create table if not exists self_serve_store_packages (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references self_serve_store_registrations(id) on delete cascade,
  plan text not null default 'free_starter',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint self_serve_store_packages_plan_check check (plan = 'free_starter'),
  constraint self_serve_store_packages_status_check check (status in ('pending', 'active', 'cancelled'))
);

create unique index if not exists self_serve_store_packages_registration_key
  on self_serve_store_packages (registration_id);

create table if not exists self_serve_store_domains (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references self_serve_store_registrations(id) on delete cascade,
  hostname text not null,
  domain_type text not null,
  is_primary boolean not null default false,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint self_serve_store_domains_domain_type_check check (
    domain_type in ('platform_subdomain', 'admin_subdomain', 'custom')
  ),
  constraint self_serve_store_domains_status_check check (status in ('planned', 'active', 'failed', 'removed'))
);

create unique index if not exists self_serve_store_domains_hostname_key
  on self_serve_store_domains (hostname);

create unique index if not exists self_serve_store_domains_primary_per_type_key
  on self_serve_store_domains (registration_id, domain_type)
  where is_primary;

create table if not exists self_serve_store_memberships (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references self_serve_store_registrations(id) on delete cascade,
  principal_email text not null,
  role text not null default 'store_owner',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint self_serve_store_memberships_role_check check (role = 'store_owner'),
  constraint self_serve_store_memberships_status_check check (status in ('pending', 'active', 'revoked'))
);

create unique index if not exists self_serve_store_memberships_registration_role_key
  on self_serve_store_memberships (registration_id, principal_email, role);

create table if not exists self_serve_provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references self_serve_store_registrations(id) on delete cascade,
  kind text not null default 'free_starter_store_creation',
  adapter text not null default 'persistent_db_adapter',
  status text not null default 'queued',
  attempts integer not null default 0,
  locked_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint self_serve_provisioning_jobs_kind_check check (kind = 'free_starter_store_creation'),
  constraint self_serve_provisioning_jobs_adapter_check check (adapter = 'persistent_db_adapter'),
  constraint self_serve_provisioning_jobs_status_check check (
    status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')
  )
);

create unique index if not exists self_serve_provisioning_jobs_registration_kind_key
  on self_serve_provisioning_jobs (registration_id, kind);

commit;
