create extension if not exists "uuid-ossp";

create table if not exists public.sessions (
    id uuid primary key default uuid_generate_v4(),
    session_id text unique not null,
    ip_address text,
    user_agent text,
    referrer text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    country text default 'TR',
    city text,
    device_type text,
    browser text,
    os text,
    started_at timestamptz default now(),
    last_activity_at timestamptz default now(),
    page_views integer default 0,
    is_active boolean default true
);

create table if not exists public.page_views (
    id uuid primary key default uuid_generate_v4(),
    session_id text references public.sessions(session_id) on delete cascade,
    page_url text not null,
    page_title text,
    time_spent integer default 0,
    scroll_depth integer default 0,
    created_at timestamptz default now()
);

create table if not exists public.events (
    id uuid primary key default uuid_generate_v4(),
    session_id text references public.sessions(session_id) on delete cascade,
    event_type text not null,
    event_data jsonb,
    page_url text,
    created_at timestamptz default now()
);

create table if not exists public.checkout_sessions (
    id uuid primary key default uuid_generate_v4(),
    session_id text references public.sessions(session_id) on delete cascade,
    cart_items jsonb not null,
    cart_total decimal(10, 2) not null,
    step text default 'info',
    email text,
    phone text,
    abandoned boolean default false,
    abandoned_at timestamptz,
    recovered boolean default false,
    order_id uuid references public.orders(id),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_sessions_session_id on public.sessions(session_id);
create index if not exists idx_sessions_is_active on public.sessions(is_active);
create index if not exists idx_sessions_last_activity on public.sessions(last_activity_at);
create index if not exists idx_page_views_session on public.page_views(session_id);
create index if not exists idx_page_views_created on public.page_views(created_at);
create index if not exists idx_events_session on public.events(session_id);
create index if not exists idx_events_type on public.events(event_type);
create index if not exists idx_events_created on public.events(created_at);
create index if not exists idx_checkout_sessions_abandoned on public.checkout_sessions(abandoned);
create index if not exists idx_checkout_sessions_session on public.checkout_sessions(session_id);

alter table public.sessions enable row level security;
alter table public.page_views enable row level security;
alter table public.events enable row level security;
alter table public.checkout_sessions enable row level security;

drop policy if exists "Anyone can insert sessions" on public.sessions;
create policy "Anyone can insert sessions"
on public.sessions for insert
with check (true);

drop policy if exists "Anyone can insert page_views" on public.page_views;
create policy "Anyone can insert page_views"
on public.page_views for insert
with check (true);

drop policy if exists "Anyone can insert events" on public.events;
create policy "Anyone can insert events"
on public.events for insert
with check (true);

drop policy if exists "Anyone can insert checkout_sessions" on public.checkout_sessions;
create policy "Anyone can insert checkout_sessions"
on public.checkout_sessions for insert
with check (true);

drop policy if exists "Service role has full access to sessions" on public.sessions;
create policy "Service role has full access to sessions"
on public.sessions for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role has full access to page_views" on public.page_views;
create policy "Service role has full access to page_views"
on public.page_views for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role has full access to events" on public.events;
create policy "Service role has full access to events"
on public.events for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role has full access to checkout_sessions" on public.checkout_sessions;
create policy "Service role has full access to checkout_sessions"
on public.checkout_sessions for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop trigger if exists update_checkout_sessions_updated_at on public.checkout_sessions;
create trigger update_checkout_sessions_updated_at
before update on public.checkout_sessions
for each row
execute function public.update_updated_at_column();

create or replace function public.increment_page_views(p_session_id text)
returns void
language plpgsql
as $$
begin
    update public.sessions
    set
        page_views = page_views + 1,
        last_activity_at = now(),
        is_active = true
    where session_id = p_session_id;
end;
$$;

create or replace function public.mark_inactive_sessions()
returns void
language plpgsql
as $$
begin
    update public.sessions
    set is_active = false
    where is_active = true
      and last_activity_at < now() - interval '5 minutes';
end;
$$;

create or replace function public.mark_abandoned_checkouts()
returns void
language plpgsql
as $$
begin
    update public.checkout_sessions
    set
        abandoned = true,
        abandoned_at = now()
    where abandoned = false
      and order_id is null
      and step != 'complete'
      and updated_at < now() - interval '30 minutes';
end;
$$;
