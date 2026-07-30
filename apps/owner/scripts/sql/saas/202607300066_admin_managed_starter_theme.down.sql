-- Guarded rollback for Phase 3Y admin-managed starter-theme presentation authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regprocedure('saas.public_starter_presentation(uuid,timestamp with time zone)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_required_action_without_starter_theme(text,boolean)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_config_valid_without_starter_theme(text,jsonb)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_list_without_starter_theme(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_list_events_without_starter_theme(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_get_record_without_starter_theme(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid)') IS NULL
  THEN RAISE EXCEPTION 'ADMIN_MANAGED_STARTER_THEME_DOWN_SOURCE_INVALID'; END IF;
END
$f$;

LOCK TABLE saas.merchant_admin_records IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_events IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_operations IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.storefront_assets IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.storefront_asset_operations IN ACCESS EXCLUSIVE MODE;

ALTER TABLE saas.merchant_admin_events DISABLE TRIGGER merchant_admin_events_immutable;
ALTER TABLE saas.merchant_admin_operations DISABLE TRIGGER merchant_admin_operations_immutable;
DELETE FROM saas.merchant_admin_operations WHERE result_payload->>'kind'='theme_setting';
DELETE FROM saas.merchant_admin_events WHERE record_kind='theme_setting';
DELETE FROM saas.merchant_admin_records WHERE record_kind='theme_setting';
ALTER TABLE saas.merchant_admin_events ENABLE TRIGGER merchant_admin_events_immutable;
ALTER TABLE saas.merchant_admin_operations ENABLE TRIGGER merchant_admin_operations_immutable;

CREATE OR REPLACE FUNCTION saas.resolve_public_storefront(p_hostname text, p_now timestamptz)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE projection jsonb;
BEGIN
  IF p_now IS NULL OR p_hostname IS NULL OR p_hostname<>pg_catalog.lower(p_hostname)
     OR pg_catalog.char_length(p_hostname) NOT BETWEEN 3 AND 253 OR p_hostname~'[*:/?#@[:space:][:cntrl:]]'
     OR p_hostname!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',1,'id',store.id,'name',store.name,'slug',store.slug,
    'hostname',domain.hostname,'primaryHostname',primary_domain.hostname,
    'canonicalUrl','https://'||domain.hostname||'/','currency',store.currency,
    'locale',store.locale,'themeKey',store.theme_key
  ) INTO projection
  FROM saas.store_domains AS domain
  JOIN saas.stores AS store ON store.id=domain.store_id AND store.status='active'
  JOIN saas.store_domains AS primary_domain ON primary_domain.store_id=store.id
    AND primary_domain.status='active' AND primary_domain.is_primary AND primary_domain.verified_at<=p_now
  WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.verified_at<=p_now;
  RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'not_found' ELSE 'found' END,projection;
END
$f$;

DROP FUNCTION saas.public_starter_presentation(uuid,timestamptz);
DROP FUNCTION saas.storefront_asset_create(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint);
DROP FUNCTION saas.storefront_asset_list(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,boolean);
DROP FUNCTION saas.storefront_asset_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.storefront_asset_recover(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text);
DROP FUNCTION saas.storefront_asset_operation_replay(uuid,uuid,text,text);
DROP FUNCTION saas.public_storefront_asset(uuid,text,jsonb);
DROP FUNCTION saas.storefront_asset_projection(uuid,uuid);
DROP TABLE saas.storefront_asset_operations;
DROP TABLE saas.storefront_assets;
DROP FUNCTION saas.guard_storefront_asset_operation_mutation();
DROP FUNCTION saas.guard_storefront_asset_authority();
DROP FUNCTION saas.merchant_admin_required_action(text,boolean);
DROP FUNCTION saas.merchant_admin_config_valid(text,jsonb);
DROP FUNCTION saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid);

ALTER FUNCTION saas.merchant_admin_required_action_without_starter_theme(text,boolean)
  RENAME TO merchant_admin_required_action;
ALTER FUNCTION saas.merchant_admin_config_valid_without_starter_theme(text,jsonb)
  RENAME TO merchant_admin_config_valid;
ALTER FUNCTION saas.merchant_admin_list_without_starter_theme(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text)
  RENAME TO merchant_admin_list;
ALTER FUNCTION saas.merchant_admin_list_events_without_starter_theme(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text)
  RENAME TO merchant_admin_list_events;
ALTER FUNCTION saas.merchant_admin_get_record_without_starter_theme(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid)
  RENAME TO merchant_admin_get_record;

ALTER TABLE saas.merchant_admin_records
  DROP CONSTRAINT merchant_admin_records_record_kind_check;
ALTER TABLE saas.merchant_admin_records
  ADD CONSTRAINT merchant_admin_records_record_kind_check CHECK(record_kind IN(
    'discount','lucky_wheel','email_campaign','phone_campaign','whatsapp_campaign','blog_post','page','policy',
    'marketplace_connection','general_setting','language_setting','payment_setting','shipping_setting','administrator_invite',
    'accounting_profile','invoice_integration','seo_control','sitemap','social_preview','code_integration','indexing_request',
    'notification_setting','hero_banner','promotion_banner','marquee_setting','seo_geo_profile','seo_internal_link',
    'seo_content_entry','seo_category_entry','seo_page_entry','seo_product_entry','ai_setting'
  ));

REVOKE ALL ON FUNCTION
  saas.merchant_admin_required_action(text,boolean),
  saas.merchant_admin_config_valid(text,jsonb),
  saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),
  saas.resolve_public_storefront(text,timestamptz)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid)
TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.resolve_public_storefront(text,timestamptz)
TO celebix_saas_host_resolver;

COMMIT;
