-- Phase 3B1 rollback is intentionally destructive to order rows.
-- It is permitted only in an isolated disposable rehearsal before shared order data exists.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text);
DROP TABLE saas.order_operations;
DROP FUNCTION saas.guard_order_operation_mutation();
DROP TABLE saas.order_notes;
DROP TABLE saas.order_events;
DROP FUNCTION saas.guard_order_event_mutation();
DROP TABLE saas.order_items;
DROP TABLE saas.orders;
ALTER TABLE saas.stores DROP CONSTRAINT stores_id_currency_key;

COMMIT;
