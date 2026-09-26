DO $assertions$
DECLARE reorder_function regprocedure:=
  'saas.catalog_reorder_categories(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,jsonb)'::regprocedure;
  recovery_function regprocedure:=
  'saas.catalog_recover_category_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)'::regprocedure;
  guard_function regprocedure:='saas.guard_catalog_category_order_operation_mutation()'::regprocedure;
  source text;
BEGIN
  SELECT proc.prosrc INTO source FROM pg_catalog.pg_proc AS proc WHERE proc.oid=reorder_function;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='saas.catalog_categories'::regclass AND attname='image_asset_id' AND NOT attisdropped)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.catalog_categories'::regclass AND conname='catalog_categories_image_asset_fk')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid='saas.catalog_category_order_operations'::regclass AND relrowsecurity AND relforcerowsecurity)
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.catalog_category_order_operations','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_function_privilege('public',guard_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app',guard_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_workflow',guard_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',guard_function,'EXECUTE')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.catalog_category_order_operations'::regclass
      AND tgname='catalog_category_order_operations_immutable' AND tgfoid=guard_function AND tgenabled='O' AND tgtype=27 AND NOT tgisinternal)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=guard_function AND proconfig=ARRAY['search_path=pg_catalog, saas'])
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app',reorder_function,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app',recovery_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',reorder_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',recovery_function,'EXECUTE')
    OR pg_catalog.strpos(source,'order_membership_changed')=0
    OR pg_catalog.strpos(source,'expectedVersions')=0
    OR pg_catalog.strpos(source,'pg_advisory_xact_lock')=0
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=reorder_function AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, saas'])
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid IN(reorder_function,recovery_function,guard_function) AND pg_catalog.pg_get_userbyid(proowner)<>'celebix_saas_owner')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid='saas.storefront_asset_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure AND pg_catalog.strpos(prosrc,'category.image_asset_id=p_asset_id')>0)
  THEN RAISE EXCEPTION 'CATEGORY_IMAGES_AND_ORDER_ASSERTION_FAILED'; END IF;
END $assertions$;
