create extension if not exists pgcrypto;

create or replace function public.celebix_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.abandoned_carts (
  id uuid primary key default gen_random_uuid(),
  store_slug text,
  cart_id text,
  customer_id text,
  session_id text,
  email text,
  phone text,
  first_name text,
  last_name text,
  is_anonymous boolean not null default true,
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0,
  item_count integer not null default 0,
  status text not null default 'active',
  recovered boolean not null default false,
  recovered_at timestamptz,
  abandoned_at timestamptz,
  checkout_started_at timestamptz,
  last_activity_at timestamptz not null default now(),
  order_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.abandoned_carts
  add column if not exists store_slug text,
  add column if not exists cart_id text,
  add column if not exists customer_id text,
  add column if not exists session_id text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists is_anonymous boolean not null default true,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists total numeric(12,2) not null default 0,
  add column if not exists item_count integer not null default 0,
  add column if not exists status text not null default 'active',
  add column if not exists recovered boolean not null default false,
  add column if not exists recovered_at timestamptz,
  add column if not exists abandoned_at timestamptz,
  add column if not exists checkout_started_at timestamptz,
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists order_id text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'abandoned_carts_status_check'
      and conrelid = 'public.abandoned_carts'::regclass
  ) then
    alter table public.abandoned_carts
      add constraint abandoned_carts_status_check
      check (status in ('active', 'abandoned', 'recovered', 'cleared'));
  end if;
end;
$$;

create index if not exists idx_abandoned_carts_store_slug on public.abandoned_carts(store_slug);
create index if not exists idx_abandoned_carts_cart_id on public.abandoned_carts(cart_id);
create index if not exists idx_abandoned_carts_session_id on public.abandoned_carts(session_id);
create index if not exists idx_abandoned_carts_customer_id on public.abandoned_carts(customer_id);
create index if not exists idx_abandoned_carts_email on public.abandoned_carts(email);
create index if not exists idx_abandoned_carts_status on public.abandoned_carts(status);
create index if not exists idx_abandoned_carts_last_activity_at on public.abandoned_carts(last_activity_at);

drop trigger if exists abandoned_carts_set_updated_at on public.abandoned_carts;
create trigger abandoned_carts_set_updated_at
before update on public.abandoned_carts
for each row execute function public.celebix_set_updated_at();
