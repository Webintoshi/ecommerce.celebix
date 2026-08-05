BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $storefront_design_publication_timestamp_fix$
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_designs') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,bigint)') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint constraint_row
       WHERE constraint_row.conrelid='saas.storefront_designs'::pg_catalog.regclass
         AND constraint_row.conname='storefront_designs_check2'
         AND constraint_row.contype='c'
     ) THEN
    RAISE EXCEPTION 'STOREFRONT_DESIGN_PUBLICATION_TIMESTAMP_FIX_PRECONDITION_FAILED';
  END IF;
END
$storefront_design_publication_timestamp_fix$;

ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_check2;

COMMIT;

