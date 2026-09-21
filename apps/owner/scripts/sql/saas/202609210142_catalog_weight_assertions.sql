DO $assert$
BEGIN
  IF to_regclass('saas.catalog_weight_store_profiles') IS NULL
    OR to_regclass('saas.catalog_weight_declarations') IS NULL
    OR to_regclass('saas.catalog_weight_operations') IS NULL
    OR to_regprocedure('saas.catalog_weight_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NULL
    OR to_regprocedure('saas.catalog_weight_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,text,boolean,integer)') IS NULL
    OR to_regprocedure('saas.catalog_weight_import(uuid,uuid,text,uuid,uuid,uuid,bigint,bigint,text,text,bigint,text,text,boolean,integer,uuid,timestamp with time zone)') IS NULL
    OR to_regprocedure('saas.catalog_weight_profile_set(uuid,uuid,text,text,uuid,timestamp with time zone)') IS NULL
    OR to_regprocedure('saas.catalog_weight_import_rollback(uuid,uuid,text,uuid,uuid,uuid,timestamp with time zone)') IS NULL
    OR NOT has_function_privilege('celebix_saas_app','saas.catalog_weight_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)','EXECUTE')
    OR NOT has_function_privilege('celebix_saas_app','saas.catalog_weight_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,text,boolean,integer)','EXECUTE')
    OR has_table_privilege('celebix_saas_app','saas.catalog_weight_declarations','SELECT')
    OR has_function_privilege('celebix_saas_app','saas.catalog_weight_import(uuid,uuid,text,uuid,uuid,uuid,bigint,bigint,text,text,bigint,text,text,boolean,integer,uuid,timestamp with time zone)','EXECUTE') THEN
    RAISE EXCEPTION 'CATALOG_WEIGHT_ASSERTION_FAILED';
  END IF;
  IF EXISTS (SELECT 1 FROM saas.catalog_weight_store_profiles)
    OR EXISTS (SELECT 1 FROM saas.catalog_weight_declarations)
    OR EXISTS (SELECT 1 FROM saas.catalog_weight_operations) THEN
    RAISE EXCEPTION 'CATALOG_WEIGHT_MIGRATION_MUST_NOT_SEED_TENANTS';
  END IF;
END $assert$;
