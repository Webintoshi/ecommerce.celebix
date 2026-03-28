create extension if not exists pgcrypto;

create table if not exists public.payment_attempts (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    gateway_id text not null,
    provider text not null,
    status text not null default 'initiated',
    amount numeric(12, 2) not null,
    currency text not null default 'TRY',
    idempotency_key text not null unique,
    checkout_token text,
    redirect_url text,
    provider_payment_id text,
    provider_reference_id text,
    conversation_id text,
    customer_email text,
    customer_ip text,
    error_code text,
    error_message text,
    request_payload jsonb not null default '{}'::jsonb,
    response_payload jsonb not null default '{}'::jsonb,
    callback_payload jsonb not null default '{}'::jsonb,
    callback_received_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint payment_attempts_status_check check (
        status in ('initiated', 'pending_action', 'authorized', 'captured', 'failed', 'cancelled', 'expired', 'refunded')
    )
);

create table if not exists public.payment_webhook_events (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    gateway_id text,
    payment_attempt_id uuid references public.payment_attempts(id) on delete set null,
    order_id uuid references public.orders(id) on delete set null,
    event_type text,
    status text not null default 'received',
    signature text,
    headers jsonb not null default '{}'::jsonb,
    payload jsonb not null default '{}'::jsonb,
    error_message text,
    processed_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_payment_attempts_order_id
    on public.payment_attempts(order_id);

create index if not exists idx_payment_attempts_gateway_status
    on public.payment_attempts(gateway_id, status);

create index if not exists idx_payment_attempts_checkout_token
    on public.payment_attempts(checkout_token)
    where checkout_token is not null;

create index if not exists idx_payment_attempts_provider_reference
    on public.payment_attempts(provider_reference_id)
    where provider_reference_id is not null;

create index if not exists idx_payment_webhook_events_provider_created
    on public.payment_webhook_events(provider, created_at desc);

create index if not exists idx_payment_webhook_events_order_id
    on public.payment_webhook_events(order_id)
    where order_id is not null;

alter table public.payment_attempts enable row level security;
alter table public.payment_webhook_events enable row level security;

drop policy if exists "Service role full access payment_attempts" on public.payment_attempts;
create policy "Service role full access payment_attempts"
on public.payment_attempts for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access payment_webhook_events" on public.payment_webhook_events;
create policy "Service role full access payment_webhook_events"
on public.payment_webhook_events for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

do $$
begin
    if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
        drop trigger if exists update_payment_attempts_updated_at on public.payment_attempts;
        create trigger update_payment_attempts_updated_at
            before update on public.payment_attempts
            for each row execute function update_updated_at_column();
    end if;
end $$;
