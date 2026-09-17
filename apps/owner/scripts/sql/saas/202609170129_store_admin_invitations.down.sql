BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $f$ BEGIN
 IF EXISTS(SELECT 1 FROM saas.store_admin_invitations) OR EXISTS(SELECT 1 FROM saas.store_admin_invitation_deliveries)
 OR EXISTS(SELECT 1 FROM saas.store_admin_invitation_operations) OR EXISTS(SELECT 1 FROM saas.store_admin_invitation_events)
 OR EXISTS(SELECT 1 FROM saas.store_admin_invitation_acceptance_grants) OR EXISTS(SELECT 1 FROM saas.store_admin_invitation_provider_events)
 THEN RAISE EXCEPTION 'INVITATION_DOWN_BLOCKED'; END IF;
END $f$;
DROP TRIGGER store_admin_invitation_source_frozen ON saas.merchant_admin_records;
DROP FUNCTION saas.store_admin_invitation_delivery_claim(text,uuid,timestamptz,timestamptz,integer,uuid,text);
DROP TABLE saas.store_admin_invitation_acceptance_grants;
DROP TABLE saas.store_admin_invitation_operations;
DROP TABLE saas.store_admin_invitation_events;
DROP TABLE saas.store_admin_invitation_provider_events;
DROP TABLE saas.store_admin_invitation_deliveries;
DROP TABLE saas.store_admin_invitations;
-- Only this feature namespace; no CASCADE and no alteration of existing auth/modules.
DO $f$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='saas' AND p.proname LIKE 'store_admin_invitation\_%' ESCAPE '\' LOOP
  EXECUTE format('DROP FUNCTION %s',fn);
 END LOOP;
END $f$;
COMMIT;
