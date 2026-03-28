-- Mirror migration for accounting runtime tables.
-- Source: sql/accounting_runtime.sql

create extension if not exists pgcrypto;

create table if not exists public.accounting_provider_connections (
    id uuid primary key default gen_random_uuid(),
    provider text not null unique,
    status text not null default 'disconnected',
    encrypted_credentials text,
    sync_mode text not null default 'safe_hybrid',
    field_mappings jsonb not null default '{}'::jsonb,
    settings jsonb not null default '{}'::jsonb,
    supports_webhook boolean not null default false,
    last_healthcheck_at timestamptz,
    last_healthcheck_status text,
    last_healthcheck_message text,
    last_sync_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.accounting_invoice_queue (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    provider text not null,
    payload jsonb not null default '{}'::jsonb,
    status text not null default 'queued',
    attempt_count integer not null default 0,
    next_retry_at timestamptz default now(),
    last_error text,
    trigger_source text,
    locked_at timestamptz,
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint accounting_invoice_queue_order_provider_unique unique (order_id, provider)
);

create table if not exists public.accounting_invoices (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    provider text not null,
    external_invoice_id text,
    invoice_no text,
    invoice_url text,
    status text not null default 'draft',
    total_amount numeric(12,2) not null default 0,
    issued_at timestamptz,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint accounting_invoices_order_provider_unique unique (order_id, provider)
);

create table if not exists public.accounting_payments (
    id uuid primary key default gen_random_uuid(),
    order_id uuid references public.orders(id) on delete set null,
    provider text not null,
    external_payment_id text not null,
    amount numeric(12,2) not null default 0,
    currency text not null default 'TRY',
    status text not null default 'pending',
    payload jsonb not null default '{}'::jsonb,
    paid_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint accounting_payments_provider_external_unique unique (provider, external_payment_id)
);

create table if not exists public.accounting_sync_jobs (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    job_type text not null,
    status text not null default 'queued',
    scheduled_at timestamptz not null default now(),
    started_at timestamptz,
    finished_at timestamptz,
    attempt_count integer not null default 0,
    error_message text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.accounting_sync_logs (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    direction text not null default 'system',
    entity_type text not null,
    entity_id text,
    status text not null,
    error_code text,
    error_message text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.accounting_entity_mappings (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    local_entity_type text not null,
    local_entity_id text not null,
    external_id text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint accounting_entity_mappings_unique unique (provider, local_entity_type, local_entity_id)
);

create index if not exists idx_accounting_invoice_queue_status_retry
    on public.accounting_invoice_queue(status, next_retry_at);
create index if not exists idx_accounting_sync_logs_provider_created_at
    on public.accounting_sync_logs(provider, created_at desc);
create index if not exists idx_accounting_invoices_order_id
    on public.accounting_invoices(order_id);
create index if not exists idx_accounting_invoice_queue_provider
    on public.accounting_invoice_queue(provider);
create index if not exists idx_accounting_payments_order_id
    on public.accounting_payments(order_id);

alter table public.accounting_provider_connections enable row level security;
alter table public.accounting_invoice_queue enable row level security;
alter table public.accounting_invoices enable row level security;
alter table public.accounting_payments enable row level security;
alter table public.accounting_sync_jobs enable row level security;
alter table public.accounting_sync_logs enable row level security;
alter table public.accounting_entity_mappings enable row level security;

drop policy if exists "Service role full access accounting_provider_connections" on public.accounting_provider_connections;
create policy "Service role full access accounting_provider_connections"
on public.accounting_provider_connections for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access accounting_invoice_queue" on public.accounting_invoice_queue;
create policy "Service role full access accounting_invoice_queue"
on public.accounting_invoice_queue for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access accounting_invoices" on public.accounting_invoices;
create policy "Service role full access accounting_invoices"
on public.accounting_invoices for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access accounting_payments" on public.accounting_payments;
create policy "Service role full access accounting_payments"
on public.accounting_payments for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access accounting_sync_jobs" on public.accounting_sync_jobs;
create policy "Service role full access accounting_sync_jobs"
on public.accounting_sync_jobs for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access accounting_sync_logs" on public.accounting_sync_logs;
create policy "Service role full access accounting_sync_logs"
on public.accounting_sync_logs for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access accounting_entity_mappings" on public.accounting_entity_mappings;
create policy "Service role full access accounting_entity_mappings"
on public.accounting_entity_mappings for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

do $$
begin
    if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
        drop trigger if exists update_accounting_provider_connections_updated_at on public.accounting_provider_connections;
        create trigger update_accounting_provider_connections_updated_at
            before update on public.accounting_provider_connections
            for each row execute function update_updated_at_column();

        drop trigger if exists update_accounting_invoice_queue_updated_at on public.accounting_invoice_queue;
        create trigger update_accounting_invoice_queue_updated_at
            before update on public.accounting_invoice_queue
            for each row execute function update_updated_at_column();

        drop trigger if exists update_accounting_invoices_updated_at on public.accounting_invoices;
        create trigger update_accounting_invoices_updated_at
            before update on public.accounting_invoices
            for each row execute function update_updated_at_column();

        drop trigger if exists update_accounting_payments_updated_at on public.accounting_payments;
        create trigger update_accounting_payments_updated_at
            before update on public.accounting_payments
            for each row execute function update_updated_at_column();

        drop trigger if exists update_accounting_sync_jobs_updated_at on public.accounting_sync_jobs;
        create trigger update_accounting_sync_jobs_updated_at
            before update on public.accounting_sync_jobs
            for each row execute function update_updated_at_column();

        drop trigger if exists update_accounting_entity_mappings_updated_at on public.accounting_entity_mappings;
        create trigger update_accounting_entity_mappings_updated_at
            before update on public.accounting_entity_mappings
            for each row execute function update_updated_at_column();
    end if;
end $$;

