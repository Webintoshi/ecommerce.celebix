BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $storefront_design_publication_timestamp_fix_assertions$
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_designs') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,bigint)') IS NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint constraint_row
       WHERE constraint_row.conrelid='saas.storefront_designs'::pg_catalog.regclass
         AND constraint_row.conname='storefront_designs_check2'
     )
     OR pg_catalog.has_table_privilege('celebix_saas_app','saas.storefront_designs','SELECT')
     OR pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.storefront_designs','SELECT') THEN
    RAISE EXCEPTION 'storefront_design_publication_timestamp_fix_invalid';
  END IF;
END
$storefront_design_publication_timestamp_fix_assertions$;

COMMIT;

