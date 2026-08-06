BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $starter_header_layouts_assertions$
DECLARE
  default_composition jsonb;
  candidate text;
BEGIN
  default_composition:=saas.storefront_theme_default_composition();
  IF default_composition->'visual'->>'headerLayout'<>'menu_logo_actions'
     OR NOT saas.campaign_starter_composition_valid(default_composition) THEN
    RAISE EXCEPTION 'STARTER_HEADER_LAYOUT_DEFAULT_INVALID';
  END IF;

  IF saas.campaign_starter_composition_valid(default_composition #- ARRAY['visual','headerLayout'])
     OR saas.campaign_starter_composition_valid(pg_catalog.jsonb_set(default_composition,ARRAY['visual','headerLayout'],'"unknown"'::jsonb,false)) THEN
    RAISE EXCEPTION 'STARTER_HEADER_LAYOUT_CONTRACT_INVALID';
  END IF;

  FOREACH candidate IN ARRAY ARRAY['menu_logo_actions','logo_menu_actions','stacked'] LOOP
    IF NOT saas.campaign_starter_composition_valid(
      pg_catalog.jsonb_set(default_composition,ARRAY['visual','headerLayout'],pg_catalog.to_jsonb(candidate),false)
    ) THEN
      RAISE EXCEPTION 'STARTER_HEADER_LAYOUT_OPTION_INVALID';
    END IF;
  END LOOP;

  IF EXISTS(
    SELECT 1 FROM saas.campaign_starter_publications
    WHERE config->>'schemaVersion'='2'
      AND config->'visual'->>'headerLayout' NOT IN ('menu_logo_actions','logo_menu_actions','stacked')
  ) OR EXISTS(
    SELECT 1 FROM saas.storefront_designs
    WHERE draft_config->'composition'->>'schemaVersion'='2'
      AND (
        draft_config->'composition'->'visual'->>'headerLayout' NOT IN ('menu_logo_actions','logo_menu_actions','stacked')
        OR published_config->'composition'->'visual'->>'headerLayout' NOT IN ('menu_logo_actions','logo_menu_actions','stacked')
      )
  ) THEN
    RAISE EXCEPTION 'STARTER_HEADER_LAYOUT_PERSISTED_DATA_INVALID';
  END IF;
END
$starter_header_layouts_assertions$;

COMMIT;
