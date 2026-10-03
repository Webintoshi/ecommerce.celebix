BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- The published design owns this optional policy. Existing shipping settings,
-- merchant data, drafts, order snapshots and provider configuration are untouched.
DO $assertions$ DECLARE backup record; actual pg_catalog.pg_proc%ROWTYPE; BEGIN
 FOR backup IN SELECT * FROM saas.side_cart_free_shipping_backup LOOP
  SELECT * INTO actual FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure(backup.identity);
  IF pg_catalog.to_jsonb(actual)-'prosrc' IS DISTINCT FROM backup.authority OR pg_catalog.pg_get_functiondef(actual.oid) IS DISTINCT FROM backup.migrated_definition THEN RAISE EXCEPTION 'SIDE_CART_FREE_SHIPPING_ASSERTION_CHANGED: %',backup.identity; END IF;
 END LOOP;
 IF pg_catalog.has_function_privilege('celebix_saas_app','saas.storefront_shipping_for_subtotal(uuid,bigint)','EXECUTE') OR pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.storefront_shipping_for_subtotal(uuid,bigint)','EXECUTE') OR pg_catalog.has_table_privilege('celebix_saas_app','saas.side_cart_free_shipping_backup','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'SIDE_CART_FREE_SHIPPING_PRIVATE_AUTHORITY_INVALID'; END IF;
END $assertions$;
COMMIT;
