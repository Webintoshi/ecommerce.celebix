BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $modular_homepage_builder_assertions$
DECLARE
  sample jsonb;
  duplicate_ids jsonb;
  selected record;
BEGIN
  IF pg_catalog.to_regprocedure('saas.storefront_theme_composition_without_home_ids(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_theme_composition_with_home_ids(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid_without_home_ids(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_document_with_home_ids(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_document_valid_without_home_ids(uuid,jsonb,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('saas.public_starter_retail_presentation_without_home_ids(uuid,timestamp with time zone,boolean)') IS NULL THEN
    RAISE EXCEPTION 'MODULAR_HOMEPAGE_BUILDER_API_MISSING';
  END IF;

  sample:=saas.storefront_theme_composition_with_home_ids(saas.storefront_theme_default_composition());
  IF sample->>'schemaVersion'<>'3'
     OR NOT saas.campaign_starter_composition_valid(sample)
     OR EXISTS(
       SELECT 1 FROM pg_catalog.jsonb_array_elements(sample->'sections') section(value)
       WHERE section.value->>'sectionId'!~'^home_[a-z0-9_]{3,75}$'
     ) THEN
    RAISE EXCEPTION 'MODULAR_HOMEPAGE_BUILDER_COMPOSITION_INVALID';
  END IF;

  duplicate_ids:=pg_catalog.jsonb_set(
    sample,
    ARRAY['sections'],
    (sample->'sections')||pg_catalog.jsonb_build_array(sample->'sections'->0),
    false
  );
  IF saas.campaign_starter_composition_valid(duplicate_ids)
     OR saas.campaign_starter_composition_valid(
       pg_catalog.jsonb_set(sample,ARRAY['sections','0','sectionId'],'"foreign"'::jsonb,false)
     ) THEN
    RAISE EXCEPTION 'MODULAR_HOMEPAGE_BUILDER_ID_REJECTION_INVALID';
  END IF;

  IF EXISTS(
    SELECT 1 FROM saas.storefront_designs design
    WHERE design.schema_version<>4
       OR design.draft_config->>'schemaVersion'<>'4'
       OR design.published_config->>'schemaVersion'<>'4'
       OR design.draft_config->'composition'->>'schemaVersion'<>'3'
       OR design.published_config->'composition'->>'schemaVersion'<>'3'
       OR NOT saas.storefront_design_document_valid(design.store_id,design.draft_config,true)
       OR NOT saas.storefront_design_document_valid(design.store_id,design.published_config,true)
       OR design.draft_config::text LIKE '%"qualityScore"%'
       OR design.published_config::text LIKE '%"qualityScore"%'
  ) THEN
    RAISE EXCEPTION 'MODULAR_HOMEPAGE_BUILDER_DATA_INVALID';
  END IF;

  IF pg_catalog.strpos(
    (SELECT procedure.prosrc FROM pg_catalog.pg_proc procedure WHERE procedure.oid='saas.public_starter_retail_presentation_without_category_layout(uuid,timestamp with time zone,boolean)'::regprocedure),
    'sectionId'
  )=0 THEN
    RAISE EXCEPTION 'MODULAR_HOMEPAGE_BUILDER_PUBLIC_ID_PROJECTION_MISSING';
  END IF;

  FOR selected IN SELECT role_name FROM (VALUES
    ('public'),('celebix_saas_identity'),('celebix_saas_app'),('celebix_saas_workflow'),
    ('celebix_saas_host_resolver'),('celebix_saas_bootstrap'),('celebix_saas_observability'),('celebix_saas_migrator')
  ) roles(role_name) LOOP
    IF pg_catalog.has_function_privilege(selected.role_name,'saas.storefront_theme_composition_without_home_ids(jsonb)','EXECUTE')
       OR pg_catalog.has_function_privilege(selected.role_name,'saas.storefront_theme_composition_with_home_ids(jsonb)','EXECUTE')
       OR pg_catalog.has_function_privilege(selected.role_name,'saas.campaign_starter_composition_valid_without_home_ids(jsonb)','EXECUTE')
       OR pg_catalog.has_function_privilege(selected.role_name,'saas.storefront_design_document_with_home_ids(jsonb)','EXECUTE')
       OR pg_catalog.has_function_privilege(selected.role_name,'saas.storefront_design_document_valid_without_home_ids(uuid,jsonb,boolean)','EXECUTE')
       OR pg_catalog.has_function_privilege(selected.role_name,'saas.public_starter_retail_presentation_without_home_ids(uuid,timestamp with time zone,boolean)','EXECUTE') THEN
      RAISE EXCEPTION 'MODULAR_HOMEPAGE_BUILDER_HELPER_EXPOSED';
    END IF;
  END LOOP;
END
$modular_homepage_builder_assertions$;

COMMIT;
