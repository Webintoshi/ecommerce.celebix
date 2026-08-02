BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $toshi_provider_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.stores') IS NULL
     OR pg_catalog.to_regprocedure('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)') IS NULL THEN
    RAISE EXCEPTION 'TOSHI_PROVIDER_CONNECTIONS_PRECONDITION_FAILED';
  END IF;
END
$toshi_provider_precondition$;

CREATE FUNCTION saas.toshi_provider_timestamp(p_value timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $toshi_provider_timestamp$
  SELECT pg_catalog.to_char(p_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$toshi_provider_timestamp$;

CREATE FUNCTION saas.toshi_provider_envelope_valid(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $toshi_provider_envelope_valid$
DECLARE key_count integer;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value) <> 'object' OR pg_catalog.pg_column_size(p_value) > 32768 THEN
    RETURN false;
  END IF;
  SELECT pg_catalog.count(*) INTO key_count FROM pg_catalog.jsonb_object_keys(p_value);
  RETURN COALESCE(key_count = 6
    AND p_value ?& ARRAY['algorithm','ciphertext','iv','keyId','tag','version']
    AND pg_catalog.jsonb_typeof(p_value->'algorithm') = 'string'
    AND pg_catalog.jsonb_typeof(p_value->'ciphertext') = 'string'
    AND pg_catalog.jsonb_typeof(p_value->'iv') = 'string'
    AND pg_catalog.jsonb_typeof(p_value->'keyId') = 'string'
    AND pg_catalog.jsonb_typeof(p_value->'tag') = 'string'
    AND pg_catalog.jsonb_typeof(p_value->'version') = 'number'
    AND p_value->>'algorithm' = 'A256GCM'
    AND p_value->>'version' = '1'
    AND p_value->>'keyId' ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
    AND p_value->>'ciphertext' ~ '^[A-Za-z0-9_-]{2,21846}$'
    AND p_value->>'iv' ~ '^[A-Za-z0-9_-]{16}$'
    AND p_value->>'tag' ~ '^[A-Za-z0-9_-]{22}$',false);
END
$toshi_provider_envelope_valid$;

CREATE FUNCTION saas.toshi_provider_models_valid(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $toshi_provider_models_valid$
DECLARE entry jsonb; key_count integer; model_id text; seen text[] := ARRAY[]::text[];
BEGIN
  IF pg_catalog.jsonb_typeof(p_value) <> 'array'
     OR pg_catalog.jsonb_array_length(p_value) < 1
     OR pg_catalog.jsonb_array_length(p_value) > 100
     OR pg_catalog.pg_column_size(p_value) > 65536 THEN
    RETURN false;
  END IF;
  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_value) LOOP
    IF pg_catalog.jsonb_typeof(entry) <> 'object' THEN RETURN false; END IF;
    SELECT pg_catalog.count(*) INTO key_count FROM pg_catalog.jsonb_object_keys(entry);
    IF key_count <> 2 OR NOT (entry ? 'id') OR NOT (entry ? 'label')
       OR pg_catalog.jsonb_typeof(entry->'id') <> 'string'
       OR pg_catalog.jsonb_typeof(entry->'label') <> 'string' THEN RETURN false; END IF;
    model_id := entry->>'id';
    IF pg_catalog.octet_length(model_id) < 1 OR pg_catalog.octet_length(model_id) > 160
       OR model_id <> pg_catalog.btrim(model_id) OR model_id ~ '[[:cntrl:]]'
       OR pg_catalog.octet_length(entry->>'label') < 1 OR pg_catalog.octet_length(entry->>'label') > 160
       OR entry->>'label' <> pg_catalog.btrim(entry->>'label') OR entry->>'label' ~ '[[:cntrl:]]'
       OR model_id = ANY(seen) THEN RETURN false; END IF;
    seen := pg_catalog.array_append(seen,model_id);
  END LOOP;
  RETURN true;
END
$toshi_provider_models_valid$;

CREATE FUNCTION saas.toshi_provider_model_available(p_models jsonb,p_model text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $toshi_provider_model_available$
  SELECT EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_models) AS entry
    WHERE entry->>'id' = p_model
  )
$toshi_provider_model_available$;

CREATE TABLE saas.toshi_provider_configs (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE CASCADE,
  provider text NOT NULL CONSTRAINT toshi_provider_configs_provider_check
    CHECK (provider IN ('openai','gemini','anthropic')),
  sealed_credentials jsonb NOT NULL CONSTRAINT toshi_provider_configs_envelope_check
    CHECK (saas.toshi_provider_envelope_valid(sealed_credentials)),
  credential_digest text NOT NULL CONSTRAINT toshi_provider_configs_digest_check
    CHECK (credential_digest ~ '^sha256:[a-f0-9]{64}$'),
  credential_version bigint NOT NULL CONSTRAINT toshi_provider_configs_credential_version_check
    CHECK (credential_version >= 1),
  masked_key text NOT NULL CONSTRAINT toshi_provider_configs_masked_key_check
    CHECK (pg_catalog.char_length(masked_key)=8 AND pg_catalog.left(masked_key,4)='••••' AND masked_key !~ '[[:cntrl:][:space:]]'),
  selected_model text NOT NULL CONSTRAINT toshi_provider_configs_selected_model_check
    CHECK (pg_catalog.octet_length(selected_model) BETWEEN 1 AND 160 AND selected_model=pg_catalog.btrim(selected_model) AND selected_model !~ '[[:cntrl:]]'),
  available_models jsonb NOT NULL CONSTRAINT toshi_provider_configs_models_check
    CHECK (saas.toshi_provider_models_valid(available_models)),
  status text NOT NULL CONSTRAINT toshi_provider_configs_status_check
    CHECK (status IN ('active','revoked')),
  is_default boolean NOT NULL DEFAULT false,
  version bigint NOT NULL CONSTRAINT toshi_provider_configs_version_check CHECK (version >= 1),
  verified_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT toshi_provider_configs_model_authority_check
    CHECK (saas.toshi_provider_model_available(available_models,selected_model)),
  CONSTRAINT toshi_provider_configs_lifecycle_check
    CHECK ((status='active' AND revoked_at IS NULL) OR (status='revoked' AND revoked_at IS NOT NULL AND is_default=false)),
  CONSTRAINT toshi_provider_configs_timestamp_check
    CHECK (verified_at>=created_at AND updated_at>=created_at AND (revoked_at IS NULL OR revoked_at>=created_at))
);

CREATE UNIQUE INDEX toshi_provider_one_live_provider
  ON saas.toshi_provider_configs(store_id,provider) WHERE status = 'active';
CREATE UNIQUE INDEX toshi_provider_one_default
  ON saas.toshi_provider_configs(store_id) WHERE status = 'active' AND is_default;
CREATE INDEX toshi_provider_configs_store_history_idx
  ON saas.toshi_provider_configs(store_id,provider,updated_at DESC,id DESC);

CREATE TABLE saas.toshi_provider_operations (
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE CASCADE,
  operation_kind text NOT NULL CONSTRAINT toshi_provider_operations_kind_check
    CHECK (operation_kind IN ('connect','select_model','set_default','revoke')),
  payload_fingerprint text NOT NULL CONSTRAINT toshi_provider_operations_fingerprint_check
    CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL CONSTRAINT toshi_provider_operations_payload_check
    CHECK (pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=65536),
  created_at timestamptz NOT NULL
);
CREATE INDEX toshi_provider_operations_store_idx
  ON saas.toshi_provider_operations(store_id,created_at DESC,operation_id DESC);

CREATE TABLE saas.toshi_provider_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE CASCADE,
  config_id uuid NOT NULL REFERENCES saas.toshi_provider_configs(id) ON DELETE RESTRICT,
  provider text NOT NULL CONSTRAINT toshi_provider_events_provider_check
    CHECK (provider IN ('openai','gemini','anthropic')),
  event_kind text NOT NULL CONSTRAINT toshi_provider_events_kind_check
    CHECK (event_kind IN ('connected','rotated','model_selected','default_selected','revoked')),
  summary jsonb NOT NULL CONSTRAINT toshi_provider_events_summary_check
    CHECK (pg_catalog.jsonb_typeof(summary)='object' AND pg_catalog.pg_column_size(summary)<=65536),
  occurred_at timestamptz NOT NULL
);
CREATE INDEX toshi_provider_events_store_idx
  ON saas.toshi_provider_events(store_id,occurred_at DESC,id DESC);

ALTER TABLE saas.toshi_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.toshi_provider_configs FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.toshi_provider_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.toshi_provider_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.toshi_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.toshi_provider_events FORCE ROW LEVEL SECURITY;

CREATE FUNCTION saas.guard_toshi_provider_event_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $guard_toshi_provider_event_immutability$
BEGIN
  RAISE EXCEPTION 'TOSHI_PROVIDER_EVENT_IMMUTABLE';
END
$guard_toshi_provider_event_immutability$;

CREATE TRIGGER toshi_provider_events_immutable
BEFORE UPDATE OR DELETE ON saas.toshi_provider_events
FOR EACH ROW EXECUTE FUNCTION saas.guard_toshi_provider_event_immutability();

CREATE FUNCTION saas.guard_toshi_provider_operation_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $guard_toshi_provider_operation_immutability$
BEGIN
  RAISE EXCEPTION 'TOSHI_PROVIDER_OPERATION_IMMUTABLE';
END
$guard_toshi_provider_operation_immutability$;

CREATE TRIGGER toshi_provider_operations_immutable
BEFORE UPDATE OR DELETE ON saas.toshi_provider_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_toshi_provider_operation_immutability();

CREATE FUNCTION saas.toshi_provider_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_write boolean
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $toshi_provider_authority_error$
BEGIN
  IF p_write THEN
    RETURN saas.merchant_action_authority_error(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
      'catalog','configuration.manage'
    );
  END IF;
  RETURN saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    'catalog','configuration.read'
  );
END
$toshi_provider_authority_error$;

CREATE FUNCTION saas.toshi_provider_public_payload(p_store_id uuid,p_config_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $toshi_provider_public_payload$
  SELECT pg_catalog.jsonb_build_object(
    'provider',c.provider,
    'label',CASE c.provider WHEN 'openai' THEN 'OpenAI' WHEN 'gemini' THEN 'Google Gemini' ELSE 'Anthropic Claude' END,
    'status',c.status,
    'isDefault',c.is_default,
    'maskedKey',c.masked_key,
    'selectedModel',c.selected_model,
    'availableModels',c.available_models,
    'version',c.version,
    'verifiedAt',saas.toshi_provider_timestamp(c.verified_at),
    'updatedAt',saas.toshi_provider_timestamp(c.updated_at)
  )
  FROM saas.toshi_provider_configs AS c
  WHERE c.store_id=p_store_id AND c.id=p_config_id
$toshi_provider_public_payload$;

CREATE FUNCTION saas.toshi_provider_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $toshi_provider_list$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.toshi_provider_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed'::text,pg_catalog.jsonb_build_object(
    'items',COALESCE((
      SELECT pg_catalog.jsonb_agg(saas.toshi_provider_public_payload(p_store_id,c.id) ORDER BY c.provider)
      FROM saas.toshi_provider_configs AS c
      WHERE c.store_id=p_store_id AND c.status='active'
    ),'[]'::jsonb)
  );
END
$toshi_provider_list$;

CREATE FUNCTION saas.toshi_provider_connection_identity(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_provider text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $toshi_provider_connection_identity$
DECLARE authority_error text; selected saas.toshi_provider_configs%ROWTYPE;
BEGIN
  authority_error:=saas.toshi_provider_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_provider IS NULL OR p_provider NOT IN ('openai','gemini','anthropic') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected FROM saas.toshi_provider_configs
    WHERE store_id=p_store_id AND provider=p_provider AND status='active';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_build_object(
    'configId',selected.id,'credentialVersion',selected.credential_version,'version',selected.version
  );
END
$toshi_provider_connection_identity$;

CREATE FUNCTION saas.toshi_provider_connect(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_payload_fingerprint text,p_config_id uuid,p_provider text,
  p_sealed_credentials jsonb,p_credential_digest text,p_credential_version bigint,
  p_masked_key text,p_selected_model text,p_available_models jsonb,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $toshi_provider_connect$
DECLARE
  authority_error text; operation_row saas.toshi_provider_operations%ROWTYPE;
  current_row saas.toshi_provider_configs%ROWTYPE; payload jsonb; event_kind text;
BEGIN
  authority_error:=saas.toshi_provider_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_config_id IS NULL OR p_provider IS NULL OR p_provider NOT IN ('openai','gemini','anthropic')
     OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$'
     OR p_sealed_credentials IS NULL OR NOT saas.toshi_provider_envelope_valid(p_sealed_credentials)
     OR p_credential_digest IS NULL OR p_credential_digest !~ '^sha256:[a-f0-9]{64}$' OR p_credential_version IS NULL OR p_credential_version<1
     OR p_masked_key IS NULL OR pg_catalog.char_length(p_masked_key)<>8 OR pg_catalog.left(p_masked_key,4)<>'••••'
     OR p_masked_key ~ '[[:cntrl:][:space:]]' OR NOT saas.toshi_provider_models_valid(p_available_models)
     OR p_available_models IS NULL OR p_selected_model IS NULL OR NOT saas.toshi_provider_model_available(p_available_models,p_selected_model)
     OR p_expected_version IS NULL OR p_expected_version<0 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  SELECT * INTO operation_row FROM saas.toshi_provider_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation_row.store_id<>p_store_id OR operation_row.operation_kind<>'connect'
       OR operation_row.payload_fingerprint<>p_payload_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation_row.result_payload; END IF;
    RETURN;
  END IF;

  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO current_row FROM saas.toshi_provider_configs
    WHERE store_id=p_store_id AND provider=p_provider AND status='active' FOR UPDATE;
  IF FOUND THEN
    IF current_row.id<>p_config_id OR current_row.version<>p_expected_version
       OR p_credential_version<>current_row.credential_version+1 THEN
      RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
    END IF;
    UPDATE saas.toshi_provider_configs SET
      sealed_credentials=p_sealed_credentials,credential_digest=p_credential_digest,
      credential_version=p_credential_version,masked_key=p_masked_key,
      selected_model=p_selected_model,available_models=p_available_models,
      verified_at=p_now,updated_at=p_now,version=version+1
    WHERE id=current_row.id;
    event_kind:='rotated';
  ELSE
    IF p_expected_version<>0 OR p_credential_version<>1 THEN
      RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
    END IF;
    INSERT INTO saas.toshi_provider_configs(
      id,store_id,provider,sealed_credentials,credential_digest,credential_version,
      masked_key,selected_model,available_models,status,is_default,version,
      verified_at,revoked_at,created_at,updated_at
    ) VALUES(
      p_config_id,p_store_id,p_provider,p_sealed_credentials,p_credential_digest,p_credential_version,
      p_masked_key,p_selected_model,p_available_models,'active',
      NOT EXISTS(SELECT 1 FROM saas.toshi_provider_configs WHERE store_id=p_store_id AND status='active' AND is_default),
      1,p_now,NULL,p_now,p_now
    );
    event_kind:='connected';
  END IF;
  payload:=saas.toshi_provider_public_payload(p_store_id,p_config_id);
  INSERT INTO saas.toshi_provider_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,created_at)
    VALUES(p_operation_id,p_store_id,'connect',p_payload_fingerprint,payload,p_now);
  INSERT INTO saas.toshi_provider_events(id,store_id,config_id,provider,event_kind,summary,occurred_at)
    VALUES(p_operation_id,p_store_id,p_config_id,p_provider,event_kind,payload,p_now);
  RETURN QUERY SELECT 'connected'::text,payload;
END
$toshi_provider_connect$;

CREATE FUNCTION saas.toshi_provider_select_model(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_payload_fingerprint text,p_provider text,p_model text,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $toshi_provider_select_model$
DECLARE authority_error text; operation_row saas.toshi_provider_operations%ROWTYPE; current_row saas.toshi_provider_configs%ROWTYPE; payload jsonb;
BEGIN
  authority_error:=saas.toshi_provider_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_provider IS NULL OR p_provider NOT IN ('openai','gemini','anthropic')
     OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$' OR p_model IS NULL
     OR pg_catalog.octet_length(p_model) NOT BETWEEN 1 AND 160 OR p_model<>pg_catalog.btrim(p_model) OR p_model~'[[:cntrl:]]'
     OR p_expected_version IS NULL OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation_row FROM saas.toshi_provider_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation_row.store_id<>p_store_id OR operation_row.operation_kind<>'select_model' OR operation_row.payload_fingerprint<>p_payload_fingerprint
      THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
      ELSE RETURN QUERY SELECT 'operation_replayed',operation_row.result_payload; END IF; RETURN;
  END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO current_row FROM saas.toshi_provider_configs WHERE store_id=p_store_id AND provider=p_provider AND status='active' FOR UPDATE;
  IF NOT FOUND OR current_row.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF NOT saas.toshi_provider_model_available(current_row.available_models,p_model) THEN RETURN QUERY SELECT 'model_unavailable',NULL::jsonb; RETURN; END IF;
  UPDATE saas.toshi_provider_configs SET selected_model=p_model,version=version+1,updated_at=p_now WHERE id=current_row.id;
  payload:=saas.toshi_provider_public_payload(p_store_id,current_row.id);
  INSERT INTO saas.toshi_provider_operations VALUES(p_operation_id,p_store_id,'select_model',p_payload_fingerprint,payload,p_now);
  INSERT INTO saas.toshi_provider_events VALUES(p_operation_id,p_store_id,current_row.id,p_provider,'model_selected',payload,p_now);
  RETURN QUERY SELECT 'updated'::text,payload;
END
$toshi_provider_select_model$;

CREATE FUNCTION saas.toshi_provider_set_default(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_payload_fingerprint text,p_provider text,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $toshi_provider_set_default$
DECLARE authority_error text; operation_row saas.toshi_provider_operations%ROWTYPE; current_row saas.toshi_provider_configs%ROWTYPE; payload jsonb;
BEGIN
  authority_error:=saas.toshi_provider_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_provider IS NULL OR p_provider NOT IN ('openai','gemini','anthropic')
     OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version<1
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation_row FROM saas.toshi_provider_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation_row.store_id<>p_store_id OR operation_row.operation_kind<>'set_default' OR operation_row.payload_fingerprint<>p_payload_fingerprint
      THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
      ELSE RETURN QUERY SELECT 'operation_replayed',operation_row.result_payload; END IF; RETURN;
  END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO current_row FROM saas.toshi_provider_configs WHERE store_id=p_store_id AND provider=p_provider AND status='active' FOR UPDATE;
  IF NOT FOUND OR current_row.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  UPDATE saas.toshi_provider_configs SET is_default=false,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND status='active' AND is_default AND id<>current_row.id;
  UPDATE saas.toshi_provider_configs SET is_default=true,version=version+1,updated_at=p_now WHERE id=current_row.id;
  payload:=saas.toshi_provider_public_payload(p_store_id,current_row.id);
  INSERT INTO saas.toshi_provider_operations VALUES(p_operation_id,p_store_id,'set_default',p_payload_fingerprint,payload,p_now);
  INSERT INTO saas.toshi_provider_events VALUES(p_operation_id,p_store_id,current_row.id,p_provider,'default_selected',payload,p_now);
  RETURN QUERY SELECT 'updated'::text,payload;
END
$toshi_provider_set_default$;

CREATE FUNCTION saas.toshi_provider_revoke(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_payload_fingerprint text,p_provider text,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $toshi_provider_revoke$
DECLARE authority_error text; operation_row saas.toshi_provider_operations%ROWTYPE; current_row saas.toshi_provider_configs%ROWTYPE; payload jsonb;
BEGIN
  authority_error:=saas.toshi_provider_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_provider IS NULL OR p_provider NOT IN ('openai','gemini','anthropic')
     OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version<1
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation_row FROM saas.toshi_provider_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation_row.store_id<>p_store_id OR operation_row.operation_kind<>'revoke' OR operation_row.payload_fingerprint<>p_payload_fingerprint
      THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
      ELSE RETURN QUERY SELECT 'operation_replayed',operation_row.result_payload; END IF; RETURN;
  END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO current_row FROM saas.toshi_provider_configs WHERE store_id=p_store_id AND provider=p_provider AND status='active' FOR UPDATE;
  IF NOT FOUND OR current_row.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  UPDATE saas.toshi_provider_configs SET status='revoked',is_default=false,revoked_at=p_now,version=version+1,updated_at=p_now WHERE id=current_row.id;
  payload:=saas.toshi_provider_public_payload(p_store_id,current_row.id);
  INSERT INTO saas.toshi_provider_operations VALUES(p_operation_id,p_store_id,'revoke',p_payload_fingerprint,payload,p_now);
  INSERT INTO saas.toshi_provider_events VALUES(p_operation_id,p_store_id,current_row.id,p_provider,'revoked',payload,p_now);
  RETURN QUERY SELECT 'revoked'::text,payload;
END
$toshi_provider_revoke$;

CREATE FUNCTION saas.toshi_provider_get_authority(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_provider text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $toshi_provider_get_authority$
DECLARE authority_error text; selected saas.toshi_provider_configs%ROWTYPE;
BEGIN
  authority_error:=saas.toshi_provider_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_provider IS NOT NULL AND p_provider NOT IN ('openai','gemini','anthropic') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected FROM saas.toshi_provider_configs
    WHERE store_id=p_store_id AND status='active' AND ((p_provider IS NULL AND is_default) OR provider=p_provider)
    ORDER BY is_default DESC,updated_at DESC,id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_build_object(
    'configId',selected.id,'provider',selected.provider,'selectedModel',selected.selected_model,
    'sealedCredentials',selected.sealed_credentials,'credentialVersion',selected.credential_version,
    'version',selected.version
  );
END
$toshi_provider_get_authority$;

CREATE FUNCTION saas.toshi_provider_recover_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_payload_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $toshi_provider_recover_operation$
DECLARE authority_error text; operation_row saas.toshi_provider_operations%ROWTYPE;
BEGIN
  authority_error:=saas.toshi_provider_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation_row FROM saas.toshi_provider_operations WHERE operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF operation_row.store_id<>p_store_id OR operation_row.payload_fingerprint<>p_payload_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'operation_replayed'::text,operation_row.result_payload;
END
$toshi_provider_recover_operation$;

ALTER FUNCTION saas.toshi_provider_timestamp(timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.toshi_provider_envelope_valid(jsonb) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.toshi_provider_models_valid(jsonb) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.toshi_provider_model_available(jsonb,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.guard_toshi_provider_event_immutability() OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.guard_toshi_provider_operation_immutability() OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.toshi_provider_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,boolean) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.toshi_provider_public_payload(uuid,uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.toshi_provider_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.toshi_provider_connection_identity(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.toshi_provider_connect(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb,text,bigint,text,text,jsonb,bigint) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.toshi_provider_select_model(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,text,bigint) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.toshi_provider_set_default(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.toshi_provider_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.toshi_provider_get_authority(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.toshi_provider_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) OWNER TO celebix_saas_owner;

REVOKE ALL ON TABLE saas.toshi_provider_configs,saas.toshi_provider_operations,saas.toshi_provider_events FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION
  saas.toshi_provider_timestamp(timestamptz),
  saas.toshi_provider_envelope_valid(jsonb),
  saas.toshi_provider_models_valid(jsonb),
  saas.toshi_provider_model_available(jsonb,text),
  saas.guard_toshi_provider_event_immutability(),
  saas.guard_toshi_provider_operation_immutability(),
  saas.toshi_provider_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,boolean),
  saas.toshi_provider_public_payload(uuid,uuid),
  saas.toshi_provider_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.toshi_provider_connection_identity(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.toshi_provider_connect(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb,text,bigint,text,text,jsonb,bigint),
  saas.toshi_provider_select_model(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,text,bigint),
  saas.toshi_provider_set_default(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint),
  saas.toshi_provider_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint),
  saas.toshi_provider_get_authority(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.toshi_provider_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

GRANT EXECUTE ON FUNCTION saas.toshi_provider_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.toshi_provider_connection_identity(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.toshi_provider_connect(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb,text,bigint,text,text,jsonb,bigint),
  saas.toshi_provider_select_model(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,text,bigint),
  saas.toshi_provider_set_default(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint),
  saas.toshi_provider_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint),
  saas.toshi_provider_get_authority(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.toshi_provider_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
TO celebix_saas_app;

COMMIT;
