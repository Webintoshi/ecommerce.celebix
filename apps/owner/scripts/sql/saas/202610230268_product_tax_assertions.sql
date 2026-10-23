BEGIN;
DO $assert$DECLARE r record;BEGIN
 FOR r IN SELECT c.oid,c.relowner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c WHERE c.relnamespace='saas'::regnamespace AND c.relkind='r'AND c.relname IN('product_tax_prepared','product_tax_order_revisions','product_tax268_backup','product_tax_release','product_tax_recognition')LOOP
  IF r.relowner<>'celebix_saas_owner'::regrole OR NOT r.relrowsecurity OR NOT r.relforcerowsecurity OR has_table_privilege('celebix_saas_app',r.oid,'SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_workflow',r.oid,'SELECT,INSERT,UPDATE,DELETE')THEN RAISE EXCEPTION 'PRODUCT_TAX268_TABLE_AUTHORITY';END IF;
 END LOOP;
 IF(SELECT count(*)FROM saas.product_tax268_backup)<>5 THEN RAISE EXCEPTION 'PRODUCT_TAX268_BACKUP_COUNT';END IF;
 FOR r IN SELECT * FROM saas.product_tax268_backup LOOP
  IF encode(sha256(convert_to(pg_get_functiondef(r.signature::regprocedure),'UTF8')),'hex')IS DISTINCT FROM r.published_sha256 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=r.signature::regprocedure AND proowner=r.owner_id AND proacl IS NOT DISTINCT FROM r.acl AND proconfig IS NOT DISTINCT FROM r.config)THEN RAISE EXCEPTION 'PRODUCT_TAX268_PUBLISHED_DRIFT';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='saas'AND table_name IN('products','product_variants')AND column_name IN('tax_treatment','tax_rate_bps')AND(column_default IS NOT NULL OR is_nullable<>'YES'))THEN RAISE EXCEPTION 'PRODUCT_TAX268_IMPLICIT_DEFAULT';END IF;
 FOR r IN SELECT oid,proname FROM pg_proc WHERE pronamespace='saas'::regnamespace AND(proname LIKE 'product_tax_%'OR proname LIKE 'tax268_%'OR proname IN('catalog_effective_tax','catalog_tax_read','accounting_tax_report','catalog_create_product_with_tax','catalog_update_product_with_tax','catalog_create_variant_with_tax','catalog_update_variant_with_tax'))LOOP
  IF has_function_privilege('celebix_saas_workflow',r.oid,'EXECUTE')OR has_function_privilege('celebix_saas_app',r.oid,'EXECUTE')IS DISTINCT FROM(r.proname IN('catalog_tax_read','accounting_tax_report','catalog_create_product_with_tax','catalog_update_product_with_tax','catalog_create_variant_with_tax','catalog_update_variant_with_tax'))THEN RAISE EXCEPTION 'PRODUCT_TAX268_RPC_AUTHORITY';END IF;
 END LOOP;
END $assert$;
ROLLBACK;
