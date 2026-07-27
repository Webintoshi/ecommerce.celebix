BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

LOCK TABLE saas.merchant_provider_profiles IN ACCESS EXCLUSIVE MODE;

DO $f$
BEGIN
  IF EXISTS(
    SELECT 1 FROM saas.merchant_provider_profiles
    WHERE provider_code='iyzico_iframe'
  ) OR EXISTS(
    SELECT 1 FROM saas.payment_methods
    WHERE provider_code='iyzico_iframe'
  ) OR EXISTS(
    SELECT 1 FROM saas.merchant_provider_execution_authorities
    WHERE provider_code='iyzico_iframe'
  ) OR EXISTS(
    SELECT 1 FROM saas.merchant_provider_profiles
    WHERE capability='payment_processing' AND (
      execution_environment IS NULL
      OR execution_adapter_version IS NULL
      OR execution_evidence_digest IS NULL
      OR execution_environment<>validation_environment
      OR execution_adapter_version<>validation_adapter_version
    )
  ) OR EXISTS(
    SELECT 1 FROM saas.merchant_provider_profiles
    WHERE capability='payment_processing' AND status<>'revoked'
    GROUP BY store_id,provider_code,capability HAVING pg_catalog.count(*)>1
  ) THEN
    RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_ROLLBACK_REQUIRES_DRAIN';
  END IF;
END
$f$;

REVOKE ALL ON FUNCTION saas.payment_provider_keyed_lifecycle_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.payment_provider_keyed_lifecycle_preflight();

REVOKE ALL ON FUNCTION
  saas.merchant_provider_profile_save_verification(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,bigint),
  saas.merchant_provider_profile_claim_verification(text,text,text,text,integer,timestamptz,timestamptz,uuid),
  saas.merchant_provider_profile_mark_verification(uuid,text,text,text,integer,text,timestamptz,uuid,bigint,bigint,text,text),
  saas.merchant_provider_profile_bind_execution_authority(uuid,text,text,text,integer,text,timestamptz,bigint)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.merchant_provider_profile_save_verification(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,
  jsonb,text,jsonb,text,text,integer,text,integer,bigint
);
DROP FUNCTION saas.merchant_provider_profile_claim_verification(
  text,text,text,text,integer,timestamptz,timestamptz,uuid
);
DROP FUNCTION saas.merchant_provider_profile_mark_verification(
  uuid,text,text,text,integer,text,timestamptz,uuid,bigint,bigint,text,text
);
DROP FUNCTION saas.merchant_provider_profile_bind_execution_authority(
  uuid,text,text,text,integer,text,timestamptz,bigint
);

REVOKE ALL ON FUNCTION saas.payment_method_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.payment_method_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
);
ALTER FUNCTION saas.payment_method_save_without_execution_authority(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
) RENAME TO payment_method_save;
GRANT EXECUTE ON FUNCTION saas.payment_method_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
) TO celebix_saas_app;

DROP TRIGGER merchant_provider_profiles_disable_bound_methods
  ON saas.merchant_provider_profiles;
DROP TRIGGER merchant_provider_profiles_validation_identity_compat
  ON saas.merchant_provider_profiles;
DROP FUNCTION saas.merchant_provider_profiles_disable_bound_methods();
DROP FUNCTION saas.merchant_provider_profiles_validation_identity_compat();

CREATE UNIQUE INDEX merchant_provider_profiles_one_live_capability_idx
  ON saas.merchant_provider_profiles(store_id,provider_code,capability)
  WHERE status<>'revoked';
DROP INDEX saas.merchant_provider_profiles_verification_claim_idx;
DROP INDEX saas.merchant_provider_profiles_one_live_payment_environment_idx;
DROP INDEX saas.merchant_provider_profiles_one_live_nonpayment_capability_idx;

ALTER TABLE saas.merchant_provider_profiles
  ADD CONSTRAINT merchant_provider_profiles_execution_authority_check_v053 CHECK(
    (capability<>'payment_processing' AND (
      execution_environment IS NULL
      AND execution_adapter_version IS NULL
      AND execution_evidence_digest IS NULL
    )) OR (
      capability='payment_processing'
      AND execution_environment IN('test','live')
      AND execution_adapter_version>0
      AND execution_evidence_digest~'^sha256:[a-f0-9]{64}$'
      AND public_config->>'environment'=execution_environment
    )
  ) NOT VALID;
ALTER TABLE saas.merchant_provider_profiles
  VALIDATE CONSTRAINT merchant_provider_profiles_execution_authority_check_v053;
ALTER TABLE saas.merchant_provider_profiles
  DROP CONSTRAINT merchant_provider_profiles_execution_authority_check;
ALTER TABLE saas.merchant_provider_profiles
  RENAME CONSTRAINT merchant_provider_profiles_execution_authority_check_v053
  TO merchant_provider_profiles_execution_authority_check;
ALTER TABLE saas.merchant_provider_profiles
  DROP COLUMN validation_environment,
  DROP COLUMN validation_adapter_version;

ALTER TABLE saas.merchant_provider_definitions DISABLE TRIGGER merchant_provider_definitions_immutable;
DELETE FROM saas.merchant_provider_definitions
WHERE provider_code='iyzico_iframe' AND capability='payment_processing';
ALTER TABLE saas.merchant_provider_definitions ENABLE TRIGGER merchant_provider_definitions_immutable;
ALTER TABLE saas.merchant_provider_definitions
  DROP COLUMN allows_verification_without_execution_authority;

COMMIT;
