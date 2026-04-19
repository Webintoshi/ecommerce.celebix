create extension if not exists pgcrypto;

create table if not exists public.quick_order_links (
    id uuid primary key default gen_random_uuid(),
    token text not null unique,
    status text not null default 'active',
    expires_at timestamptz not null,
    customer_email text not null,
    customer_name text,
    customer_phone text,
    shipping_address jsonb not null default '{}'::jsonb,
    billing_address jsonb not null default '{}'::jsonb,
    currency text not null default 'TRY',
    subtotal numeric(12, 2) not null default 0,
    shipping_cost numeric(12, 2) not null default 0,
    discount numeric(12, 2) not null default 0,
    total numeric(12, 2) not null default 0,
    note text,
    allowed_payment_method_ids text[] not null default '{}'::text[],
    opened_at timestamptz,
    converted_at timestamptz,
    cancelled_at timestamptz,
    order_id uuid references public.orders(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint quick_order_links_status_check check (
        status in ('active', 'opened', 'paid', 'cancelled', 'expired')
    )
);

create table if not exists public.quick_order_link_items (
    id uuid primary key default gen_random_uuid(),
    quick_order_link_id uuid not null references public.quick_order_links(id) on delete cascade,
    product_id uuid,
    variant_id uuid,
    position integer not null default 0,
    product_name text not null,
    variant_name text,
    quantity integer not null,
    unit_price numeric(12, 2) not null,
    line_total numeric(12, 2) not null,
    image text,
    sku text,
    created_at timestamptz not null default now(),
    constraint quick_order_link_items_quantity_check check (quantity > 0)
);

alter table public.payment_attempts
    alter column order_id drop not null;

alter table public.payment_attempts
    add column if not exists quick_order_link_id uuid references public.quick_order_links(id) on delete cascade;

alter table public.payment_webhook_events
    add column if not exists quick_order_link_id uuid references public.quick_order_links(id) on delete set null;

alter table public.orders
    add column if not exists source_type text not null default 'storefront_checkout';

alter table public.orders
    add column if not exists source_ref_id text;

do $$
begin
    if exists (
        select 1
        from information_schema.table_constraints
        where table_schema = 'public'
          and table_name = 'payment_attempts'
          and constraint_name = 'payment_attempts_source_check'
    ) then
        alter table public.payment_attempts drop constraint payment_attempts_source_check;
    end if;

    alter table public.payment_attempts
        add constraint payment_attempts_source_check
        check (num_nonnulls(order_id, quick_order_link_id) = 1);
end $$;

create index if not exists idx_quick_order_links_status_expires
    on public.quick_order_links(status, expires_at);

create index if not exists idx_quick_order_links_customer_email
    on public.quick_order_links(customer_email);

create index if not exists idx_quick_order_links_order_id
    on public.quick_order_links(order_id)
    where order_id is not null;

create index if not exists idx_quick_order_link_items_link_position
    on public.quick_order_link_items(quick_order_link_id, position);

create index if not exists idx_payment_attempts_quick_order_link_id
    on public.payment_attempts(quick_order_link_id)
    where quick_order_link_id is not null;

create index if not exists idx_payment_webhook_events_quick_order_link_id
    on public.payment_webhook_events(quick_order_link_id)
    where quick_order_link_id is not null;

create unique index if not exists idx_orders_source_type_ref
    on public.orders(source_type, source_ref_id)
    where source_ref_id is not null;

alter table public.quick_order_links enable row level security;
alter table public.quick_order_link_items enable row level security;

drop policy if exists "Service role full access quick_order_links" on public.quick_order_links;
create policy "Service role full access quick_order_links"
on public.quick_order_links for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role full access quick_order_link_items" on public.quick_order_link_items;
create policy "Service role full access quick_order_link_items"
on public.quick_order_link_items for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

do $$
begin
    if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
        drop trigger if exists update_quick_order_links_updated_at on public.quick_order_links;
        create trigger update_quick_order_links_updated_at
            before update on public.quick_order_links
            for each row execute function update_updated_at_column();
    end if;
end $$;
