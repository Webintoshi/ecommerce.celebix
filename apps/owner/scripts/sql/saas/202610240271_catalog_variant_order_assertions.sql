BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assert$ DECLARE r record;actual record;BEGIN
 IF (SELECT count(*)FROM saas.catalog_variant_order271_backup)<>8 THEN RAISE EXCEPTION 'VARIANT_ORDER271_BACKUP_INCOMPLETE';END IF;
 FOR r IN SELECT * FROM saas.catalog_variant_order271_backup LOOP
 SELECT * INTO actual FROM pg_proc WHERE oid=to_regprocedure(r.signature);
 IF actual.oid IS NULL OR encode(sha256(convert_to(pg_get_functiondef(actual.oid),'UTF8')),'hex')IS DISTINCT FROM r.published_sha256 OR actual.proowner<>r.owner_oid OR actual.proacl IS DISTINCT FROM r.acl OR actual.proconfig IS DISTINCT FROM r.config
 THEN RAISE EXCEPTION 'VARIANT_ORDER271_PUBLISHED_DRIFT:%',r.signature;END IF;
 IF to_regprocedure(r.clone_signature)IS NULL OR has_function_privilege('public',r.clone_signature,'EXECUTE')OR has_function_privilege('celebix_saas_app',r.clone_signature,'EXECUTE')THEN RAISE EXCEPTION 'VARIANT_ORDER271_CLONE_ACCESS:%',r.clone_signature;END IF;
 END LOOP;
 FOR r IN SELECT unnest(ARRAY['catalog_variant_order_state','catalog_variant_order_operations','catalog_variant_order271_backup','catalog_variant_order271_functions'])name LOOP
 IF has_table_privilege('celebix_saas_app','saas.'||r.name,'SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_host_resolver','saas.'||r.name,'SELECT,INSERT,UPDATE,DELETE')THEN RAISE EXCEPTION 'VARIANT_ORDER271_PRIVATE_TABLE_ACCESS:%',r.name;END IF;
 END LOOP;
 FOR r IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname IN('catalog_get_variant_order','catalog_reorder_variants','catalog_recover_variant_order','catalog_variant_order_projection','catalog_variant_order_rank','catalog_variant_order_sort_payload')LOOP
 IF has_function_privilege('public',r.signature,'EXECUTE')THEN RAISE EXCEPTION 'VARIANT_ORDER271_PUBLIC_ACCESS:%',r.signature;END IF;
 IF r.proname IN('catalog_get_variant_order','catalog_reorder_variants','catalog_recover_variant_order')THEN
 IF NOT has_function_privilege('celebix_saas_app',r.signature,'EXECUTE')THEN RAISE EXCEPTION 'VARIANT_ORDER271_APP_ENTRYPOINT_MISSING';END IF;
 ELSE IF has_function_privilege('celebix_saas_app',r.signature,'EXECUTE')THEN RAISE EXCEPTION 'VARIANT_ORDER271_PRIVATE_HELPER_ACCESS';END IF;END IF;
 END LOOP;
 IF (SELECT count(*)FROM saas.catalog_variant_order271_functions)<>22 THEN RAISE EXCEPTION 'VARIANT_ORDER271_FUNCTION_SET_INCOMPLETE';END IF;
 FOR r IN SELECT * FROM saas.catalog_variant_order271_functions LOOP
 SELECT * INTO actual FROM pg_proc WHERE oid=to_regprocedure(r.signature);
 IF actual.oid IS NULL OR encode(sha256(convert_to(pg_get_functiondef(actual.oid),'UTF8')),'hex')IS DISTINCT FROM r.body_hash OR actual.proowner<>r.owner_oid OR actual.proacl IS DISTINCT FROM r.acl OR actual.proconfig IS DISTINCT FROM r.config OR actual.prosecdef<>r.definer OR actual.provolatile<>r.volatility THEN RAISE EXCEPTION 'VARIANT_ORDER271_FUNCTION_DRIFT:%',r.signature;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.product_variants'::regclass AND attname IN('sort_order','position','variant_order'))THEN RAISE EXCEPTION 'VARIANT_ORDER271_BUSINESS_SCHEMA_CHANGED';END IF;
END $assert$;
COMMIT;
