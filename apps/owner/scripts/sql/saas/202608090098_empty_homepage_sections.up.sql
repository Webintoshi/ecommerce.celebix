BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $empty_homepage_sections_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.merchant_admin_records') IS NULL
     OR pg_catalog.to_regclass('saas.campaign_starter_publications') IS NULL
     OR pg_catalog.to_regclass('saas.storefront_designs') IS NULL
     OR pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_document_valid(uuid,jsonb,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid_without_empty_homepage(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'EMPTY_HOMEPAGE_SECTIONS_PRECONDITION_FAILED';
  END IF;
END
$empty_homepage_sections_precondition$;

ALTER TABLE saas.campaign_starter_publications
  DROP CONSTRAINT campaign_starter_publications_config_check;
ALTER TABLE saas.storefront_designs
  DROP CONSTRAINT storefront_designs_draft_unified_theme_check;
ALTER TABLE saas.storefront_designs
  DROP CONSTRAINT storefront_designs_published_unified_theme_check;

ALTER FUNCTION saas.campaign_starter_composition_valid(jsonb)
  RENAME TO campaign_starter_composition_valid_without_empty_homepage;

CREATE FUNCTION saas.campaign_starter_composition_valid(p_config jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  section_count integer;
  validation_section constant jsonb:=pg_catalog.jsonb_build_object(
    'kind','product_row',
    'enabled',true,
    'heading','Validation',
    'source','latest',
    'limit',4
  );
BEGIN
  IF NOT (p_config?'sections')
     OR pg_catalog.jsonb_typeof(p_config->'sections') IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;

  section_count:=pg_catalog.jsonb_array_length(p_config->'sections');
  IF section_count>12 THEN RETURN false; END IF;
  IF section_count>0 THEN
    RETURN saas.campaign_starter_composition_valid_without_empty_homepage(p_config);
  END IF;

  RETURN saas.campaign_starter_composition_valid_without_empty_homepage(
    pg_catalog.jsonb_set(
      p_config,
      ARRAY['sections'],
      pg_catalog.jsonb_build_array(validation_section),
      false
    )
  );
EXCEPTION WHEN others THEN
  RETURN false;
END
$function$;

ALTER TABLE saas.campaign_starter_publications
  ADD CONSTRAINT campaign_starter_publications_config_check
  CHECK(saas.campaign_starter_composition_valid(config));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_draft_unified_theme_check
  CHECK(saas.storefront_design_document_valid(store_id,draft_config,true));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_published_unified_theme_check
  CHECK(saas.storefront_design_document_valid(store_id,published_config,true));

REVOKE ALL ON FUNCTION
  saas.campaign_starter_composition_valid_without_empty_homepage(jsonb),
  saas.campaign_starter_composition_valid(jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

COMMIT;
