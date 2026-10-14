-- Keep product transmission paused during a mixed panel/storefront rollout.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
CREATE TABLE saas.google_merchant_delivery_control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO saas.google_merchant_delivery_control VALUES(true,false);
ALTER TABLE saas.google_merchant_delivery_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.google_merchant_delivery_control FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.google_merchant_delivery_control FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
CREATE TABLE saas.google_merchant_231_backup AS SELECT pg_get_functiondef('saas.google_merchant_claim(timestamptz,integer,uuid)'::regprocedure) AS definition;
REVOKE ALL ON saas.google_merchant_231_backup FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
DO $patch$ DECLARE definition text;BEGIN
 SELECT b.definition INTO definition FROM saas.google_merchant_231_backup b;
 IF position('PERFORM saas.google_merchant_advance_price_boundaries(moment);' IN definition)=0 THEN RAISE EXCEPTION 'MERCHANT231_CLAIM_DRIFT';END IF;
 EXECUTE replace(definition,'PERFORM saas.google_merchant_advance_price_boundaries(moment);','IF NOT coalesce((SELECT enabled FROM saas.google_merchant_delivery_control WHERE singleton),false) THEN RETURN QUERY SELECT ''claimed'',''[]''::jsonb;RETURN;END IF; PERFORM saas.google_merchant_advance_price_boundaries(moment);');
END $patch$;
COMMIT;
