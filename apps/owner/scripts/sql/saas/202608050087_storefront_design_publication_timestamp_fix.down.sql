BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $storefront_design_publication_timestamp_fix_down$
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_designs') IS NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint constraint_row
       WHERE constraint_row.conrelid='saas.storefront_designs'::pg_catalog.regclass
         AND constraint_row.conname='storefront_designs_check2'
     ) THEN
    RAISE EXCEPTION 'STOREFRONT_DESIGN_PUBLICATION_TIMESTAMP_FIX_DOWN_PRECONDITION_FAILED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM saas.storefront_designs design
    WHERE design.draft_version>1
      AND design.draft_updated_at < design.published_at
  ) THEN
    RAISE EXCEPTION 'STOREFRONT_DESIGN_PUBLICATION_TIMESTAMP_FIX_DOWN_BLOCKED';
  END IF;
END
$storefront_design_publication_timestamp_fix_down$;

ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_check2
  CHECK(draft_updated_at>=published_at OR draft_version=1);

COMMIT;

