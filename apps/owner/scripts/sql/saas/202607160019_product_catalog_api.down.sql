-- This rollback removes only the Phase 3A2 catalog detail read function.
-- It is not authorized for production execution by the Phase 3A2 task.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

REVOKE ALL ON FUNCTION saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean) FROM celebix_saas_app;
DROP FUNCTION saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean);

COMMIT;
