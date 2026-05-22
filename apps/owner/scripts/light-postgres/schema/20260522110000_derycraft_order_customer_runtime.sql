-- DeryCraft 2 light Postgres commerce runtime (Phase 1 prep)
-- Target DB: celebix-light-postgres / derycraftcomtr
-- Scope:
--   - customers
--   - customer_addresses
--   - orders
--   - order_items
--   - order_item_customizations
--   - payments
--   - payment_events
--   - order_status_history
--
-- Notes:
--   - Store isolation is DB-level for derycraftcomtr, so store_slug is omitted here.
--   - This schema is additive and does not alter existing catalog tables.

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id text,
  first_name text,
  last_name text,
  phone text,
  status text not null default 'active',
  total_orders integer not null default 0,
  total_spent numeric(12, 2) not null default 0,
  last_order_at timestamptz,
  notes text,
  tags text[] not null default '{}'::text[],
  external_customer_id text,
  accepts_email_marketing boolean not null default false,
  accepts_sms_marketing boolean not null default false,
  tax_exempt boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_status_check check (status in ('active', 'inactive', 'blocked'))
);

create unique index if not exists idx_customers_email_unique
  on public.customers (lower(email));

create unique index if not exists idx_customers_user_id_unique
  on public.customers (user_id)
  where user_id is not null;

create index if not exists idx_customers_created_at
  on public.customers (created_at desc);

create index if not exists idx_customers_last_order_at
  on public.customers (last_order_at desc);

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  type text not null default 'shipping',
  title text,
  company text,
  first_name text,
  last_name text,
  phone text,
  address text,
  address_line1 text,
  address_line2 text,
  city text,
  district text,
  state text,
  postal_code text,
  country text not null default 'TR',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_addresses_customer_id
  on public.customer_addresses (customer_id);

create index if not exists idx_customer_addresses_default
  on public.customer_addresses (customer_id, is_default desc);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'pending',
  subtotal numeric(12, 2) not null default 0,
  shipping_cost numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  shipping_address jsonb not null default '{}'::jsonb,
  billing_address jsonb not null default '{}'::jsonb,
  payment_method text,
  payment_status text not null default 'pending',
  notes text,
  source_type text not null default 'storefront_checkout',
  source_ref_id text,
  shipping_carrier text,
  tracking_number text,
  estimated_delivery date,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_status_check check (
    status in ('pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded', 'failed')
  ),
  constraint orders_payment_status_check check (
    payment_status in ('pending', 'processing', 'completed', 'failed', 'refunded')
  )
);

create unique index if not exists idx_orders_order_number_unique
  on public.orders (order_number);

create index if not exists idx_orders_customer_id
  on public.orders (customer_id);

create index if not exists idx_orders_created_at
  on public.orders (created_at desc);

create index if not exists idx_orders_status
  on public.orders (status, created_at desc);

create index if not exists idx_orders_payment_status
  on public.orders (payment_status, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_name text,
  product_image text,
  price numeric(12, 2) not null default 0,
  quantity integer not null default 1,
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id
  on public.order_items (order_id);

create index if not exists idx_order_items_product_id
  on public.order_items (product_id);

create index if not exists idx_order_items_variant_id
  on public.order_items (variant_id);

create table if not exists public.order_item_customizations (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  schema_id text,
  schema_snapshot_id text,
  schema_version integer,
  schema_snapshot jsonb,
  selections jsonb,
  price_breakdown jsonb,
  custom_text_content text,
  uploaded_files jsonb not null default '[]'::jsonb,
  production_status text,
  step_values jsonb,
  calculated_price numeric(12, 2),
  created_at timestamptz not null default now()
);

create index if not exists idx_order_item_customizations_order_item_id
  on public.order_item_customizations (order_item_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  quick_order_link_id uuid,
  gateway_id text not null,
  provider text not null,
  status text not null default 'initiated',
  amount numeric(12, 2) not null,
  currency text not null default 'TRY',
  idempotency_key text not null,
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
  constraint payments_status_check check (
    status in ('initiated', 'pending_action', 'authorized', 'captured', 'failed', 'cancelled', 'expired', 'refunded')
  )
);

create unique index if not exists idx_payments_idempotency_key_unique
  on public.payments (idempotency_key);

create index if not exists idx_payments_order_id
  on public.payments (order_id);

create index if not exists idx_payments_checkout_token
  on public.payments (checkout_token)
  where checkout_token is not null;

create index if not exists idx_payments_provider_reference_id
  on public.payments (provider_reference_id)
  where provider_reference_id is not null;

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  gateway_id text,
  payment_id uuid references public.payments(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  quick_order_link_id uuid,
  event_type text,
  status text not null default 'received',
  signature text,
  headers jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_events_provider_created_at
  on public.payment_events (provider, created_at desc);

create index if not exists idx_payment_events_order_id
  on public.payment_events (order_id)
  where order_id is not null;

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_status text,
  next_status text,
  previous_payment_status text,
  next_payment_status text,
  source text not null default 'light_postgres_phase1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_status_history_order_id
  on public.order_status_history (order_id, created_at desc);

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.touch_updated_at();

drop trigger if exists trg_customer_addresses_updated_at on public.customer_addresses;
create trigger trg_customer_addresses_updated_at
before update on public.customer_addresses
for each row execute function public.touch_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
before update on public.payments
for each row execute function public.touch_updated_at();
