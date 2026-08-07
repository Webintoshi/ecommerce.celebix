BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $storefront_google_fonts_typography_down_guard$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_storefront_typography_down',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'STOREFRONT_GOOGLE_FONTS_TYPOGRAPHY_DOWN_BLOCKED';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM saas.storefront_designs
    WHERE draft_config?'typography' OR published_config?'typography'
  ) THEN
    RAISE EXCEPTION 'STOREFRONT_GOOGLE_FONTS_TYPOGRAPHY_DOWN_DATA_LOSS';
  END IF;
END
$storefront_google_fonts_typography_down_guard$;

ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_draft_unified_theme_check;
ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_published_unified_theme_check;

DROP FUNCTION saas.storefront_design_public_payload(uuid,jsonb,bigint,timestamptz);
ALTER FUNCTION saas.storefront_design_public_payload_without_typography(uuid,jsonb,bigint,timestamptz)
  RENAME TO storefront_design_public_payload;

DROP FUNCTION saas.storefront_design_document_valid(uuid,jsonb,boolean);
ALTER FUNCTION saas.storefront_design_document_without_typography_valid(uuid,jsonb,boolean)
  RENAME TO storefront_design_document_valid;

DROP FUNCTION saas.storefront_design_typography_default(text);
DROP FUNCTION saas.storefront_design_typography_valid(jsonb);
DROP FUNCTION saas.storefront_design_font_option_valid(jsonb);

ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_draft_unified_theme_check
  CHECK(saas.storefront_design_document_valid(store_id,draft_config,true));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_published_unified_theme_check
  CHECK(saas.storefront_design_document_valid(store_id,published_config,true));

REVOKE ALL ON FUNCTION
  saas.storefront_design_document_valid(uuid,jsonb,boolean),
  saas.storefront_design_public_payload(uuid,jsonb,bigint,timestamptz)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

COMMIT;
