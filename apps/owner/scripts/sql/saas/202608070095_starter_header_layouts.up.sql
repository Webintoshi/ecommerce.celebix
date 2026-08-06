BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $starter_header_layouts_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.campaign_starter_publications') IS NULL
     OR pg_catalog.to_regclass('saas.storefront_designs') IS NULL
     OR pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_theme_default_composition()') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_theme_composition_upgrade_v2(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid_without_header_layout(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'STARTER_HEADER_LAYOUTS_PRECONDITION_FAILED';
  END IF;
END
$starter_header_layouts_precondition$;

ALTER TABLE saas.campaign_starter_publications DROP CONSTRAINT campaign_starter_publications_config_check;
ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_draft_unified_theme_check;
ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_published_unified_theme_check;

ALTER FUNCTION saas.campaign_starter_composition_valid(jsonb)
  RENAME TO campaign_starter_composition_valid_without_header_layout;

CREATE FUNCTION saas.campaign_starter_composition_valid(p_config jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT CASE p_config->>'schemaVersion'
    WHEN '1' THEN saas.campaign_starter_composition_valid_without_header_layout(p_config)
    WHEN '2' THEN
      saas.campaign_starter_exact_keys(
        p_config->'visual',
        ARRAY['colorScheme','headingStyle','cornerStyle','headerStyle','productCardStyle','productImageRatio','headerWidth','headerLayout','sectionSpacing']
      )
      AND p_config->'visual'->>'headerLayout' IN ('menu_logo_actions','logo_menu_actions','stacked')
      AND saas.campaign_starter_composition_valid_without_header_layout(
        p_config #- ARRAY['visual','headerLayout']
      )
    ELSE false
  END
$function$;

UPDATE saas.campaign_starter_publications
SET config=pg_catalog.jsonb_set(config,ARRAY['visual','headerLayout'],'"menu_logo_actions"'::jsonb,true)
WHERE config->>'schemaVersion'='2' AND NOT (config->'visual'?'headerLayout');

UPDATE saas.storefront_designs
SET draft_config=CASE
      WHEN draft_config->'composition'->>'schemaVersion'='2' AND NOT (draft_config->'composition'->'visual'?'headerLayout')
        THEN pg_catalog.jsonb_set(draft_config,ARRAY['composition','visual','headerLayout'],'"menu_logo_actions"'::jsonb,true)
      ELSE draft_config
    END,
    published_config=CASE
      WHEN published_config->'composition'->>'schemaVersion'='2' AND NOT (published_config->'composition'->'visual'?'headerLayout')
        THEN pg_catalog.jsonb_set(published_config,ARRAY['composition','visual','headerLayout'],'"menu_logo_actions"'::jsonb,true)
      ELSE published_config
    END;

CREATE OR REPLACE FUNCTION saas.storefront_theme_default_composition()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',2,
    'visual',pg_catalog.jsonb_build_object('colorScheme','neutral','headingStyle','serif','cornerStyle','square','headerStyle','overlay','productCardStyle','editorial','productImageRatio','portrait','headerWidth','wide','headerLayout','menu_logo_actions','sectionSpacing','balanced'),
    'announcement',pg_catalog.jsonb_build_object('enabled',true,'items',pg_catalog.jsonb_build_array('Güvenli alışveriş'),'destination','/pages/odeme-teslimat'),
    'navigation',pg_catalog.jsonb_build_object('rootCategoryIds','[]'::jsonb),
    'sections',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','product_row','enabled',true,'heading','Yeni ürünler','source','latest','limit',8)),
    'productDetail',pg_catalog.jsonb_build_object('galleryStyle','grid','showSku',true,'showBrand',true,'showBreadcrumbs',true,'showRelatedProducts',true,'showApprovedReviews',true,'mobileStickyPurchase',true,'showSizeGuide',true,'informationSections',pg_catalog.jsonb_build_array('description','materials_and_care','certifications','shipping_and_returns')),
    'cart',pg_catalog.jsonb_build_object('showCheckoutReadiness',true,'showShippingProgress',false,'showQuantitySelector',true,'trustMessage','Güvenli ödeme'),
    'footer',pg_catalog.jsonb_build_object(
      'tone','dark',
      'groups',pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('heading','Mağaza','links',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','system','destination','/products'),pg_catalog.jsonb_build_object('kind','system','destination','/favorites'))),
        pg_catalog.jsonb_build_object('heading','Hesap','links',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','system','destination','/account')))
      ),
      'newsletter',pg_catalog.jsonb_build_object('enabled',false,'heading','Bizden haber alın','body','Yeni ürün ve mağaza duyurularını e-postanızda alın.','consentLabel','Aydınlatma metnini okudum ve iletişime izin veriyorum.'),
      'social','[]'::jsonb
    )
  )
$function$;

CREATE OR REPLACE FUNCTION saas.storefront_theme_composition_upgrade_v2(p_config jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT CASE
    WHEN p_config->>'schemaVersion'='2' THEN
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          p_config,
          ARRAY['visual','headerLayout'],
          COALESCE(p_config->'visual'->'headerLayout','"menu_logo_actions"'::jsonb),
          true
        ),
        ARRAY['cart','showQuantitySelector'],
        COALESCE(p_config->'cart'->'showQuantitySelector','true'::jsonb),
        true
      )
    WHEN p_config->>'schemaVersion'='1' THEN pg_catalog.jsonb_build_object(
      'schemaVersion',2,
      'visual',(p_config->'visual')||pg_catalog.jsonb_build_object('headerWidth','wide','headerLayout','menu_logo_actions','sectionSpacing','balanced'),
      'announcement',p_config->'announcement',
      'navigation',p_config->'navigation',
      'sections',p_config->'sections',
      'productDetail',(p_config->'productDetail')||pg_catalog.jsonb_build_object('showBreadcrumbs',true,'showApprovedReviews',true,'showSizeGuide',true,'informationSections',pg_catalog.jsonb_build_array('description','materials_and_care','certifications','shipping_and_returns')),
      'cart',(p_config->'cart')||pg_catalog.jsonb_build_object('showQuantitySelector',true),
      'footer',saas.storefront_theme_default_composition()->'footer'
    )
    ELSE saas.storefront_theme_default_composition()
  END
$function$;

ALTER TABLE saas.campaign_starter_publications ADD CONSTRAINT campaign_starter_publications_config_check CHECK(saas.campaign_starter_composition_valid(config));
ALTER TABLE saas.storefront_designs ADD CONSTRAINT storefront_designs_draft_unified_theme_check CHECK(saas.storefront_design_document_valid(store_id,draft_config,true));
ALTER TABLE saas.storefront_designs ADD CONSTRAINT storefront_designs_published_unified_theme_check CHECK(saas.storefront_design_document_valid(store_id,published_config,true));

REVOKE ALL ON FUNCTION saas.campaign_starter_composition_valid(jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

COMMIT;
