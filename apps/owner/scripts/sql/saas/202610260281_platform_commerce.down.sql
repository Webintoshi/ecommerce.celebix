-- Financial history is append-only. Used installations require a forward fix.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.platform-commerce.release281',0));
LOCK TABLE saas.platform_checkout_orders IN ACCESS EXCLUSIVE MODE;
DO $guard$BEGIN
 IF current_setting('celebix.allow_platform_commerce281_down',true)IS DISTINCT FROM 'on'THEN RAISE EXCEPTION 'PLATFORM_COMMERCE281_DOWN_OPT_IN_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM saas.platform_checkout_orders)OR EXISTS(SELECT 1 FROM saas.platform_checkout_intents)OR EXISTS(SELECT 1 FROM saas.platform_checkout_attempts)OR EXISTS(SELECT 1 FROM saas.platform_checkout_audit)OR EXISTS(SELECT 1 FROM saas.store_tool_receipts WHERE checkout_order_id IS NOT NULL)
 THEN RAISE EXCEPTION 'PLATFORM_COMMERCE281_HISTORY_EXISTS';END IF;
END $guard$;
DROP TRIGGER store_tool_receipt_validate281 ON saas.store_tool_receipts;
ALTER TABLE saas.store_tool_receipts DROP CONSTRAINT store_tool_receipt_actor281;
ALTER TABLE saas.store_tool_receipts DROP CONSTRAINT store_tool_receipt_checkout281;
ALTER TABLE saas.store_tool_receipts DROP COLUMN checkout_order_id;
ALTER TABLE saas.store_tool_receipts ALTER COLUMN operator_id SET NOT NULL;
DROP TABLE saas.platform_checkout_audit;
ALTER TABLE saas.platform_checkout_orders DROP CONSTRAINT platform_checkout_fulfilled_attempt281;
DROP TABLE saas.platform_checkout_attempts;
DROP TABLE saas.platform_checkout_intents;
DROP TABLE saas.platform_checkout_orders;
DROP FUNCTION saas.platform_checkout_machine(text,jsonb);
DROP FUNCTION saas.platform_checkout_fulfill281(uuid,uuid,timestamptz);
DROP FUNCTION saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,text);
DROP FUNCTION saas.platform_checkout_receipt_guard281();
DROP FUNCTION saas.platform_checkout_machine_projection281(uuid,uuid);
DROP FUNCTION saas.platform_checkout_projection281(uuid);
DROP FUNCTION saas.platform_checkout_guard281();
DROP FUNCTION saas.platform_checkout_term_end281(timestamptz,text);
DROP FUNCTION saas.platform_checkout_seal_valid281(jsonb);
DROP TABLE saas.platform_checkout281_predecessors;
COMMIT;
