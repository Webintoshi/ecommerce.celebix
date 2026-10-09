-- Empty additive rollback only. User settings and operation evidence must never be discarded.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
LOCK TABLE saas.order_bump_settings,saas.order_bump_operations IN ACCESS EXCLUSIVE MODE;
DO $empty$ BEGIN IF EXISTS(SELECT 1 FROM saas.order_bump_settings) OR EXISTS(SELECT 1 FROM saas.order_bump_operations) THEN RAISE EXCEPTION 'ORDER_BUMP_223_ROLLBACK_REQUIRES_EMPTY_STATE';END IF;END $empty$;
DROP FUNCTION saas.order_bump_public_offers(text,timestamptz,jsonb,text);
DROP FUNCTION saas.order_bump_options(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,integer,text,uuid,uuid[]);
DROP FUNCTION saas.order_bump_settings_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb);
DROP FUNCTION saas.order_bump_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.order_bump_settings_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.order_bump_workspace(saas.order_bump_settings);
DROP TABLE saas.order_bump_operations;
DROP TABLE saas.order_bump_settings;
DROP FUNCTION saas.order_bump_default_config();
DROP FUNCTION saas.order_bump_config_valid(jsonb);
DROP FUNCTION saas.order_bump_ids_valid(jsonb,integer,integer);
COMMIT;
