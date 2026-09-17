BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DROP FUNCTION saas.store_admin_invitation_manager(text,text,text,timestamptz);
COMMIT;
