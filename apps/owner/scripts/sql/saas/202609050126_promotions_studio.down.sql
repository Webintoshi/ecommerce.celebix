-- EMERGENCY, PRE-RESTORE ONLY. Normal rollback is code-only and leaves this additive schema in place.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $fn$
BEGIN
  IF pg_catalog.current_setting('saas.promotions_studio_emergency_drop',true) IS DISTINCT FROM 'approved-pre-restore' THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_EMERGENCY_SETTING_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM saas.promotions) OR EXISTS (SELECT 1 FROM saas.promotion_operations) OR EXISTS (SELECT 1 FROM saas.promotion_audit_events) OR EXISTS (SELECT 1 FROM saas.promotion_usage_reservations) OR EXISTS (SELECT 1 FROM saas.promotion_redemptions) OR EXISTS (SELECT 1 FROM saas.order_promotion_snapshots) OR EXISTS (SELECT 1 FROM saas.order_discount_allocations) THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_DATA_BEARING_DOWN_REFUSED'; END IF;
END $fn$;
DROP TABLE saas.order_discount_allocations;
DROP TABLE saas.order_promotion_snapshots;
DROP TABLE saas.promotion_audit_events;
DROP TABLE saas.promotion_redemptions;
DROP TABLE saas.promotion_usage_reservations;
DROP TABLE saas.promotion_operations;
DROP TABLE saas.promotion_codes;
DROP TABLE saas.promotion_code_batches;
DROP TABLE saas.promotion_targets;
DROP TABLE saas.promotion_versions;
DROP TABLE saas.promotions;
DROP FUNCTION saas.promotion_adopt_legacy_discounts_v1(uuid,timestamptz);
DROP FUNCTION saas.promotion_release_expired_v1(uuid,timestamptz);
DROP FUNCTION saas.promotion_reserve_v1(uuid,uuid,uuid,uuid,uuid,text,bigint,timestamptz,timestamptz);
DROP FUNCTION saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb);
DROP FUNCTION saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text[],integer);
DROP FUNCTION saas.promotion_lifecycle_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text);
DROP FUNCTION saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb);
DROP FUNCTION saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb);
DROP FUNCTION saas.promotion_record_operation(uuid,uuid,text,text,jsonb,timestamptz);
DROP FUNCTION saas.promotion_projection(uuid,uuid);
DROP FUNCTION saas.promotion_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.promotion_evaluate_v1(uuid,jsonb,timestamptz);
DROP FUNCTION saas.promotion_audit_append_only();
DROP FUNCTION saas.promotion_operation_fingerprint(text,jsonb);
DROP FUNCTION saas.promotion_normalize_code(text);
DROP FUNCTION saas.promotion_rule_document_valid(jsonb);
COMMIT;
