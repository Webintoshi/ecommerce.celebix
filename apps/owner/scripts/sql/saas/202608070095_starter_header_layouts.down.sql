BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $starter_header_layouts_down_guard$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_starter_header_layouts_down',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'STARTER_HEADER_LAYOUTS_DOWN_BLOCKED';
  END IF;
  IF EXISTS(
    SELECT 1 FROM saas.campaign_starter_publications
    WHERE config->>'schemaVersion'='2' AND config->'visual'->>'headerLayout'<>'menu_logo_actions'
  ) OR EXISTS(
    SELECT 1 FROM saas.storefront_designs
    WHERE draft_config->'composition'->'visual'->>'headerLayout'<>'menu_logo_actions'
       OR published_config->'composition'->'visual'->>'headerLayout'<>'menu_logo_actions'
  ) THEN
    RAISE EXCEPTION 'STARTER_HEADER_LAYOUTS_DOWN_DATA_LOSS';
  END IF;
END
$starter_header_layouts_down_guard$;

ALTER TABLE saas.campaign_starter_publications DROP CONSTRAINT campaign_starter_publications_config_check;
ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_draft_unified_theme_check;
ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_published_unified_theme_check;

UPDATE saas.campaign_starter_publications
SET config=config #- ARRAY['visual','headerLayout']
WHERE config->>'schemaVersion'='2';

UPDATE saas.storefront_designs
SET draft_config=draft_config #- ARRAY['composition','visual','headerLayout'],
    published_config=published_config #- ARRAY['composition','visual','headerLayout'];

DROP FUNCTION saas.campaign_starter_composition_valid(jsonb);
ALTER FUNCTION saas.campaign_starter_composition_valid_without_header_layout(jsonb)
  RENAME TO campaign_starter_composition_valid;

CREATE OR REPLACE FUNCTION saas.storefront_theme_default_composition()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',2,
    'visual',pg_catalog.jsonb_build_object('colorScheme','neutral','headingStyle','serif','cornerStyle','square','headerStyle','overlay','productCardStyle','editorial','productImageRatio','portrait','headerWidth','wide','sectionSpacing','balanced'),
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
      CASE WHEN p_config->'cart'?'showQuantitySelector' THEN p_config
        ELSE pg_catalog.jsonb_set(p_config,ARRAY['cart','showQuantitySelector'],'true'::jsonb,true) END
    WHEN p_config->>'schemaVersion'='1' THEN pg_catalog.jsonb_build_object(
      'schemaVersion',2,
      'visual',(p_config->'visual')||pg_catalog.jsonb_build_object('headerWidth','wide','sectionSpacing','balanced'),
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

COMMIT;
