-- Guarded rollback for Phase 4D Campaign Starter composition authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
 IF pg_catalog.to_regprocedure('saas.public_campaign_home(uuid,text,timestamp with time zone)') IS NULL
   OR pg_catalog.to_regprocedure('saas.merchant_admin_save_without_campaign_starter(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)') IS NULL
   OR pg_catalog.to_regprocedure('saas.public_starter_presentation_without_campaign_starter(uuid,timestamp with time zone,boolean)') IS NULL
 THEN RAISE EXCEPTION 'CAMPAIGN_STARTER_DOWN_SOURCE_INVALID'; END IF;
END
$f$;

LOCK TABLE saas.merchant_admin_records IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_events IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_operations IN ACCESS EXCLUSIVE MODE;
ALTER TABLE saas.merchant_admin_events DISABLE TRIGGER merchant_admin_events_immutable;
ALTER TABLE saas.merchant_admin_operations DISABLE TRIGGER merchant_admin_operations_immutable;
DELETE FROM saas.merchant_admin_operations WHERE result_payload->>'kind'='starter_theme_composition';
DELETE FROM saas.merchant_admin_events WHERE record_kind='starter_theme_composition';
DELETE FROM saas.merchant_admin_records WHERE record_kind='starter_theme_composition';
ALTER TABLE saas.merchant_admin_operations ENABLE TRIGGER merchant_admin_operations_immutable;
ALTER TABLE saas.merchant_admin_events ENABLE TRIGGER merchant_admin_events_immutable;

DROP FUNCTION saas.public_campaign_home(uuid,text,timestamptz);
DROP FUNCTION saas.public_starter_presentation(uuid,timestamptz);
DROP FUNCTION saas.public_starter_presentation(uuid,timestamptz,boolean);
DROP FUNCTION saas.public_campaign_navigation_item(uuid,uuid,integer,uuid,uuid);
DROP FUNCTION saas.public_campaign_asset(uuid,uuid);
ALTER FUNCTION saas.public_starter_presentation_without_campaign_starter(uuid,timestamptz,boolean) RENAME TO public_starter_presentation;
CREATE FUNCTION saas.public_starter_presentation(p_store_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT saas.public_starter_presentation(p_store_id,p_now,false) $f$;

DROP FUNCTION saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text);
DROP FUNCTION saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid);
DROP FUNCTION saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.merchant_admin_config_valid(text,jsonb);
DROP FUNCTION saas.merchant_admin_required_action(text,boolean);
ALTER FUNCTION saas.merchant_admin_save_without_campaign_starter(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text) RENAME TO merchant_admin_save;
ALTER FUNCTION saas.merchant_admin_get_record_without_campaign_starter(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid) RENAME TO merchant_admin_get_record;
ALTER FUNCTION saas.merchant_admin_list_events_without_campaign_starter(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text) RENAME TO merchant_admin_list_events;
ALTER FUNCTION saas.merchant_admin_list_without_campaign_starter(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text) RENAME TO merchant_admin_list;
ALTER FUNCTION saas.merchant_admin_config_valid_without_campaign_starter(text,jsonb) RENAME TO merchant_admin_config_valid;
ALTER FUNCTION saas.merchant_admin_required_action_without_campaign_starter(text,boolean) RENAME TO merchant_admin_required_action;
DROP FUNCTION saas.campaign_starter_composition_valid(jsonb);
DROP FUNCTION saas.campaign_starter_exact_keys(jsonb,text[],text[]);
DROP FUNCTION saas.campaign_starter_destination_valid(jsonb);
DROP FUNCTION saas.campaign_starter_uuid_valid(jsonb);
DROP FUNCTION saas.campaign_starter_text_valid(jsonb,integer,integer);

ALTER TABLE saas.merchant_admin_records DROP CONSTRAINT merchant_admin_records_record_kind_check;
ALTER TABLE saas.merchant_admin_records ADD CONSTRAINT merchant_admin_records_record_kind_check CHECK(record_kind IN(
  'discount','lucky_wheel','email_campaign','phone_campaign','whatsapp_campaign','blog_post','page','policy',
  'marketplace_connection','general_setting','language_setting','payment_setting','shipping_setting','administrator_invite',
  'accounting_profile','invoice_integration','seo_control','sitemap','social_preview','code_integration','indexing_request',
  'notification_setting','theme_setting','hero_banner','promotion_banner','marquee_setting','category_showcase','seo_geo_profile',
  'seo_internal_link','seo_content_entry','seo_category_entry','seo_page_entry','seo_product_entry','ai_setting'
));

REVOKE ALL ON FUNCTION saas.merchant_admin_required_action(text,boolean),saas.merchant_admin_config_valid(text,jsonb),saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text),saas.public_starter_presentation(uuid,timestamptz),saas.public_starter_presentation(uuid,timestamptz,boolean) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text) TO celebix_saas_app;
COMMIT;
