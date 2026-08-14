BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE
  visible_oid oid:=pg_catalog.to_regprocedure(
    'saas.merchant_provider_execution_authority_visible(text,text,text,integer,text)'
  );
  matches_oid oid:=pg_catalog.to_regprocedure(
    'saas.merchant_provider_execution_authority_matches(text,text,text,integer,text)'
  );
BEGIN
  IF visible_oid IS NULL OR matches_oid IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_PAYMENT_EXECUTION_AUTHORITY_PREREQUISITE_MISSING'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=matches_oid
      AND pg_catalog.md5(procedure.prosrc)='c89a8ab0d23d470a1603e6ceebf11b68'
  ) THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_PAYMENT_EXECUTION_AUTHORITY_GUARD_CHANGED'; END IF;
END
$f$;

CREATE OR REPLACE FUNCTION saas.storefront_hosted_payment_execution_authority_matches(
  p_provider_code text,p_capability text,p_environment text,
  p_adapter_version integer,p_evidence_digest text
)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
  SELECT saas.merchant_provider_execution_authority_visible(
    p_provider_code,p_capability,p_environment,p_adapter_version,p_evidence_digest
  )
$f$;

REVOKE ALL ON FUNCTION
  saas.storefront_hosted_payment_execution_authority_matches(text,text,text,integer,text)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.storefront_hosted_payment_execution_authority_matches(text,text,text,integer,text)
TO celebix_saas_workflow;

COMMIT;
