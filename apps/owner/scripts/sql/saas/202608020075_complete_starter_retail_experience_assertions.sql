BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $f$
DECLARE app_oid oid:='celebix_saas_app'::regrole; host_oid oid:='celebix_saas_host_resolver'::regrole; valid_v2 jsonb;
BEGIN
 IF pg_catalog.to_regclass('saas.storefront_newsletter_subscribers') IS NULL
   OR pg_catalog.to_regprocedure('saas.public_starter_retail_home(uuid,text,timestamp with time zone)') IS NULL
   OR pg_catalog.strpos(COALESCE((SELECT p.prosrc FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('saas.resolve_public_storefront(text,timestamp with time zone)')),''),'public_starter_retail_home')=0
   OR pg_catalog.to_regprocedure('saas.public_starter_product_detail(uuid,text,timestamp with time zone,text)') IS NULL
   OR pg_catalog.to_regprocedure('saas.public_newsletter_subscribe(text,timestamp with time zone,text,text)') IS NULL
   OR pg_catalog.to_regprocedure('saas.merchant_newsletter_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer)') IS NULL
 THEN RAISE EXCEPTION 'STARTER_RETAIL_API_MISSING'; END IF;
 SELECT pg_catalog.jsonb_build_object(
  'schemaVersion',2,
  'visual',pg_catalog.jsonb_build_object('colorScheme','neutral','headingStyle','serif','cornerStyle','soft','headerStyle','overlay','productCardStyle','editorial','productImageRatio','portrait','headerWidth','wide','sectionSpacing','balanced'),
  'announcement',pg_catalog.jsonb_build_object('enabled',false,'items','[]'::jsonb),
  'navigation',pg_catalog.jsonb_build_object('rootCategoryIds','[]'::jsonb),
  'sections',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','product_row','enabled',true,'heading','Yeni ürünler','source','latest','limit',8),pg_catalog.jsonb_build_object('kind','value_propositions','enabled',true,'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('icon','sparkles','heading','Özenli seçki','body','Mağaza tarafından hazırlanan ürünler.'),pg_catalog.jsonb_build_object('icon','heart','heading','Güvenli deneyim','body','Kalıcı mağaza verileriyle sunulur.')))),
  'productDetail',pg_catalog.jsonb_build_object('galleryStyle','rail','showSku',true,'showBrand',true,'showBreadcrumbs',true,'showRelatedProducts',true,'showApprovedReviews',true,'mobileStickyPurchase',true,'showSizeGuide',true,'informationSections',pg_catalog.jsonb_build_array('description','materials_and_care','certifications','shipping_and_returns')),
  'cart',pg_catalog.jsonb_build_object('showCheckoutReadiness',true,'showShippingProgress',true),
  'footer',pg_catalog.jsonb_build_object('tone','dark','groups',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('heading','Mağaza','links',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','system','destination','/'),pg_catalog.jsonb_build_object('kind','system','destination','/products'))),pg_catalog.jsonb_build_object('heading','Hesap','links',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','system','destination','/account')))),'newsletter',pg_catalog.jsonb_build_object('enabled',false,'heading','Bültene katılın','body','Yeni ürünleri ilk siz öğrenin.','consentLabel','E-posta iletişimine izin veriyorum.'),'social','[]'::jsonb)
 ) INTO valid_v2;
 IF NOT saas.campaign_starter_composition_valid(valid_v2) OR NOT saas.starter_retail_composition_v2_valid(valid_v2) OR saas.campaign_starter_composition_valid(valid_v2||pg_catalog.jsonb_build_object('storeId','10000000-0000-4000-8000-000000000001')) THEN RAISE EXCEPTION 'STARTER_RETAIL_VALIDATION_WEAK'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname='storefront_newsletter_subscribers' AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION 'STARTER_RETAIL_RLS_MISSING'; END IF;
 IF pg_catalog.has_table_privilege(app_oid,'saas.storefront_newsletter_subscribers','SELECT') OR pg_catalog.has_table_privilege(host_oid,'saas.storefront_newsletter_subscribers','INSERT') THEN RAISE EXCEPTION 'STARTER_RETAIL_TABLE_PRIVILEGE_LEAK'; END IF;
 IF NOT pg_catalog.has_function_privilege(host_oid,'saas.public_starter_retail_home(uuid,text,timestamp with time zone)','EXECUTE') OR NOT pg_catalog.has_function_privilege(host_oid,'saas.resolve_public_storefront(text,timestamp with time zone)','EXECUTE') OR NOT pg_catalog.has_function_privilege(host_oid,'saas.public_starter_product_detail(uuid,text,timestamp with time zone,text)','EXECUTE') OR NOT pg_catalog.has_function_privilege(host_oid,'saas.public_newsletter_subscribe(text,timestamp with time zone,text,text)','EXECUTE') OR NOT pg_catalog.has_function_privilege(app_oid,'saas.merchant_newsletter_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer)','EXECUTE') THEN RAISE EXCEPTION 'STARTER_RETAIL_GRANT_MISSING'; END IF;
 IF pg_catalog.has_function_privilege(app_oid,'saas.public_newsletter_subscribe(text,timestamp with time zone,text,text)','EXECUTE') OR pg_catalog.has_function_privilege(host_oid,'saas.merchant_newsletter_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer)','EXECUTE') THEN RAISE EXCEPTION 'STARTER_RETAIL_ROLE_CROSSOVER'; END IF;
END
$f$;
ROLLBACK;
