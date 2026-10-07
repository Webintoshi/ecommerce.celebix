BEGIN;
SET LOCAL ROLE celebix_saas_owner;
-- Credential deletion is intentionally blocked while any store still has an active connection.
DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM saas.google_marketing_connections WHERE status='connected') THEN RAISE EXCEPTION 'GOOGLE_MARKETING_ACTIVE_CONNECTIONS';END IF;END $guard$;
DROP FUNCTION saas.public_google_marketing_purchase(text,timestamptz,jsonb),saas.public_google_marketing_projection(uuid),saas.google_marketing_oauth_return(text,timestamptz),saas.google_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb),saas.google_marketing_selection_valid(jsonb,text,text),saas.google_marketing_connection_projection(uuid,text);
DROP TABLE saas.google_marketing_events,saas.google_marketing_operations,saas.google_marketing_oauth_states,saas.google_marketing_connections;
COMMIT;
