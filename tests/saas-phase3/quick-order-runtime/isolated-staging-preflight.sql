-- Read-only compatibility proof for the immutable 001-025 base before 026-029.
BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;

DO $preflight$
DECLARE
  missing text;
  forbidden text;
BEGIN
  FOREACH missing IN ARRAY ARRAY[
    'saas.stores','saas.store_domains','saas.memberships','saas.plan_versions',
    'saas.products','saas.product_variants','saas.orders','saas.order_items',
    'saas.quick_order_links','saas.checkout_provider_configs','saas.quick_link_operations'
  ] LOOP
    IF to_regclass(missing) IS NULL THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: missing current base relation'; END IF;
  END LOOP;
  FOREACH missing IN ARRAY ARRAY[
    'saas.quick_links_list','saas.quick_links_get','saas.quick_links_create','saas.quick_links_cancel',
    'saas.quick_links_duplicate','saas.quick_links_recover_operation'
  ] LOOP
    IF to_regprocedure(missing || '(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,uuid,text)') IS NULL
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname=split_part(missing,'.',2))
    THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: missing current base function'; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_owner')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_app')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_workflow')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_host_resolver')
  THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: required base role absent'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname='quick_order_links' AND c.relrowsecurity AND c.relforcerowsecurity)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname IN ('quick_order_links','checkout_provider_configs') AND pg_catalog.has_table_privilege('celebix_saas_app',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
  THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: current base RLS or app ACL drift'; END IF;
  FOREACH forbidden IN ARRAY ARRAY[
    'quick_order_redemption_sessions','checkout_payment_attempts','checkout_inventory_reservations',
    'checkout_callback_receipts','checkout_reconciliation_jobs','checkout_reconciliation_run',
    'checkout_reconciliation_receipts','checkout_operations'
  ] LOOP
    IF to_regclass('saas.' || forbidden) IS NOT NULL THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: post-base object present'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname IN (
    'checkout_begin_attempt','checkout_claim_redemption','checkout_apply_callback','checkout_claim_reconciliation',
    'checkout_apply_reconciliation_success','checkout_record_reconciliation_unknown'
  )) THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: post-base function present'; END IF;
END
$preflight$;

ROLLBACK;
