-- Disposable-only rollback for the Phase 3B2 quick-order link API.
-- It removes only migration 025 functions and grants; migration 024 data remains intact.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.quick_links_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text);
DROP FUNCTION saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text);
DROP FUNCTION saas.quick_links_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,uuid,text);
DROP FUNCTION saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text);
DROP FUNCTION saas.quick_links_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.quick_links_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.quick_links_lock_manage_authority(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.quick_links_detail_projection(uuid,uuid,timestamptz);
DROP FUNCTION saas.quick_links_mutation_projection(uuid,uuid);
DROP FUNCTION saas.quick_links_json_timestamp(timestamptz);

COMMIT;
