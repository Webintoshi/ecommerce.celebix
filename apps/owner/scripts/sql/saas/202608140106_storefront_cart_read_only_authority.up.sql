BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.merchant_provider_execution_authority_visible(
  p_provider_code text,p_capability text,p_environment text,
  p_adapter_version integer,p_evidence_digest text
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE approved boolean;
BEGIN
  IF p_provider_code IS NULL OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_capability<>'payment_processing' OR p_environment NOT IN('test','live')
    OR p_adapter_version IS NULL OR p_adapter_version<1
    OR p_evidence_digest IS NULL OR p_evidence_digest!~'^sha256:[a-f0-9]{64}$'
  THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'saas.merchant.provider.execution.authority:'||p_provider_code||':'||p_capability||':'||p_environment,0
  ));
  SELECT true INTO approved
  FROM saas.merchant_provider_execution_authorities AS authority
  WHERE authority.provider_code=p_provider_code
    AND authority.capability=p_capability
    AND authority.environment=p_environment
    AND authority.adapter_version=p_adapter_version
    AND authority.evidence_digest=p_evidence_digest
    AND authority.readiness=CASE p_environment
      WHEN 'test' THEN 'sandbox_ready' ELSE 'production_ready' END
    AND authority.enabled;
  RETURN COALESCE(approved,false);
END
$f$;

REVOKE ALL ON FUNCTION
  saas.merchant_provider_execution_authority_visible(text,text,text,integer,text)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE OR REPLACE FUNCTION saas.storefront_payment_methods_projection(p_store_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  WITH offline AS (
    SELECT method.position,method.id,pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'kind',method.kind,'label',method.label,'instructions',method.config->>'instructions',
      'bankName',CASE WHEN method.kind='bank_transfer' THEN method.config->>'bankName' END,
      'accountHolder',CASE WHEN method.kind='bank_transfer' THEN method.config->>'accountHolder' END,
      'iban',CASE WHEN method.kind='bank_transfer' THEN method.config->>'iban' END
    )) projection
    FROM saas.payment_methods method
    WHERE method.store_id=p_store_id AND method.kind IN('bank_transfer','cash_on_delivery')
      AND method.state='active' AND saas.built_in_payment_method_config_valid(method.kind,method.config)
  ), hosted AS (
    SELECT method.position,method.id,pg_catalog.jsonb_build_object(
      'kind','hosted_card','id',method.id,'label',method.label,
      'instructions','Güvenli sağlayıcı ekranında tamamlanır.',
      'providerCode',method.provider_code,
      'presentation',CASE method.provider_code WHEN 'paytr_iframe' THEN 'iframe' ELSE 'redirect' END,
      'requiredCustomerFields',CASE method.provider_code WHEN 'iyzico_iframe'
        THEN pg_catalog.jsonb_build_array('identity_number') ELSE '[]'::jsonb END
    ) projection
    FROM saas.payment_methods method
    JOIN saas.merchant_provider_profiles profile
      ON profile.store_id=method.store_id AND profile.id=method.profile_id
        AND profile.provider_code=method.provider_code AND profile.capability='payment_processing'
    WHERE method.store_id=p_store_id AND method.kind='provider' AND method.state='active'
      AND method.provider_code IN('paytr_iframe','iyzico_iframe')
      AND method.config->>'environment' IS NOT DISTINCT FROM profile.execution_environment
      AND profile.status='active' AND profile.validation_environment=profile.execution_environment
      AND profile.validation_adapter_version=profile.execution_adapter_version
      AND profile.credential_version>0
      AND CASE WHEN pg_catalog.current_setting('transaction_read_only')='on'
        THEN saas.merchant_provider_execution_authority_visible(
          profile.provider_code,profile.capability,profile.execution_environment,
          profile.execution_adapter_version,profile.execution_evidence_digest
        )
        ELSE saas.merchant_provider_execution_authority_matches(
          profile.provider_code,profile.capability,profile.execution_environment,
          profile.execution_adapter_version,profile.execution_evidence_digest
        )
      END
    ORDER BY method.position,method.id LIMIT 1
  ), methods AS (
    SELECT * FROM offline UNION ALL SELECT * FROM hosted
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(projection ORDER BY position,id),'[]'::jsonb) FROM methods
$f$;

COMMIT;
