BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_storefront_cart_read_only_authority_down',true)<>'on'
  THEN RAISE EXCEPTION 'STOREFRONT_CART_READ_ONLY_AUTHORITY_DOWN_GUARD_REQUIRED'; END IF;
END
$f$;

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
      AND saas.merchant_provider_execution_authority_matches(
        profile.provider_code,profile.capability,profile.execution_environment,
        profile.execution_adapter_version,profile.execution_evidence_digest
      )
    ORDER BY method.position,method.id LIMIT 1
  ), methods AS (
    SELECT * FROM offline UNION ALL SELECT * FROM hosted
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(projection ORDER BY position,id),'[]'::jsonb) FROM methods
$f$;

DROP FUNCTION saas.merchant_provider_execution_authority_visible(text,text,text,integer,text);

COMMIT;
