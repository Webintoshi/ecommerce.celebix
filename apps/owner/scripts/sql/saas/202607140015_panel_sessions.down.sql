-- Remove only Phase 2B2A panel-session authority objects.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.recover_panel_session_operation(uuid,text,text,text,uuid,uuid,text,text);
DROP FUNCTION saas.expire_due_panel_sessions(timestamptz,integer);
DROP FUNCTION saas.revoke_panel_session_family(text,text,text,timestamptz);
DROP FUNCTION saas.revoke_panel_session(text,text,text,timestamptz);
DROP FUNCTION saas.rotate_panel_session(text,text,uuid,uuid,text,text,uuid,timestamptz);
DROP FUNCTION saas.resolve_panel_session(text,text,timestamptz);
DROP FUNCTION saas.issue_panel_session(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz);
DROP TRIGGER panel_sessions_mutation_guard ON saas.panel_sessions;
DROP FUNCTION saas.guard_panel_session_mutation();
DROP TABLE saas.panel_sessions;

COMMIT;
