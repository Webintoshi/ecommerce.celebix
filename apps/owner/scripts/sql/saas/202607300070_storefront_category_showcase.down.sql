-- Guarded rollback for Phase 3Z category-showcase authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
 IF pg_catalog.to_regprocedure('saas.public_list_products_by_category(uuid,text,timestamp with time zone,text,integer)') IS NULL
   OR pg_catalog.to_regprocedure('saas.merchant_admin_save_without_category_showcase(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)') IS NULL
   OR pg_catalog.to_regprocedure('saas.storefront_asset_create_without_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint)') IS NULL
   OR pg_catalog.to_regprocedure('saas.public_starter_presentation_without_category_showcase(uuid,timestamp with time zone,boolean)') IS NULL
 THEN RAISE EXCEPTION 'STOREFRONT_CATEGORY_SHOWCASE_DOWN_SOURCE_INVALID'; END IF;
END
$f$;

LOCK TABLE saas.merchant_admin_records IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_events IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_operations IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.storefront_assets IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.storefront_asset_operations IN ACCESS EXCLUSIVE MODE;

ALTER TABLE saas.merchant_admin_events DISABLE TRIGGER merchant_admin_events_immutable;
ALTER TABLE saas.merchant_admin_operations DISABLE TRIGGER merchant_admin_operations_immutable;
DELETE FROM saas.merchant_admin_operations WHERE result_payload->>'kind'='category_showcase';
DELETE FROM saas.merchant_admin_operations operation
USING saas.merchant_admin_events event
WHERE operation.operation_id=event.id
  AND operation.store_id=event.store_id
  AND event.record_kind='theme_setting'
  AND event.summary->'config'?'logoAssetId';
DELETE FROM saas.merchant_admin_events WHERE record_kind='category_showcase';
DELETE FROM saas.merchant_admin_events WHERE record_kind='theme_setting' AND summary->'config'?'logoAssetId';
DELETE FROM saas.merchant_admin_records WHERE record_kind='category_showcase';
UPDATE saas.merchant_admin_records SET config=config-'logoAssetId',version=version+1,updated_at=GREATEST(updated_at,pg_catalog.clock_timestamp()) WHERE record_kind='theme_setting' AND config?'logoAssetId';
ALTER TABLE saas.merchant_admin_events ENABLE TRIGGER merchant_admin_events_immutable;
ALTER TABLE saas.merchant_admin_operations ENABLE TRIGGER merchant_admin_operations_immutable;

ALTER TABLE saas.storefront_asset_operations DISABLE TRIGGER storefront_asset_operations_immutable;
DELETE FROM saas.storefront_asset_operations WHERE result_payload->'asset'->>'kind'='category';
DELETE FROM saas.storefront_assets WHERE asset_kind='category';
ALTER TABLE saas.storefront_asset_operations ENABLE TRIGGER storefront_asset_operations_immutable;

DROP FUNCTION saas.public_list_products_by_category(uuid,text,timestamptz,text,integer);
DROP FUNCTION saas.public_category_product_projection(uuid,uuid,timestamptz);
DROP FUNCTION saas.public_starter_presentation(uuid,timestamptz);
DROP FUNCTION saas.public_starter_presentation(uuid,timestamptz,boolean);
ALTER FUNCTION saas.public_starter_presentation_without_category_showcase(uuid,timestamptz,boolean) RENAME TO public_starter_presentation;
CREATE FUNCTION saas.public_starter_presentation(p_store_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT saas.public_starter_presentation(p_store_id,p_now,false) $f$;

DROP FUNCTION saas.storefront_asset_create(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint);
DROP FUNCTION saas.storefront_asset_list(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,boolean);
ALTER FUNCTION saas.storefront_asset_create_without_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint) RENAME TO storefront_asset_create;
ALTER FUNCTION saas.storefront_asset_list_without_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,boolean) RENAME TO storefront_asset_list;

DROP FUNCTION saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text);
DROP FUNCTION saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid);
DROP FUNCTION saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.merchant_admin_config_valid(text,jsonb);
DROP FUNCTION saas.merchant_admin_required_action(text,boolean);
ALTER FUNCTION saas.merchant_admin_save_without_category_showcase(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text) RENAME TO merchant_admin_save;
ALTER FUNCTION saas.merchant_admin_get_record_without_category_showcase(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid) RENAME TO merchant_admin_get_record;
ALTER FUNCTION saas.merchant_admin_list_events_without_category_showcase(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text) RENAME TO merchant_admin_list_events;
ALTER FUNCTION saas.merchant_admin_list_without_category_showcase(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text) RENAME TO merchant_admin_list;
ALTER FUNCTION saas.merchant_admin_config_valid_without_category_showcase(text,jsonb) RENAME TO merchant_admin_config_valid;
ALTER FUNCTION saas.merchant_admin_required_action_without_category_showcase(text,boolean) RENAME TO merchant_admin_required_action;

ALTER TABLE saas.storefront_assets DROP CONSTRAINT storefront_assets_kind_check;
ALTER TABLE saas.storefront_assets ADD CONSTRAINT storefront_assets_kind_check CHECK(asset_kind IN('logo','hero','social','favicon'));
ALTER TABLE saas.merchant_admin_records DROP CONSTRAINT merchant_admin_records_record_kind_check;
ALTER TABLE saas.merchant_admin_records ADD CONSTRAINT merchant_admin_records_record_kind_check CHECK(record_kind IN(
  'discount','lucky_wheel','email_campaign','phone_campaign','whatsapp_campaign','blog_post','page','policy',
  'marketplace_connection','general_setting','language_setting','payment_setting','shipping_setting','administrator_invite',
  'accounting_profile','invoice_integration','seo_control','sitemap','social_preview','code_integration','indexing_request',
  'notification_setting','theme_setting','hero_banner','promotion_banner','marquee_setting','seo_geo_profile','seo_internal_link',
  'seo_content_entry','seo_category_entry','seo_page_entry','seo_product_entry','ai_setting'
));

REVOKE ALL ON FUNCTION saas.merchant_admin_required_action(text,boolean),saas.merchant_admin_config_valid(text,jsonb),saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text),saas.storefront_asset_create(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint),saas.storefront_asset_list(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,boolean),saas.public_starter_presentation(uuid,timestamptz),saas.public_starter_presentation(uuid,timestamptz,boolean) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text),saas.storefront_asset_create(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint),saas.storefront_asset_list(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,boolean) TO celebix_saas_app;
COMMIT;
