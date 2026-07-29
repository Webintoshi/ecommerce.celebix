BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $f$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['catalog_admin_resources','catalog_admin_resource_products','product_reviews','catalog_import_jobs','catalog_admin_operations'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname=table_name AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION 'CATALOG_ADMIN_RLS_MISSING:%',table_name; END IF;
    IF pg_catalog.has_table_privilege('celebix_saas_app',pg_catalog.format('saas.%I',table_name),'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'CATALOG_ADMIN_DIRECT_WRITE:%',table_name; END IF;
  END LOOP;
  IF to_regprocedure('saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])') IS NULL OR to_regprocedure('saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'CATALOG_ADMIN_API_MISSING'; END IF;
END $f$;
ROLLBACK;
