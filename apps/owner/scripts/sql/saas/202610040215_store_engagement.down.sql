BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
DO $history$ BEGIN
 IF EXISTS(SELECT 1 FROM saas.store_engagement_cart_contacts) OR EXISTS(SELECT 1 FROM saas.store_engagement_capture_operations)
 THEN RAISE EXCEPTION 'STORE_ENGAGEMENT_215_ROLLBACK_HAS_CONTACT_HISTORY_FORWARD_RECOVERY_REQUIRED'; END IF;
END $history$;
DROP TRIGGER store_engagement_abandoned_contact_215 ON saas.abandoned_carts;
DROP FUNCTION saas.store_engagement_contact_capture(text,text,timestamptz,uuid,uuid,text,text,boolean,text);
DROP FUNCTION saas.store_engagement_abandoned_contact();
DROP FUNCTION saas.store_engagement_public_operation_get(text,text,timestamptz,uuid,text);
DROP FUNCTION saas.store_engagement_public_settings(text,timestamptz);
DROP FUNCTION saas.store_engagement_campaign_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,boolean,jsonb);
DROP FUNCTION saas.store_engagement_admin_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.store_engagement_campaign_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.store_engagement_public_projection(saas.store_engagement_campaigns,timestamptz);
DROP FUNCTION saas.store_engagement_projection(saas.store_engagement_campaigns);
DROP FUNCTION saas.store_engagement_coupon(uuid,uuid,timestamptz);
DROP FUNCTION saas.store_engagement_image_url(uuid,jsonb);
DROP TABLE saas.store_engagement_request_limits;
DROP TABLE saas.store_engagement_capture_operations;
DROP TABLE saas.store_engagement_cart_contacts;
DROP TABLE saas.store_engagement_admin_operations;
DROP TABLE saas.store_engagement_campaigns;
DROP FUNCTION saas.store_engagement_config_valid(jsonb);
DROP FUNCTION saas.store_engagement_uuid_valid(jsonb);
DROP FUNCTION saas.store_engagement_text_valid(jsonb,integer,integer);
DO $native$ BEGIN
 IF EXISTS(SELECT 1 FROM saas.store_engagement_215_function_baseline b LEFT JOIN pg_proc p ON p.oid=to_regprocedure(b.identity)
 WHERE p.oid IS NULL OR md5(pg_get_functiondef(p.oid))<>b.definition_hash OR p.proowner<>b.owner_oid OR p.proacl::text IS DISTINCT FROM b.acl)
 THEN RAISE EXCEPTION 'STORE_ENGAGEMENT_215_NATIVE_CHANGED'; END IF;
END $native$;
DROP TABLE saas.store_engagement_215_function_baseline;
COMMIT;
