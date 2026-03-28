create or replace function public.update_marketplace_runtime_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create table if not exists public.marketplace_provider_connections (
    id uuid primary key default gen_random_uuid(),
    provider text not null unique,
    status text not null default 'disconnected',
    encrypted_credentials text,
    field_mappings jsonb not null default '{}'::jsonb,
    settings jsonb not null default '{}'::jsonb,
    supports_webhook boolean not null default false,
    last_healthcheck_at timestamptz,
    last_healthcheck_status text,
    last_healthcheck_message text,
    last_sync_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint marketplace_provider_connections_provider_check check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr')),
    constraint marketplace_provider_connections_status_check check (status in ('disconnected', 'active', 'error')),
    constraint marketplace_provider_connections_healthcheck_check check (last_healthcheck_status in ('ok', 'failed') or last_healthcheck_status is null)
);

create table if not exists public.marketplace_listings (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    product_id uuid not null references public.products(id) on delete cascade,
    variant_id uuid not null references public.product_variants(id) on delete cascade,
    external_listing_id text,
    external_sku text,
    status text not null default 'pending',
    last_synced_price numeric(12, 2),
    last_synced_stock integer,
    payload_snapshot jsonb not null default '{}'::jsonb,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint marketplace_listings_provider_check check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr')),
    constraint marketplace_listings_status_check check (status in ('pending', 'active', 'inactive', 'error')),
    constraint marketplace_listings_provider_variant_unique unique (provider, variant_id)
);

create unique index if not exists idx_marketplace_listings_provider_external_listing
    on public.marketplace_listings(provider, external_listing_id)
    where external_listing_id is not null;

create table if not exists public.marketplace_orders (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    external_order_id text not null,
    order_status text,
    import_status text not null default 'queued',
    internal_order_id uuid references public.orders(id) on delete set null,
    raw_payload jsonb not null default '{}'::jsonb,
    normalized_payload jsonb not null default '{}'::jsonb,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint marketplace_orders_provider_check check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr')),
    constraint marketplace_orders_import_status_check check (import_status in ('idle', 'queued', 'syncing', 'synced', 'failed', 'manual_action_required')),
    constraint marketplace_orders_provider_external_order_unique unique (provider, external_order_id)
);

create table if not exists public.marketplace_sync_jobs (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    job_type text not null,
    status text not null default 'running',
    scheduled_at timestamptz not null default now(),
    started_at timestamptz,
    finished_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint marketplace_sync_jobs_provider_check check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr')),
    constraint marketplace_sync_jobs_status_check check (status in ('running', 'completed', 'failed'))
);

create table if not exists public.marketplace_sync_queue (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    direction text not null,
    entity_type text not null,
    entity_id text not null,
    operation text not null,
    payload jsonb not null default '{}'::jsonb,
    status text not null default 'queued',
    attempt_count integer not null default 0,
    next_retry_at timestamptz not null default now(),
    idempotency_key text not null unique,
    last_error text,
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint marketplace_sync_queue_provider_check check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr')),
    constraint marketplace_sync_queue_direction_check check (direction in ('outbound', 'inbound', 'system')),
    constraint marketplace_sync_queue_status_check check (status in ('idle', 'queued', 'syncing', 'synced', 'failed', 'manual_action_required')),
    constraint marketplace_sync_queue_attempt_count_check check (attempt_count >= 0)
);

create table if not exists public.marketplace_sync_logs (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    direction text not null,
    entity_type text not null,
    entity_id text,
    job_id uuid references public.marketplace_sync_jobs(id) on delete set null,
    status text not null,
    error_code text,
    error_message text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint marketplace_sync_logs_provider_check check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr')),
    constraint marketplace_sync_logs_direction_check check (direction in ('outbound', 'inbound', 'system'))
);

create table if not exists public.marketplace_webhook_events (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    external_event_id text,
    payload_hash text not null,
    signature_valid boolean not null default false,
    payload jsonb not null default '{}'::jsonb,
    headers jsonb not null default '{}'::jsonb,
    processing_status text not null default 'received',
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint marketplace_webhook_events_provider_check check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr')),
    constraint marketplace_webhook_events_processing_status_check check (processing_status in ('received', 'processed', 'failed', 'duplicate')),
    constraint marketplace_webhook_events_provider_payload_hash_unique unique (provider, payload_hash)
);

create unique index if not exists idx_marketplace_webhook_events_provider_external_event
    on public.marketplace_webhook_events(provider, external_event_id)
    where external_event_id is not null;

create index if not exists idx_marketplace_sync_queue_status_retry
    on public.marketplace_sync_queue(status, next_retry_at);

create index if not exists idx_marketplace_sync_queue_provider_status
    on public.marketplace_sync_queue(provider, status);

create index if not exists idx_marketplace_orders_internal_order
    on public.marketplace_orders(internal_order_id);

create index if not exists idx_marketplace_orders_provider_status
    on public.marketplace_orders(provider, import_status);

create index if not exists idx_marketplace_listings_provider_product
    on public.marketplace_listings(provider, product_id);

create index if not exists idx_marketplace_sync_logs_provider_created
    on public.marketplace_sync_logs(provider, created_at desc);

alter table public.marketplace_provider_connections enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_orders enable row level security;
alter table public.marketplace_sync_jobs enable row level security;
alter table public.marketplace_sync_queue enable row level security;
alter table public.marketplace_sync_logs enable row level security;
alter table public.marketplace_webhook_events enable row level security;

drop policy if exists "Service role full access marketplace_provider_connections" on public.marketplace_provider_connections;
create policy "Service role full access marketplace_provider_connections"
on public.marketplace_provider_connections for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access marketplace_listings" on public.marketplace_listings;
create policy "Service role full access marketplace_listings"
on public.marketplace_listings for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access marketplace_orders" on public.marketplace_orders;
create policy "Service role full access marketplace_orders"
on public.marketplace_orders for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access marketplace_sync_jobs" on public.marketplace_sync_jobs;
create policy "Service role full access marketplace_sync_jobs"
on public.marketplace_sync_jobs for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access marketplace_sync_queue" on public.marketplace_sync_queue;
create policy "Service role full access marketplace_sync_queue"
on public.marketplace_sync_queue for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access marketplace_sync_logs" on public.marketplace_sync_logs;
create policy "Service role full access marketplace_sync_logs"
on public.marketplace_sync_logs for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access marketplace_webhook_events" on public.marketplace_webhook_events;
create policy "Service role full access marketplace_webhook_events"
on public.marketplace_webhook_events for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop trigger if exists update_marketplace_provider_connections_updated_at on public.marketplace_provider_connections;
create trigger update_marketplace_provider_connections_updated_at
    before update on public.marketplace_provider_connections
    for each row execute function public.update_marketplace_runtime_updated_at();

drop trigger if exists update_marketplace_listings_updated_at on public.marketplace_listings;
create trigger update_marketplace_listings_updated_at
    before update on public.marketplace_listings
    for each row execute function public.update_marketplace_runtime_updated_at();

drop trigger if exists update_marketplace_orders_updated_at on public.marketplace_orders;
create trigger update_marketplace_orders_updated_at
    before update on public.marketplace_orders
    for each row execute function public.update_marketplace_runtime_updated_at();

drop trigger if exists update_marketplace_sync_jobs_updated_at on public.marketplace_sync_jobs;
create trigger update_marketplace_sync_jobs_updated_at
    before update on public.marketplace_sync_jobs
    for each row execute function public.update_marketplace_runtime_updated_at();

drop trigger if exists update_marketplace_sync_queue_updated_at on public.marketplace_sync_queue;
create trigger update_marketplace_sync_queue_updated_at
    before update on public.marketplace_sync_queue
    for each row execute function public.update_marketplace_runtime_updated_at();

drop trigger if exists update_marketplace_webhook_events_updated_at on public.marketplace_webhook_events;
create trigger update_marketplace_webhook_events_updated_at
    before update on public.marketplace_webhook_events
    for each row execute function public.update_marketplace_runtime_updated_at();
