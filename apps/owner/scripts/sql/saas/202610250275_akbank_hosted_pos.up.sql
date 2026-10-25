-- Akbank 3D Pay Hosting: additive credential verification and hosted presentation.
-- All payment/capture/preflight functions retain their original authority checks.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.akbank-hosted-pos.release275',0));
CREATE TABLE saas.akbank_hosted_pos275_function_backup(
 signature text PRIMARY KEY,function_oid oid NOT NULL,definition text NOT NULL,
 before_definition_sha text NOT NULL,after_definition_sha text NOT NULL,
 owner_oid oid NOT NULL,acl aclitem[],config text[],security_definer boolean NOT NULL,volatility "char" NOT NULL
);
ALTER TABLE saas.akbank_hosted_pos275_function_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.akbank_hosted_pos275_function_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.akbank_hosted_pos275_function_backup FROM PUBLIC,
 celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,
 celebix_saas_bootstrap,celebix_saas_platform_operator,celebix_saas_support_runtime;
DO $predecessors$
DECLARE item jsonb;proc record;
BEGIN
 IF to_regprocedure('saas.akbank_merchant_self_service_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text)')IS NOT NULL
  OR EXISTS(SELECT 1 FROM saas.merchant_provider_definitions WHERE provider_code='akbank_json')
 THEN RAISE EXCEPTION 'AKBANK275_ALREADY_INSTALLED'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements($proof$[{"acl":"{celebix_saas_owner=X/celebix_saas_owner}","md5":"d8504fe319b7b433af7bb800251bcc21","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"afb30b2a358a721cc61e7083724f144894e5f167b3b696a8c45732526b8990c1","definer":false,"signature":"saas.provider_payment_method_config_valid(text,jsonb)","volatility":"i","afterSha256":"e47385a5bd60fc156dd601898add132bd58723eb1f0de3c47dc5e62135ce3f3d"},{"acl":"{celebix_saas_owner=X/celebix_saas_owner}","md5":"afb1da305769324a1ca829dfede08855","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"134cb5a1ecbcc1788ef684103663ab0b09a9e4df972d9ab7d323fdbb87612b46","definer":true,"signature":"saas.storefront_payment_methods_projection(uuid)","volatility":"v","afterSha256":"7cd4bd2ea1c6d532fe27b9d9e832dfa2d017ff16d6aae3e044dd7cc4a4131185"},{"acl":"{celebix_saas_owner=X/celebix_saas_owner}","md5":"3b3b561da25330e6a0251ef2094bb51b","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"0740afbe293ea0ae88e9b37c9b0020ae54fe162e893803caf318075692de3838","definer":true,"signature":"saas.storefront_hosted_checkout_authority_projection(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid)","volatility":"v","afterSha256":"c31a041c7cbbbb421d14a46f605fed168be3d140d876ed53f861f6737fed194f"},{"acl":"{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}","md5":"bfb050670d4639e7990334b1d0832c27","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"fd0466a2bcf8f534c1f07e428f0b78a943b166b96dcfb22f3eb0564c06ce14cb","definer":true,"signature":"saas.storefront_hosted_checkout_reconciliation_candidates_scoped(timestamp with time zone,integer,jsonb)","volatility":"s","afterSha256":"badf728eb63dcdc9b21651b832584c4fb6c12f3a7b89a3983e3c9fe926ec80c1"},{"acl":"{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}","md5":"650582796d070dbfb2ad8b47108edc63","owner":"celebix_saas_owner","config":["search_path=pg_catalog, saas"],"sha256":"109e0b0dcfd76aa043224fd19f23968f9038fe4b518f13a11d5fe2dca1c40336","definer":true,"signature":"saas.paytr_merchant_self_service_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text)","volatility":"v"}]$proof$::jsonb)LOOP
  SELECT p.*,pg_get_functiondef(p.oid)AS definition INTO STRICT proc FROM pg_proc p WHERE p.oid=to_regprocedure(item->>'signature');
  IF encode(sha256(convert_to(proc.definition,'UTF8')),'hex')IS DISTINCT FROM item->>'sha256'
   OR md5(proc.prosrc)IS DISTINCT FROM item->>'md5'
   OR proc.proowner IS DISTINCT FROM (item->>'owner')::regrole
   OR proc.proacl::text IS DISTINCT FROM item->>'acl'
   OR to_jsonb(proc.proconfig)IS DISTINCT FROM item->'config'
   OR proc.prosecdef IS DISTINCT FROM (item->>'definer')::boolean
   OR proc.provolatile::text IS DISTINCT FROM item->>'volatility'
  THEN RAISE EXCEPTION 'AKBANK275_PREDECESSOR_INVALID: %',item->>'signature';END IF;
  IF item ? 'afterSha256' THEN
   INSERT INTO saas.akbank_hosted_pos275_function_backup VALUES(item->>'signature',proc.oid,proc.definition,item->>'sha256',item->>'afterSha256',proc.proowner,proc.proacl,proc.proconfig,proc.prosecdef,proc.provolatile);
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.storefront_hosted_checkout_sessions'::regclass AND conname='storefront_hosted_checkout_sessions_provider_code_check' AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='410294f4588f305c1b9a2d9b6b88f1eb506066517f0c5e0e2ddd872537833359')THEN RAISE EXCEPTION 'AKBANK275_CONSTRAINT_PREDECESSOR_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.payment_methods'::regclass AND conname='payment_methods_provider_preference_check' AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='376da792e1d7e343be6659d11740a75b430594fae8d46357a511ea735b137291')THEN RAISE EXCEPTION 'AKBANK275_CONSTRAINT_PREDECESSOR_INVALID';END IF;
END $predecessors$;

CREATE OR REPLACE FUNCTION saas.provider_payment_method_config_valid(p_provider_code text, p_config jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
  SELECT COALESCE(
    p_provider_code IN('paytr_iframe','iyzico_iframe','akbank_json')
    AND pg_catalog.jsonb_typeof(p_config)='object'
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_config))=5
    AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_config) AS field(key)
      WHERE field.key NOT IN(
        'environment','locale','threeDSecure','installmentMode','maxInstallment'
      )
    )
    AND pg_catalog.jsonb_typeof(p_config->'environment')='string'
    AND p_config->>'environment' IN('test','live')
    AND pg_catalog.jsonb_typeof(p_config->'locale')='string'
    AND p_config->>'locale' IN('tr','en')
    AND (p_provider_code<>'paytr_iframe' OR p_config->>'locale'='tr')
    AND pg_catalog.jsonb_typeof(p_config->'threeDSecure')='string'
    AND p_config->>'threeDSecure'='provider_managed'
    AND pg_catalog.jsonb_typeof(p_config->'installmentMode')='string'
    AND p_config->>'installmentMode' IN('all','single_payment','limited')
    AND (p_provider_code<>'akbank_json' OR p_config->>'installmentMode'='single_payment')
    AND pg_catalog.jsonb_typeof(p_config->'maxInstallment')='number'
    AND (p_config->>'maxInstallment')::numeric IN(0,2,3,6,9,12)
    AND (
      (p_config->>'installmentMode'='limited' AND (p_config->>'maxInstallment')::numeric<>0)
      OR
      (p_config->>'installmentMode'<>'limited' AND (p_config->>'maxInstallment')::numeric=0)
    ),
    false
  )
$function$
;

CREATE OR REPLACE FUNCTION saas.storefront_payment_methods_projection(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
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
      'presentation',CASE method.provider_code WHEN 'paytr_iframe' THEN 'iframe' WHEN 'akbank_json' THEN 'form_post' ELSE 'redirect' END,
      'requiredCustomerFields',CASE method.provider_code WHEN 'iyzico_iframe'
        THEN pg_catalog.jsonb_build_array('identity_number') ELSE '[]'::jsonb END
    ) projection
    FROM saas.payment_methods method
    JOIN saas.merchant_provider_profiles profile
      ON profile.store_id=method.store_id AND profile.id=method.profile_id
        AND profile.provider_code=method.provider_code AND profile.capability='payment_processing'
    WHERE method.store_id=p_store_id AND method.kind='provider' AND method.state='active'
      AND method.provider_code IN('paytr_iframe','iyzico_iframe','akbank_json')
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
$function$
;

CREATE OR REPLACE FUNCTION saas.storefront_hosted_checkout_authority_projection(p_hostname text, p_now timestamp with time zone, p_kind text, p_credentials jsonb, p_expected_version bigint, p_delivery jsonb, p_payment_method_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE
  selected_store uuid; selected_cart saas.storefront_carts%ROWTYPE;
  selected_intent saas.storefront_checkout_intents%ROWTYPE;
  selected_method saas.payment_methods%ROWTYPE;
  selected_profile saas.merchant_provider_profiles%ROWTYPE;
  source_id uuid; source_version bigint; commerce jsonb; facts jsonb;
  authority_digest text; order_reference text;
BEGIN
  IF p_kind NOT IN('cart','buy_now')
    OR NOT saas.storefront_credential_candidates_valid(p_credentials,false)
    OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
    OR p_payment_method_id IS NULL
    OR saas.storefront_delivery_valid(p_delivery) IS DISTINCT FROM TRUE
  THEN RETURN NULL; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN NULL; END IF;

  IF p_kind='cart' THEN
    SELECT cart.* INTO selected_cart
    FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential
      ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=selected_store
    ORDER BY cart.created_at DESC,cart.id LIMIT 1;
    IF NOT FOUND OR selected_cart.status<>'active' OR selected_cart.expires_at<=p_now
      OR selected_cart.version<>p_expected_version
    THEN RETURN NULL; END IF;
    source_id:=selected_cart.id; source_version:=selected_cart.version;
    commerce:=saas.storefront_cart_projection(selected_store,source_id,p_now);
  ELSE
    SELECT intent.* INTO selected_intent
    FROM saas.storefront_checkout_intents intent
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
    WHERE intent.store_id=selected_store
    ORDER BY intent.created_at DESC,intent.id LIMIT 1;
    IF NOT FOUND OR selected_intent.status<>'active' OR selected_intent.expires_at<=p_now
      OR p_expected_version<>1
    THEN RETURN NULL; END IF;
    source_id:=selected_intent.id; source_version:=1;
    commerce:=saas.storefront_intent_projection(selected_store,source_id,p_now);
  END IF;
  IF commerce IS NULL OR COALESCE((commerce->>'checkoutReady')::boolean,false) IS DISTINCT FROM TRUE
    OR commerce->>'currency'<>'TRY'
    OR (commerce->>'totalCents')::numeric NOT BETWEEN 1 AND 9007199254740991
    OR pg_catalog.jsonb_typeof(commerce->'items')<>'array'
    OR pg_catalog.jsonb_array_length(commerce->'items') NOT BETWEEN 1 AND 100
  THEN RETURN NULL; END IF;

  SELECT method.* INTO selected_method FROM saas.payment_methods method
  WHERE method.store_id=selected_store AND method.id=p_payment_method_id
    AND method.kind='provider' AND method.state='active'
    AND method.provider_code IN('paytr_iframe','iyzico_iframe','akbank_json');
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT profile.* INTO selected_profile FROM saas.merchant_provider_profiles profile
  WHERE profile.store_id=selected_store AND profile.id=selected_method.profile_id
    AND profile.provider_code=selected_method.provider_code
    AND profile.capability='payment_processing' AND profile.status='active'
    AND profile.validation_environment=profile.execution_environment
    AND profile.validation_adapter_version=profile.execution_adapter_version
    AND profile.execution_environment=selected_method.config->>'environment'
    AND profile.credential_version>0;
  IF NOT FOUND OR (CASE WHEN pg_catalog.current_setting('transaction_read_only')='on'
      THEN saas.merchant_provider_execution_authority_visible(
        selected_profile.provider_code,selected_profile.capability,
        selected_profile.execution_environment,selected_profile.execution_adapter_version,
        selected_profile.execution_evidence_digest
      )
      ELSE saas.merchant_provider_execution_authority_matches(
        selected_profile.provider_code,selected_profile.capability,
        selected_profile.execution_environment,selected_profile.execution_adapter_version,
        selected_profile.execution_evidence_digest
      )
    END) IS DISTINCT FROM TRUE
  THEN RETURN NULL; END IF;

  order_reference:='sf:'||source_id::text||':'||source_version::text;
  facts:=pg_catalog.jsonb_build_object(
    'storeId',selected_store,'sourceKind',p_kind,'sourceId',source_id,
    'sourceVersion',source_version,'paymentMethodId',selected_method.id,
    'methodVersion',selected_method.version,'profileId',selected_profile.id,
    'profileVersion',selected_profile.version,'providerCode',selected_profile.provider_code,
    'environment',selected_profile.execution_environment,
    'credentialVersion',selected_profile.credential_version,
    'executionAdapterVersion',selected_profile.execution_adapter_version,
    'executionEvidenceDigest',selected_profile.execution_evidence_digest,
    'orderReference',order_reference,'currency',commerce->>'currency',
    'subtotalMinor',(commerce->>'subtotalCents')::bigint,
    'shippingMinor',(commerce->>'shippingCents')::bigint,
    'discountMinor',0,'totalMinor',(commerce->>'totalCents')::bigint,
    'delivery',p_delivery,'items',commerce->'items'
  );
  authority_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(facts::text,'UTF8')),'hex');
  RETURN facts||pg_catalog.jsonb_build_object(
    'authorityDigest',authority_digest,
    'presentation',CASE selected_profile.provider_code WHEN 'paytr_iframe' THEN 'iframe' WHEN 'akbank_json' THEN 'form_post' ELSE 'redirect' END,
    'requiredCustomerFields',CASE selected_profile.provider_code WHEN 'iyzico_iframe'
      THEN pg_catalog.jsonb_build_array('identity_number') ELSE '[]'::jsonb END,
    'customerName',(p_delivery->'contact'->>'firstName')||' '||(p_delivery->'contact'->>'lastName'),
    'customerEmail',p_delivery->'contact'->>'email',
    'customerPhone',p_delivery->'contact'->>'phone',
    'customerAddress',pg_catalog.concat_ws(' ',p_delivery->'shippingAddress'->>'line1',
      p_delivery->'shippingAddress'->>'line2',p_delivery->'shippingAddress'->>'district'),
    'city',p_delivery->'shippingAddress'->>'city',
    'country',p_delivery->'shippingAddress'->>'country',
    'postalCode',p_delivery->'shippingAddress'->>'postalCode',
    'basket',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'reference',entry->>'variantId','name',entry->>'title','quantity',(entry->>'quantity')::bigint,
      'unitAmountMinor',(entry->>'unitPriceCents')::bigint,'itemType','PHYSICAL'
    )) FROM pg_catalog.jsonb_array_elements(commerce->'items') entry)
  );
END
$function$
;

CREATE OR REPLACE FUNCTION saas.storefront_hosted_checkout_reconciliation_candidates_scoped(p_now timestamp with time zone, p_limit integer, p_authorities jsonb)
 RETURNS TABLE(attempt_id uuid, attempt_version bigint, attempt_status text, credential_version bigint, provider_reference text, provider_code text, environment text, adapter_version integer, evidence_digest text, candidate_position integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE
  item jsonb;
  item_keys text[];
  version_number numeric;
  scope_key text;
  seen_scopes text[]:=ARRAY[]::text[];
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25
    OR p_authorities IS NULL
  THEN RETURN; END IF;
  IF pg_catalog.jsonb_typeof(p_authorities)<>'array' THEN RETURN; END IF;
  IF pg_catalog.jsonb_array_length(p_authorities) NOT BETWEEN 1 AND 6 THEN RETURN; END IF;
  FOR item IN SELECT scope.value FROM pg_catalog.jsonb_array_elements(p_authorities) scope(value) LOOP
    IF pg_catalog.jsonb_typeof(item)<>'object' THEN RETURN; END IF;
    SELECT pg_catalog.array_agg(field.name ORDER BY field.name) INTO item_keys
      FROM pg_catalog.jsonb_object_keys(item) field(name);
    IF item_keys IS DISTINCT FROM ARRAY['adapterVersion','environment','evidenceDigest','providerCode']::text[]
      OR pg_catalog.jsonb_typeof(item->'providerCode')<>'string'
      OR pg_catalog.jsonb_typeof(item->'environment')<>'string'
      OR pg_catalog.jsonb_typeof(item->'adapterVersion')<>'number'
      OR pg_catalog.jsonb_typeof(item->'evidenceDigest')<>'string'
    THEN RETURN; END IF;
    IF (item->>'providerCode') NOT IN('paytr_iframe','iyzico_iframe','akbank_json')
      OR (item->>'environment') NOT IN('test','live')
      OR (item->>'evidenceDigest')!~'^sha256:[a-f0-9]{64}$'
    THEN RETURN; END IF;
    version_number:=(item->>'adapterVersion')::numeric;
    IF version_number NOT BETWEEN 1 AND 2147483647
      OR pg_catalog.trunc(version_number)<>version_number
    THEN RETURN; END IF;
    scope_key:=(item->>'providerCode')||':'||(item->>'environment');
    IF scope_key=ANY(seen_scopes) THEN RETURN; END IF;
    seen_scopes:=pg_catalog.array_append(seen_scopes,scope_key);
  END LOOP;
  RETURN QUERY
  WITH scopes AS (
    SELECT scope.value->>'providerCode' AS provider_code,
      scope.value->>'environment' AS environment,
      (scope.value->>'adapterVersion')::numeric::integer AS adapter_version,
      scope.value->>'evidenceDigest' AS evidence_digest
    FROM pg_catalog.jsonb_array_elements(p_authorities) scope(value)
  ), candidates AS (
    SELECT attempt.id,attempt.version,attempt.status,attempt.credential_version,
      attempt.safe_provider_reference,attempt.provider_code,attempt.environment,
      attempt.execution_adapter_version,attempt.execution_evidence_digest,attempt.updated_at
    FROM saas.payment_attempts attempt
    JOIN saas.storefront_hosted_checkout_sessions session
      ON session.store_id=attempt.store_id AND session.payment_attempt_id=attempt.id
    JOIN scopes scope
      ON scope.provider_code=attempt.provider_code AND scope.environment=attempt.environment
        AND scope.adapter_version=attempt.execution_adapter_version
        AND scope.evidence_digest=attempt.execution_evidence_digest
    JOIN saas.merchant_provider_execution_authorities authority
      ON authority.provider_code=attempt.provider_code AND authority.capability='payment_processing'
        AND authority.environment=attempt.environment
        AND authority.adapter_version=attempt.execution_adapter_version
        AND authority.evidence_digest=attempt.execution_evidence_digest
        AND authority.readiness=CASE WHEN attempt.environment='test' THEN 'sandbox_ready' ELSE 'production_ready' END
        AND authority.enabled
    WHERE session.status IN('active','provider_ready','processing')
      AND session.hold_expires_at<=p_now
      AND attempt.status IN(
        'awaiting_customer','submitted','authorized','provider_outcome_unknown','reconciliation_required'
      )
      AND (attempt.reconciliation_lease_expires_at IS NULL
        OR attempt.reconciliation_lease_expires_at<=p_now)
    ORDER BY attempt.updated_at,attempt.id
    LIMIT p_limit
  )
  SELECT candidate.id,candidate.version,candidate.status,candidate.credential_version,
    candidate.safe_provider_reference,candidate.provider_code,candidate.environment,
    candidate.execution_adapter_version,candidate.execution_evidence_digest,
    (pg_catalog.row_number() OVER(ORDER BY candidate.updated_at,candidate.id))::integer
  FROM candidates candidate
  ORDER BY candidate.updated_at,candidate.id;
END $function$
;

ALTER TABLE saas.storefront_hosted_checkout_sessions DROP CONSTRAINT storefront_hosted_checkout_sessions_provider_code_check,ADD CONSTRAINT storefront_hosted_checkout_sessions_provider_code_check CHECK(provider_code IN('paytr_iframe','iyzico_iframe','akbank_json'));
ALTER TABLE saas.payment_methods DROP CONSTRAINT payment_methods_provider_preference_check,ADD CONSTRAINT payment_methods_provider_preference_check CHECK(kind<>'provider' OR provider_code NOT IN('paytr_iframe','iyzico_iframe','akbank_json') OR saas.provider_payment_method_config_valid(provider_code,config));

INSERT INTO saas.merchant_provider_definitions(provider_code,capability,enabled,allows_verification_without_execution_authority,created_at)VALUES('akbank_json','payment_processing',true,true,'2026-10-25T00:00:00Z');

CREATE OR REPLACE FUNCTION saas.akbank_merchant_self_service_mark_verification(p_profile_id uuid, p_provider_code text, p_capability text, p_environment text, p_adapter_version integer, p_worker_id text, p_now timestamp with time zone, p_lease_id uuid, p_credential_version bigint, p_profile_version bigint, p_validation_outcome text, p_outcome_code text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE
  profile saas.merchant_provider_profiles%ROWTYPE;
  authority saas.merchant_provider_execution_authorities%ROWTYPE;
  operation saas.merchant_provider_profile_operations%ROWTYPE;
  current_method saas.payment_methods%ROWTYPE;
  result jsonb;
  method_config jsonb;
  fingerprint_source text;
  fingerprint text;
  selected_store_id uuid;
  selected_method_id uuid;
  next_position integer;
  method_count bigint;
BEGIN
  IF p_profile_id IS NULL OR p_provider_code IS NULL OR p_provider_code<>'akbank_json'
    OR p_capability IS NULL OR p_capability<>'payment_processing'
    OR p_environment IS NULL OR p_environment NOT IN('test','live')
    OR p_adapter_version IS NULL OR p_adapter_version<1
    OR p_worker_id IS NULL OR p_worker_id!~'^[A-Za-z0-9._:-]{1,128}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_lease_id IS NULL
    OR p_credential_version IS NULL OR p_credential_version<1
    OR p_profile_version IS NULL OR p_profile_version<1
    OR p_validation_outcome IS NULL OR p_validation_outcome NOT IN('validated','rejected','unavailable')
    OR p_outcome_code IS NULL OR p_outcome_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR (p_validation_outcome='unavailable')<>(p_outcome_code='validation_unavailable')
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  fingerprint_source:=p_profile_id::text||':'||p_provider_code||':'||p_capability||':'||
    p_environment||':'||p_adapter_version::text||':'||p_worker_id||':'||
    p_credential_version::text||':'||p_profile_version::text||':'||
    p_validation_outcome||':'||p_outcome_code;
  fingerprint:=pg_catalog.md5(fingerprint_source)||pg_catalog.md5('v1:'||fingerprint_source);

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.merchant.provider.profile.operation:'||p_lease_id::text,0
  ));
  SELECT * INTO operation FROM saas.merchant_provider_profile_operations
  WHERE operation_id=p_lease_id;
  IF FOUND THEN
    IF operation.operation_kind<>'validate' OR operation.payload_fingerprint<>fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'saas.merchant.provider.execution.authority:'||p_provider_code||':'||
    p_capability||':'||p_environment,0
  ));
  SELECT * INTO authority
  FROM saas.merchant_provider_execution_authorities AS candidate
  WHERE candidate.provider_code='akbank_json'
    AND candidate.capability='payment_processing'
    AND candidate.environment=p_environment
    AND candidate.adapter_version=p_adapter_version
    AND candidate.readiness=CASE p_environment
      WHEN 'test' THEN 'sandbox_ready' ELSE 'production_ready' END
    AND candidate.enabled
  FOR SHARE;

  SELECT candidate.store_id INTO selected_store_id
  FROM saas.merchant_provider_profiles AS candidate
  WHERE candidate.id=p_profile_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.method.position:'||selected_store_id::text,0
  ));
  PERFORM 1
  FROM saas.payment_methods AS method
  WHERE method.store_id=selected_store_id
  ORDER BY method.id
  FOR UPDATE;
  SELECT * INTO profile
  FROM saas.merchant_provider_profiles AS candidate
  WHERE candidate.id=p_profile_id AND candidate.store_id=selected_store_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;

  IF profile.public_config IS DISTINCT FROM pg_catalog.jsonb_build_object('environment',p_environment)
    OR profile.provider_code<>p_provider_code OR profile.capability<>p_capability
    OR profile.validation_environment<>p_environment
    OR profile.validation_adapter_version<>p_adapter_version
    OR profile.execution_environment IS NOT NULL
    OR profile.execution_adapter_version IS NOT NULL
    OR profile.execution_evidence_digest IS NOT NULL
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF profile.status<>'pending_validation'
    OR profile.validation_lease_id IS NULL OR profile.validation_lease_owner IS NULL
    OR profile.validation_lease_expires_at IS NULL
    OR profile.validation_lease_id<>p_lease_id
    OR profile.validation_lease_owner<>p_worker_id
    OR profile.validation_lease_expires_at<=p_now
    OR profile.credential_version<>p_credential_version
    OR profile.version<>p_profile_version
  THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb; RETURN; END IF;

  -- Keep the working provider and the pending validation lease unchanged on conflict.
  IF p_validation_outcome='validated' AND authority.evidence_digest IS NOT NULL
    AND EXISTS(SELECT 1 FROM saas.payment_methods method
      WHERE method.store_id=profile.store_id AND method.kind='provider' AND method.state='active'
        AND (method.profile_id,method.provider_code) IS DISTINCT FROM (p_profile_id,'akbank_json'::text))
  THEN RETURN QUERY SELECT 'provider_already_active',NULL::jsonb; RETURN; END IF;

  UPDATE saas.merchant_provider_profiles SET
    status=CASE p_validation_outcome
      WHEN 'validated' THEN 'active'
      WHEN 'rejected' THEN 'rotation_required'
      ELSE 'pending_validation'
    END,
    execution_environment=CASE
      WHEN p_validation_outcome='validated' AND authority.evidence_digest IS NOT NULL
      THEN p_environment ELSE NULL END,
    execution_adapter_version=CASE
      WHEN p_validation_outcome='validated' AND authority.evidence_digest IS NOT NULL
      THEN p_adapter_version ELSE NULL END,
    execution_evidence_digest=CASE
      WHEN p_validation_outcome='validated' AND authority.evidence_digest IS NOT NULL
      THEN authority.evidence_digest ELSE NULL END,
    version=version+1,
    last_validated_at=CASE
      WHEN p_validation_outcome='validated' THEN p_now ELSE last_validated_at END,
    validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL,
    updated_at=p_now
  WHERE id=p_profile_id;

  method_config:=pg_catalog.jsonb_build_object(
    'environment',p_environment,
    'locale','tr',
    'threeDSecure','provider_managed',
    'installmentMode','single_payment',
    'maxInstallment',0
  );

  IF p_validation_outcome='validated' AND authority.evidence_digest IS NOT NULL THEN
    SELECT pg_catalog.count(*) INTO method_count
    FROM saas.payment_methods AS method
    WHERE method.store_id=profile.store_id
      AND method.profile_id=p_profile_id
      AND method.kind='provider' AND method.provider_code='akbank_json';
    IF method_count>1 THEN
      RAISE EXCEPTION 'AKBANK_MERCHANT_SELF_SERVICE_METHOD_BINDING_CORRUPT';
    END IF;

    SELECT * INTO current_method
    FROM saas.payment_methods AS method
    WHERE method.store_id=profile.store_id
      AND method.profile_id=p_profile_id
      AND method.kind='provider' AND method.provider_code='akbank_json';



    selected_method_id:=COALESCE(current_method.id,p_profile_id);
    IF current_method.id IS NULL AND EXISTS(
      SELECT 1 FROM saas.payment_methods AS method WHERE method.id=selected_method_id
    ) THEN RAISE EXCEPTION 'AKBANK_MERCHANT_SELF_SERVICE_METHOD_ID_COLLISION'; END IF;

    IF current_method.id IS NULL THEN
      SELECT COALESCE(pg_catalog.max(method.position)+1,0) INTO next_position
      FROM saas.payment_methods AS method WHERE method.store_id=profile.store_id;
      IF next_position>9999 THEN
        RAISE EXCEPTION 'AKBANK_MERCHANT_SELF_SERVICE_METHOD_POSITION_EXHAUSTED';
      END IF;
    ELSE
      next_position:=current_method.position;
    END IF;

    INSERT INTO saas.payment_methods(
      id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
      position,config,version,created_at,updated_at
    ) VALUES(
      selected_method_id,profile.store_id,'provider',p_profile_id,'akbank_json',
      'Kredi veya banka kartı','active',NULL,next_position,method_config,1,p_now,p_now
    ) ON CONFLICT (id) DO UPDATE SET
      label=EXCLUDED.label,
      state=CASE WHEN saas.payment_methods.state='emergency_disabled'
        THEN 'emergency_disabled' ELSE 'active' END,
      emergency_reason=CASE WHEN saas.payment_methods.state='emergency_disabled'
        THEN saas.payment_methods.emergency_reason ELSE NULL END,
      config=EXCLUDED.config,
      version=saas.payment_methods.version+1,
      updated_at=EXCLUDED.updated_at;
  ELSE
    UPDATE saas.payment_methods AS method SET
      state='disabled',emergency_reason=NULL,version=method.version+1,updated_at=p_now
    WHERE method.store_id=profile.store_id
      AND method.profile_id=p_profile_id
      AND method.kind='provider' AND method.provider_code='akbank_json'
      AND method.state NOT IN('disabled','emergency_disabled');
  END IF;

  result:=saas.merchant_provider_profile_projection(profile.store_id,p_profile_id);
  INSERT INTO saas.merchant_provider_profile_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at
  ) VALUES(p_lease_id,profile.store_id,'validate',fingerprint,result,p_now);
  RETURN QUERY SELECT p_validation_outcome,result;
END
$function$
;
ALTER FUNCTION saas.akbank_merchant_self_service_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.akbank_merchant_self_service_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text) FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_platform_operator,celebix_saas_support_runtime;
GRANT EXECUTE ON FUNCTION saas.akbank_merchant_self_service_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text) TO celebix_saas_workflow;
DO $postconditions$ DECLARE saved record;BEGIN
 FOR saved IN SELECT *FROM saas.akbank_hosted_pos275_function_backup LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=saved.after_definition_sha
   AND p.proowner=saved.owner_oid AND p.proacl IS NOT DISTINCT FROM saved.acl
   AND p.proconfig IS NOT DISTINCT FROM saved.config AND p.prosecdef=saved.security_definer AND p.provolatile=saved.volatility)
  THEN RAISE EXCEPTION 'AKBANK275_POSTCONDITION_INVALID: %',saved.signature;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.storefront_hosted_checkout_sessions'::regclass AND conname='storefront_hosted_checkout_sessions_provider_code_check' AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='6655dd49cbce4b8313e805df8334da1e428e97ef68be9c88e0fcdb52201be795')THEN RAISE EXCEPTION 'AKBANK275_INSTALLED_CONSTRAINT_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.payment_methods'::regclass AND conname='payment_methods_provider_preference_check' AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='18cdece4d307fc401cac7242c7d4189f1dc6d59613cf4e3cd7de78d47079a9ee')THEN RAISE EXCEPTION 'AKBANK275_INSTALLED_CONSTRAINT_INVALID';END IF;
END $postconditions$;
COMMIT;
