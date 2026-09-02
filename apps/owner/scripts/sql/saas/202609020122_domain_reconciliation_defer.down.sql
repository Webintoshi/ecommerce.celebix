-- Emergency/pre-restore rollback only. Apply code rollback before this migration.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DROP FUNCTION saas.admin_domain_work_defer(uuid,uuid,text,timestamptz,timestamptz);
DROP FUNCTION saas.store_domain_work_defer(uuid,uuid,text,timestamptz,timestamptz);
COMMIT;
