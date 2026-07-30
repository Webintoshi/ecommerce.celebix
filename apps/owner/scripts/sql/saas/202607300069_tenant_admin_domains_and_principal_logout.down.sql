BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.revoke_principal_panel_sessions(text,text,text,timestamptz);
DROP FUNCTION saas.recover_cross_host_panel_handoff(uuid,text,text,text,timestamptz);
DROP FUNCTION saas.redeem_cross_host_panel_handoff(text,text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz);
DROP FUNCTION saas.issue_cross_host_panel_handoff(text,text,uuid,uuid,text,text,uuid,text,timestamptz,timestamptz);
DROP FUNCTION saas.resolve_public_admin_brand(text,timestamptz);
DROP FUNCTION saas.provision_canonical_admin_domain(uuid,uuid,text,timestamptz);
DROP TRIGGER cross_host_panel_handoffs_guard ON saas.cross_host_panel_handoffs;
DROP FUNCTION saas.guard_cross_host_panel_handoff_mutation();
DROP TABLE saas.cross_host_panel_handoffs;
DROP TABLE saas.admin_domains;

COMMIT;
