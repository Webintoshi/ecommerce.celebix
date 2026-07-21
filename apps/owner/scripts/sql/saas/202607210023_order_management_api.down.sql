-- Phase 3B1 rollback removes only the additive migration 023 order API functions.
-- It is permitted only in an isolated disposable rehearsal.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.orders_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.orders_archive_note(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid);
DROP FUNCTION saas.orders_add_note(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text);
DROP FUNCTION saas.orders_update_shipping(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb,jsonb);
DROP FUNCTION saas.orders_transition_payment(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text);
DROP FUNCTION saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text);
DROP FUNCTION saas.orders_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.orders_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.orders_detail_projection(uuid,uuid);
DROP FUNCTION saas.orders_mutation_projection(uuid,uuid);
DROP FUNCTION saas.orders_tracking_valid(jsonb);
DROP FUNCTION saas.orders_address_valid(jsonb);
DROP FUNCTION saas.orders_cursor_timestamp(timestamptz);
DROP FUNCTION saas.orders_json_timestamp(timestamptz);

COMMIT;
