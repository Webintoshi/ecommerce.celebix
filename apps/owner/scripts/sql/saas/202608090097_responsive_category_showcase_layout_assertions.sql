BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $responsive_category_showcase_layout_assertions$
DECLARE selected record;
BEGIN
  IF pg_catalog.to_regprocedure('saas.campaign_starter_category_layout_add_default(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.campaign_starter_category_layout_strip(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.public_starter_retail_presentation_without_category_layout(uuid,timestamp with time zone,boolean)') IS NULL THEN
    RAISE EXCEPTION 'RESPONSIVE_CATEGORY_SHOWCASE_LAYOUT_API_MISSING';
  END IF;

  IF EXISTS(
    SELECT 1 FROM saas.campaign_starter_publications publication
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(publication.config->'sections') section
    WHERE section->>'kind'='category_grid' AND section->>'layout' NOT IN ('duo','grid')
  ) OR EXISTS(
    SELECT 1 FROM saas.storefront_designs design
    WHERE NOT saas.storefront_design_document_valid(design.store_id,design.draft_config,true)
       OR NOT saas.storefront_design_document_valid(design.store_id,design.published_config,true)
  ) THEN
    RAISE EXCEPTION 'RESPONSIVE_CATEGORY_SHOWCASE_LAYOUT_DATA_INVALID';
  END IF;

  FOR selected IN
    SELECT role_name FROM (VALUES
      ('public'),('celebix_saas_identity'),('celebix_saas_app'),('celebix_saas_workflow'),
      ('celebix_saas_host_resolver'),('celebix_saas_bootstrap'),('celebix_saas_observability'),('celebix_saas_migrator')
    ) roles(role_name)
  LOOP
    IF pg_catalog.has_function_privilege(selected.role_name,'saas.campaign_starter_category_layout_add_default(jsonb)','EXECUTE')
       OR pg_catalog.has_function_privilege(selected.role_name,'saas.campaign_starter_category_layout_strip(jsonb)','EXECUTE') THEN
      RAISE EXCEPTION 'RESPONSIVE_CATEGORY_SHOWCASE_LAYOUT_HELPER_EXPOSED';
    END IF;
  END LOOP;

  IF pg_catalog.has_table_privilege('celebix_saas_app','saas.campaign_starter_publications','UPDATE')
     OR pg_catalog.has_table_privilege('celebix_saas_app','saas.storefront_designs','UPDATE') THEN
    RAISE EXCEPTION 'RESPONSIVE_CATEGORY_SHOWCASE_LAYOUT_TABLE_EXPOSED';
  END IF;
END
$responsive_category_showcase_layout_assertions$;

COMMIT;
