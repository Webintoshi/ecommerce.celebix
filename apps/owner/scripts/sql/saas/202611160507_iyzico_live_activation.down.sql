BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';

DO $migration$
DECLARE target record;
BEGIN
  LOCK TABLE saas.merchant_provider_profiles,saas.payment_methods,saas.payment_attempts IN ACCESS EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM saas.merchant_provider_profiles
      WHERE provider_code='iyzico_iframe' AND execution_environment='live')
    OR EXISTS(SELECT 1 FROM saas.payment_attempts WHERE provider_code='iyzico_iframe' AND environment='live')
  THEN RAISE EXCEPTION 'IYZICO_LIVE_ACTIVATION507_USED'; END IF;
  FOR target IN SELECT * FROM saas.iyzico_live_activation507_predecessors LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=target.signature AND pg_catalog.md5(procedure.prosrc)=target.published_body_md5)
    THEN RAISE EXCEPTION 'IYZICO_LIVE_ACTIVATION507_ROLLBACK_DRIFT:%',target.signature; END IF;
    EXECUTE target.definition;
  END LOOP;
  IF saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'IYZICO_LIVE_ACTIVATION507_ROLLBACK_INVALID'; END IF;
END
$migration$;

DROP FUNCTION saas.iyzico_live_bind_profile(uuid,uuid,bigint,bigint,text,timestamptz);
DROP FUNCTION saas.iyzico_live_method_authorized(uuid,uuid);
DROP FUNCTION saas.iyzico_live_profile_authorized(saas.merchant_provider_profiles);
DROP TABLE saas.iyzico_live_activation507_predecessors;
COMMIT;
