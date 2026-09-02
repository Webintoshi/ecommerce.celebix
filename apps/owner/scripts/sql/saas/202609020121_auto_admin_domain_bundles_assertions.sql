DO $assertions$
BEGIN
  IF pg_catalog.to_regclass('saas.domain_bundle_operations') IS NULL
     OR pg_catalog.to_regclass('saas.admin_domain_companion_audit') IS NULL
     OR pg_catalog.to_regprocedure('saas.merchant_store_domain_bundle_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,text,uuid,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.merchant_store_domain_bundle_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint)') IS NULL
     OR pg_catalog.to_regprocedure('saas.merchant_store_domain_bundle_disable(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint)') IS NULL
     OR pg_catalog.to_regprocedure('saas.owner_adopt_admin_domain_companion(uuid,uuid,text,text,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.owner_prepare_admin_domain_companion(uuid,uuid,uuid,text,text,text,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.owner_bind_admin_domain_companion(uuid,bigint,text,jsonb,jsonb,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.guard_global_domain_hostname()') IS NULL
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='saas.admin_domains'::regclass AND attname='management' AND NOT attisdropped)
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='saas.admin_domains'::regclass AND attname='source_storefront_domain_id' AND NOT attisdropped)
     OR pg_catalog.has_table_privilege('celebix_saas_app','saas.domain_bundle_operations','SELECT')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.merchant_store_domain_bundle_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,text,uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'AUTO_ADMIN_DOMAIN_BUNDLE_ASSERTION_FAILED';
  END IF;
END
$assertions$;
