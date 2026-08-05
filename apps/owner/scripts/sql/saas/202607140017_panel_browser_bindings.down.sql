-- Roll back only the Phase 2B2B2A.1 browser-binding authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

REVOKE ALL ON FUNCTION saas.cleanup_panel_browser_bindings(timestamptz,integer) FROM celebix_saas_identity;
REVOKE ALL ON FUNCTION saas.claim_panel_browser_callback(text,text,text[],text[],timestamptz) FROM celebix_saas_identity;
REVOKE ALL ON FUNCTION saas.bind_panel_browser_credential(text,text,text,text,text,timestamptz,timestamptz) FROM celebix_saas_identity;
REVOKE ALL ON FUNCTION saas.create_panel_browser_bootstrap(text,text,text,text,text,uuid,timestamptz,timestamptz) FROM celebix_saas_identity;

DROP FUNCTION saas.cleanup_panel_browser_bindings(timestamptz,integer);
DROP FUNCTION saas.claim_panel_browser_callback(text,text,text[],text[],timestamptz);
DROP FUNCTION saas.bind_panel_browser_credential(text,text,text,text,text,timestamptz,timestamptz);
DROP FUNCTION saas.create_panel_browser_bootstrap(text,text,text,text,text,uuid,timestamptz,timestamptz);
DROP TABLE saas.panel_browser_bindings;
DROP FUNCTION saas.guard_panel_browser_binding_mutation();

COMMIT;
