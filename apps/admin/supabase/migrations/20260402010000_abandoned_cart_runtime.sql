alter table if exists public.abandoned_carts
    add column if not exists session_id text,
    add column if not exists first_name text,
    add column if not exists last_name text,
    add column if not exists is_anonymous boolean default true,
    add column if not exists item_count integer default 0,
    add column if not exists status text default 'active',
    add column if not exists abandoned_at timestamptz,
    add column if not exists recovered_at timestamptz,
    add column if not exists updated_at timestamptz default now();

alter table if exists public.abandoned_carts
    alter column items set default '[]'::jsonb;

alter table if exists public.abandoned_carts
    alter column total set default 0;

update public.abandoned_carts
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

update public.abandoned_carts
set is_anonymous = case
    when customer_id is null and coalesce(email, '') = '' then true
    else false
end
where is_anonymous is null;

update public.abandoned_carts
set item_count = 0
where item_count is null;

with computed_counts as (
    select
        carts.id,
        coalesce(
            sum(
                case
                    when coalesce(item->>'quantity', '') ~ '^[0-9]+$' then (item->>'quantity')::integer
                    else 1
                end
            ),
            0
        ) as computed_item_count
    from public.abandoned_carts carts
    left join lateral jsonb_array_elements(coalesce(carts.items, '[]'::jsonb)) item on true
    group by carts.id
)
update public.abandoned_carts carts
set item_count = computed_counts.computed_item_count
from computed_counts
where carts.id = computed_counts.id
  and coalesce(carts.item_count, 0) = 0;

update public.abandoned_carts
set status = case
    when recovered = true then 'recovered'
    else 'abandoned'
end
where status is null or btrim(status) = '';

update public.abandoned_carts
set recovered_at = coalesce(recovered_at, updated_at, created_at, now())
where recovered = true
  and recovered_at is null;

update public.abandoned_carts
set abandoned_at = coalesce(abandoned_at, updated_at, created_at, now())
where status = 'abandoned'
  and abandoned_at is null;

create index if not exists idx_abandoned_carts_session_id on public.abandoned_carts(session_id);
create index if not exists idx_abandoned_carts_customer_id on public.abandoned_carts(customer_id);
create index if not exists idx_abandoned_carts_status on public.abandoned_carts(status);
create index if not exists idx_abandoned_carts_updated_at on public.abandoned_carts(updated_at desc);

drop trigger if exists update_abandoned_carts_updated_at on public.abandoned_carts;
create trigger update_abandoned_carts_updated_at
before update on public.abandoned_carts
for each row
execute function public.update_updated_at_column();

create or replace function public.mark_abandoned_carts()
returns void
language plpgsql
as $$
begin
    update public.abandoned_carts
    set
        status = 'abandoned',
        abandoned_at = coalesce(abandoned_at, now())
    where recovered = false
      and status = 'active'
      and coalesce(item_count, 0) > 0
      and updated_at < now() - interval '30 minutes';
end;
$$;

update public.abandoned_carts
set
    status = 'abandoned',
    abandoned_at = coalesce(abandoned_at, updated_at, created_at, now())
where recovered = false
  and status = 'active'
  and coalesce(item_count, 0) > 0
  and updated_at < now() - interval '30 minutes';
