-- Remove only Phase 2B2B1 panel-session handoff authority objects.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.recover_panel_session_handoff_redemption(text,text,text,text,timestamptz);
DROP FUNCTION saas.redeem_panel_session_handoff(text,text,text,text,timestamptz);
DROP FUNCTION saas.recover_panel_session_handoff(text,timestamptz);
DROP FUNCTION saas.create_panel_session_handoff(text,text,text,text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,timestamptz);
DROP TRIGGER panel_session_handoffs_guard ON saas.panel_session_handoffs;
DROP FUNCTION saas.guard_panel_session_handoff_mutation();
DROP TABLE saas.panel_session_handoffs;

COMMIT;
