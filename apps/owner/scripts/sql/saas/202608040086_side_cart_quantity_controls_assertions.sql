BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $side_cart_quantity_selector_assertions$
DECLARE default_composition jsonb;
BEGIN
  default_composition:=saas.storefront_theme_default_composition();
  IF default_composition->'cart'->'showQuantitySelector' IS DISTINCT FROM 'true'::jsonb
     OR NOT saas.campaign_starter_composition_valid(default_composition) THEN
    RAISE EXCEPTION 'SIDE_CART_QUANTITY_SELECTOR_DEFAULT_INVALID';
  END IF;

  IF saas.campaign_starter_composition_valid(default_composition #- ARRAY['cart','showQuantitySelector'])
     OR saas.campaign_starter_composition_valid(
       pg_catalog.jsonb_set(default_composition,ARRAY['cart','showQuantitySelector'],'"true"'::jsonb,false)
     ) THEN
    RAISE EXCEPTION 'SIDE_CART_QUANTITY_SELECTOR_CONTRACT_INVALID';
  END IF;

  IF EXISTS(
    SELECT 1 FROM saas.campaign_starter_publications publication
    WHERE publication.config->>'schemaVersion'='2'
      AND pg_catalog.jsonb_typeof(publication.config->'cart'->'showQuantitySelector') IS DISTINCT FROM 'boolean'
  ) OR EXISTS(
    SELECT 1 FROM saas.storefront_designs design
    WHERE pg_catalog.jsonb_typeof(design.draft_config->'composition'->'cart'->'showQuantitySelector') IS DISTINCT FROM 'boolean'
       OR pg_catalog.jsonb_typeof(design.published_config->'composition'->'cart'->'showQuantitySelector') IS DISTINCT FROM 'boolean'
  ) THEN
    RAISE EXCEPTION 'SIDE_CART_QUANTITY_SELECTOR_PUBLICATION_INVALID';
  END IF;
END
$side_cart_quantity_selector_assertions$;

COMMIT;
