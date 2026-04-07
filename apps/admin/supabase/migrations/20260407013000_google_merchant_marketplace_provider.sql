alter table public.marketplace_provider_connections
    drop constraint if exists marketplace_provider_connections_provider_check;
alter table public.marketplace_provider_connections
    add constraint marketplace_provider_connections_provider_check
    check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr', 'google_merchant'));

alter table public.marketplace_listings
    drop constraint if exists marketplace_listings_provider_check;
alter table public.marketplace_listings
    add constraint marketplace_listings_provider_check
    check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr', 'google_merchant'));

alter table public.marketplace_orders
    drop constraint if exists marketplace_orders_provider_check;
alter table public.marketplace_orders
    add constraint marketplace_orders_provider_check
    check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr', 'google_merchant'));

alter table public.marketplace_sync_jobs
    drop constraint if exists marketplace_sync_jobs_provider_check;
alter table public.marketplace_sync_jobs
    add constraint marketplace_sync_jobs_provider_check
    check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr', 'google_merchant'));

alter table public.marketplace_sync_queue
    drop constraint if exists marketplace_sync_queue_provider_check;
alter table public.marketplace_sync_queue
    add constraint marketplace_sync_queue_provider_check
    check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr', 'google_merchant'));

alter table public.marketplace_sync_logs
    drop constraint if exists marketplace_sync_logs_provider_check;
alter table public.marketplace_sync_logs
    add constraint marketplace_sync_logs_provider_check
    check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr', 'google_merchant'));

alter table public.marketplace_webhook_events
    drop constraint if exists marketplace_webhook_events_provider_check;
alter table public.marketplace_webhook_events
    add constraint marketplace_webhook_events_provider_check
    check (provider in ('trendyol', 'hepsiburada', 'n11', 'amazon_tr', 'google_merchant'));
