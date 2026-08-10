BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $single_authority_category_showcase_assertions$
DECLARE selected record;
BEGIN
  IF pg_catalog.to_regprocedure('saas.merchant_admin_config_valid_without_single_authority_category_showcase(text,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.public_starter_retail_presentation_without_single_authority_category_showcase(uuid,timestamp with time zone,boolean)') IS NULL THEN
    RAISE EXCEPTION 'SINGLE_AUTHORITY_CATEGORY_SHOWCASE_API_MISSING';
  END IF;
  IF EXISTS(
    SELECT 1 FROM saas.merchant_admin_records
    WHERE record_kind='category_showcase'
      AND (NOT (config?'layout') OR config->>'layout' NOT IN ('duo','grid'))
  ) THEN
    RAISE EXCEPTION 'SINGLE_AUTHORITY_CATEGORY_SHOWCASE_DATA_INVALID';
  END IF;
  FOR selected IN SELECT role_name FROM (VALUES
    ('public'),('celebix_saas_identity'),('celebix_saas_app'),('celebix_saas_workflow'),
    ('celebix_saas_host_resolver'),('celebix_saas_bootstrap'),('celebix_saas_observability'),('celebix_saas_migrator')
  ) roles(role_name) LOOP
    IF pg_catalog.has_function_privilege(selected.role_name,'saas.merchant_admin_config_valid_without_single_authority_category_showcase(text,jsonb)','EXECUTE')
       OR pg_catalog.has_function_privilege(selected.role_name,'saas.public_starter_retail_presentation_without_single_authority_category_showcase(uuid,timestamp with time zone,boolean)','EXECUTE') THEN
      RAISE EXCEPTION 'SINGLE_AUTHORITY_CATEGORY_SHOWCASE_HELPER_EXPOSED';
    END IF;
  END LOOP;
  IF pg_catalog.has_table_privilege('celebix_saas_app','saas.merchant_admin_records','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'SINGLE_AUTHORITY_CATEGORY_SHOWCASE_TABLE_EXPOSED';
  END IF;
END
$single_authority_category_showcase_assertions$;

COMMIT;
