-- Read-only assertions after 157 (and optional cashier role 158).
BEGIN READ ONLY;
DO $assert$
DECLARE fn record;table_name text;signature text;definition text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['in_store_staff_grants','in_store_sales','in_store_payment_attestations','in_store_inventory_reservations','in_store_operations','in_store_sale_events','in_store_discount_allocations','in_store_migration_restore','in_store_price_snapshots'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname=table_name AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION 'missing POS RLS: %',table_name;END IF;
  IF has_table_privilege('celebix_saas_app','saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION 'POS table is directly accessible: %',table_name;END IF;
 END LOOP;
 FOR fn IN SELECT p.oid,p.proname,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE 'in_store_%' LOOP
  IF has_function_privilege('celebix_saas_app',fn.oid,'EXECUTE') IS DISTINCT FROM (fn.proname IN('in_store_sales_bootstrap','in_store_sales_search_products','in_store_sales_list','in_store_sales_get','in_store_sales_get_operation','in_store_sales_create','in_store_sales_update','in_store_sales_hold','in_store_sales_prepare','in_store_sales_confirm_payment','in_store_sales_complete','in_store_sales_cancel','in_store_sales_takeover','in_store_sales_list_staff','in_store_sales_set_staff','in_store_sales_recover_staff')) THEN RAISE EXCEPTION 'unexpected POS entrypoint grant: %',fn.proname;END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=fn.oid),acldefault('f',(SELECT proowner FROM pg_proc WHERE oid=fn.oid)))) WHERE grantee=0 AND privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PUBLIC POS execution: %',fn.proname;END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY['saas.resolve_effective_variant_price(uuid,uuid,text,timestamp with time zone,text)','saas.inventory_reconcile_variant_delta(uuid,uuid,bigint,bigint,boolean)','saas.inventory_counts_commit','saas.inventory_transfers_dispatch','saas.checkout_begin_attempt','saas.quick_order_hosted_payment_begin','saas.storefront_available_stock'] LOOP
  IF signature LIKE '%(%' THEN SELECT pg_get_functiondef(to_regprocedure(signature)) INTO definition;
  ELSE SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname=substring(signature from 6) LIMIT 1;END IF;
  IF definition IS NULL OR (signature LIKE '%resolve_effective%' AND definition NOT LIKE '%in_store%') OR (signature NOT LIKE '%resolve_effective%' AND definition NOT LIKE '%all_inventory_reservations%') THEN RAISE EXCEPTION 'shared authority not updated: %',signature;END IF;
  IF signature LIKE '%inventory_counts_commit' AND definition NOT LIKE '%in_store_held_quantity(p_store_id,line.variant_id,current_count.location_id)%' THEN RAISE EXCEPTION 'count location hold precheck missing';END IF;
  IF signature LIKE '%inventory_transfers_dispatch' AND definition NOT LIKE '%in_store_held_quantity(p_store_id,line.variant_id,current_transfer.source_location_id)%' THEN RAISE EXCEPTION 'transfer location hold precheck missing';END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.checkout_inventory_reservations'::regclass AND tgname='in_store_online_hold_admission' AND NOT tgisinternal) OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.inventory_balances'::regclass AND tgname='in_store_inventory_balance_guard' AND NOT tgisinternal) OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.orders'::regclass AND tgname='in_store_order_tombstone' AND NOT tgisinternal) THEN RAISE EXCEPTION 'missing durable stock/order boundary';END IF;
 IF (SELECT count(*) FROM saas.in_store_migration_restore)<10 THEN RAISE EXCEPTION 'rollback definitions missing';END IF;
END $assert$;
ROLLBACK;
