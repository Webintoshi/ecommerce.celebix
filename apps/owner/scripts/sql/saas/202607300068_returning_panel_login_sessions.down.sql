BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DROP FUNCTION saas.recover_returning_panel_session(text,text,uuid,text,text);
DROP FUNCTION saas.issue_returning_panel_session(text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz);
COMMIT;
