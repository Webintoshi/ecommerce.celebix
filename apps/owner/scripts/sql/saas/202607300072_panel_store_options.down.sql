BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DROP FUNCTION saas.list_panel_session_store_options(text,text,timestamptz);
COMMIT;
