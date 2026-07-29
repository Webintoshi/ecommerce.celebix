-- Phase 3J: store-scoped payment method administration. No provider execution occurs here.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.merchant_provider_definitions
  DROP CONSTRAINT merchant_provider_definitions_capability_check;
ALTER TABLE saas.merchant_provider_definitions
  ADD CONSTRAINT merchant_provider_definitions_capability_check CHECK(capability IN(
    'marketplace_sync','invoice_reconciliation','email_delivery',
    'phone_delivery','whatsapp_delivery','indexing','payment_processing'
  ));

CREATE TABLE saas.payment_methods(
  id uuid NOT NULL,
  store_id uuid NOT NULL,
  kind text NOT NULL,
  profile_id uuid,
  provider_code text,
  label text NOT NULL,
  state text NOT NULL,
  emergency_reason text,
  position integer NOT NULL,
  config jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(id),
  UNIQUE(store_id,id),
  UNIQUE(store_id,position) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,profile_id,provider_code)
    REFERENCES saas.merchant_provider_profiles(store_id,id,provider_code) ON DELETE RESTRICT,
  CHECK(kind IN('provider','cash_on_delivery','bank_transfer')),
  CHECK(
    (kind='provider' AND profile_id IS NOT NULL AND provider_code IS NOT NULL)
    OR
    (kind IN('cash_on_delivery','bank_transfer') AND profile_id IS NULL AND provider_code IS NULL)
  ),
  CHECK(label=pg_catalog.btrim(label)
    AND pg_catalog.char_length(label) BETWEEN 1 AND 120
    AND label!~'[[:cntrl:]]'),
  CHECK(state IN('active','disabled','emergency_disabled')),
  CHECK(
    (state='emergency_disabled' AND emergency_reason IS NOT NULL
      AND emergency_reason=pg_catalog.btrim(emergency_reason)
      AND pg_catalog.char_length(emergency_reason) BETWEEN 3 AND 240
      AND emergency_reason!~'[[:cntrl:]]')
    OR
    (state<>'emergency_disabled' AND emergency_reason IS NULL)
  ),
  CHECK(position BETWEEN 0 AND 9999),
  CHECK(saas.merchant_provider_public_config_valid(config)),
  CHECK(version>0),
  CHECK(updated_at>=created_at)
);

CREATE TABLE saas.payment_method_operations(
  operation_id uuid NOT NULL,
  store_id uuid NOT NULL,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY(operation_id),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CHECK(operation_kind IN('save','set_state','reorder')),
  CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  CHECK(pg_catalog.jsonb_typeof(result_payload)='object'
    AND pg_catalog.pg_column_size(result_payload)<=65536)
);

CREATE INDEX payment_methods_list_idx
  ON saas.payment_methods(store_id,position,id);
CREATE INDEX payment_methods_profile_idx
  ON saas.payment_methods(store_id,profile_id)
  WHERE profile_id IS NOT NULL;

ALTER TABLE saas.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.payment_methods FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.payment_method_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.payment_method_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON saas.payment_methods,saas.payment_method_operations
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE TRIGGER payment_method_operations_immutable
  BEFORE UPDATE OR DELETE ON saas.payment_method_operations
  FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();

CREATE FUNCTION saas.payment_method_projection(p_store_id uuid,p_method_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'id',method.id,
    'kind',method.kind,
    'profileId',method.profile_id,
    'providerCode',method.provider_code,
    'label',method.label,
    'state',method.state,
    'emergencyReason',method.emergency_reason,
    'position',method.position,
    'config',method.config,
    'version',method.version,
    'createdAt',saas.merchant_admin_timestamp(method.created_at),
    'updatedAt',saas.merchant_admin_timestamp(method.updated_at)
  )
  FROM saas.payment_methods AS method
  WHERE method.store_id=p_store_id AND method.id=p_method_id
$f$;

CREATE FUNCTION saas.payment_method_mutation_projection(
  p_store_id uuid,p_method_id uuid,p_replayed boolean
)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'id',method.id,
    'state',method.state,
    'position',method.position,
    'version',method.version,
    'updatedAt',saas.merchant_admin_timestamp(method.updated_at),
    'replayed',p_replayed
  )
  FROM saas.payment_methods AS method
  WHERE method.store_id=p_store_id AND method.id=p_method_id
$f$;

CREATE FUNCTION saas.payment_method_reorder_projection(p_store_id uuid,p_replayed boolean)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'items',COALESCE(
      pg_catalog.jsonb_agg(
        saas.payment_method_mutation_projection(p_store_id,method.id,p_replayed)
        ORDER BY method.position,method.id
      ),
      '[]'::jsonb
    ),
    'replayed',p_replayed
  )
  FROM saas.payment_methods AS method
  WHERE method.store_id=p_store_id
$f$;

CREATE FUNCTION saas.payment_method_replay_payload(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas
AS $f$
  SELECT CASE WHEN p_payload?'items' THEN
    pg_catalog.jsonb_build_object(
      'items',COALESCE((
        SELECT pg_catalog.jsonb_agg(item.value||'{"replayed":true}'::jsonb)
        FROM pg_catalog.jsonb_array_elements(p_payload->'items') AS item(value)
      ),'[]'::jsonb),
      'replayed',true
    )
  ELSE p_payload||'{"replayed":true}'::jsonb END
$f$;

CREATE FUNCTION saas.payment_method_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_admin_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,'payment_setting',false
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object(
    'items',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        saas.payment_method_projection(p_store_id,method.id)
        ORDER BY method.position,method.id
      )
      FROM saas.payment_methods AS method
      WHERE method.store_id=p_store_id
    ),'[]'::jsonb)
  );
END
$f$;

CREATE FUNCTION saas.payment_method_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_method_id uuid,p_expected_version bigint,
  p_kind text,p_profile_id uuid,p_provider_code text,p_label text,p_config jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text; operation saas.payment_method_operations%ROWTYPE;
  current_method saas.payment_methods%ROWTYPE; profile saas.merchant_provider_profiles%ROWTYPE;
  next_position integer; result jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_method_id IS NULL OR p_now IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version<0
    OR p_kind IS NULL OR p_kind NOT IN('provider','cash_on_delivery','bank_transfer')
    OR p_label IS NULL OR p_label<>pg_catalog.btrim(p_label)
    OR pg_catalog.char_length(p_label) NOT BETWEEN 1 AND 120 OR p_label~'[[:cntrl:]]'
    OR p_config IS NULL OR NOT saas.merchant_provider_public_config_valid(p_config)
    OR (p_kind='provider' AND (p_profile_id IS NULL OR p_provider_code IS NULL
      OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'))
    OR (p_kind<>'provider' AND (p_profile_id IS NOT NULL OR p_provider_code IS NOT NULL))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  authority_error:=saas.merchant_admin_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,'payment_setting',true
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.method.operation:'||p_operation_id::text,0
  ));
  SELECT * INTO operation FROM saas.payment_method_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint
      OR operation.operation_kind<>'save'
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',saas.payment_method_replay_payload(operation.result_payload);
    END IF;
    RETURN;
  END IF;

  IF p_kind='provider' THEN
    SELECT * INTO profile FROM saas.merchant_provider_profiles
    WHERE store_id=p_store_id AND id=p_profile_id FOR SHARE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
    IF profile.provider_code<>p_provider_code OR profile.capability<>'payment_processing' THEN
      RETURN QUERY SELECT 'provider_capability_mismatch',NULL::jsonb; RETURN;
    END IF;
    IF profile.status<>'active' THEN
      RETURN QUERY SELECT 'profile_not_active',NULL::jsonb; RETURN;
    END IF;
  END IF;

  SELECT * INTO current_method FROM saas.payment_methods
  WHERE store_id=p_store_id AND id=p_method_id FOR UPDATE;
  IF FOUND THEN
    IF current_method.kind<>p_kind
      OR current_method.profile_id IS DISTINCT FROM p_profile_id
      OR current_method.provider_code IS DISTINCT FROM p_provider_code
    THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
    IF current_method.version<>p_expected_version THEN
      RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
    END IF;
    UPDATE saas.payment_methods SET
      label=p_label,config=p_config,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND id=p_method_id;
  ELSE
    IF p_expected_version<>0 THEN
      RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN;
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'saas.payment.method.position:'||p_store_id::text,0
    ));
    SELECT COALESCE(pg_catalog.max(method.position)+1,0) INTO next_position
    FROM saas.payment_methods AS method WHERE method.store_id=p_store_id;
    IF next_position>9999 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    INSERT INTO saas.payment_methods(
      id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
      position,config,version,created_at,updated_at
    ) VALUES(
      p_method_id,p_store_id,p_kind,p_profile_id,p_provider_code,p_label,'disabled',NULL,
      next_position,p_config,1,p_now,p_now
    );
  END IF;

  result:=saas.payment_method_mutation_projection(p_store_id,p_method_id,false);
  INSERT INTO saas.payment_method_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at
  ) VALUES(p_operation_id,p_store_id,'save',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'saved',result;
END
$f$;

CREATE FUNCTION saas.payment_method_set_state(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_method_id uuid,p_expected_version bigint,
  p_state text,p_emergency_reason text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text; operation saas.payment_method_operations%ROWTYPE;
  method saas.payment_methods%ROWTYPE; profile saas.merchant_provider_profiles%ROWTYPE;
  result jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_method_id IS NULL OR p_now IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version<1
    OR p_state IS NULL OR p_state NOT IN('active','disabled','emergency_disabled')
    OR (p_state='emergency_disabled' AND (
      p_emergency_reason IS NULL OR p_emergency_reason<>pg_catalog.btrim(p_emergency_reason)
      OR pg_catalog.char_length(p_emergency_reason) NOT BETWEEN 3 AND 240
      OR p_emergency_reason~'[[:cntrl:]]'
    ))
    OR (p_state<>'emergency_disabled' AND p_emergency_reason IS NOT NULL)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  authority_error:=saas.merchant_admin_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,'payment_setting',true
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.method.operation:'||p_operation_id::text,0
  ));
  SELECT * INTO operation FROM saas.payment_method_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint
      OR operation.operation_kind<>'set_state'
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',saas.payment_method_replay_payload(operation.result_payload);
    END IF;
    RETURN;
  END IF;

  SELECT * INTO method FROM saas.payment_methods
  WHERE store_id=p_store_id AND id=p_method_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  IF method.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF method.state=p_state
    OR (method.state='disabled' AND p_state='emergency_disabled')
  THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;

  IF p_state='active' AND method.kind='provider' THEN
    SELECT * INTO profile FROM saas.merchant_provider_profiles
    WHERE store_id=p_store_id AND id=method.profile_id FOR SHARE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
    IF profile.provider_code<>method.provider_code OR profile.capability<>'payment_processing' THEN
      RETURN QUERY SELECT 'provider_capability_mismatch',NULL::jsonb; RETURN;
    END IF;
    IF profile.status<>'active' THEN
      RETURN QUERY SELECT 'profile_not_active',NULL::jsonb; RETURN;
    END IF;
  END IF;

  UPDATE saas.payment_methods SET
    state=p_state,emergency_reason=p_emergency_reason,
    version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_method_id;
  result:=saas.payment_method_mutation_projection(p_store_id,p_method_id,false);
  INSERT INTO saas.payment_method_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at
  ) VALUES(p_operation_id,p_store_id,'set_state',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'state_changed',result;
END
$f$;

CREATE FUNCTION saas.payment_method_reorder(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_items jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text; operation saas.payment_method_operations%ROWTYPE;
  item_count integer; live_count integer; result jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_now IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_items IS NULL OR pg_catalog.jsonb_typeof(p_items)<>'array'
    OR NOT (pg_catalog.jsonb_array_length(p_items) BETWEEN 1 AND 100)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  item_count:=pg_catalog.jsonb_array_length(p_items);
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_items) AS item(value)
    WHERE pg_catalog.jsonb_typeof(item.value)<>'object'
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(item.value))<>3
      OR EXISTS(
        SELECT 1 FROM pg_catalog.jsonb_object_keys(item.value) AS field(key)
        WHERE field.key NOT IN('id','expectedVersion','position')
      )
      OR pg_catalog.jsonb_typeof(item.value->'id')<>'string'
      OR item.value->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      OR pg_catalog.jsonb_typeof(item.value->'expectedVersion')<>'number'
      OR (item.value->>'expectedVersion')::numeric<>pg_catalog.trunc((item.value->>'expectedVersion')::numeric)
      OR (item.value->>'expectedVersion')::numeric NOT BETWEEN 1 AND 9007199254740991
      OR pg_catalog.jsonb_typeof(item.value->'position')<>'number'
      OR (item.value->>'position')::numeric<>pg_catalog.trunc((item.value->>'position')::numeric)
      OR (item.value->>'position')::numeric NOT BETWEEN 0 AND 9999
  ) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  IF (SELECT pg_catalog.count(DISTINCT item.value->>'id')
      FROM pg_catalog.jsonb_array_elements(p_items) AS item(value))<>item_count
    OR (SELECT pg_catalog.count(DISTINCT (item.value->>'position')::integer)
        FROM pg_catalog.jsonb_array_elements(p_items) AS item(value))<>item_count
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  authority_error:=saas.merchant_admin_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,'payment_setting',true
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.method.operation:'||p_operation_id::text,0
  ));
  SELECT * INTO operation FROM saas.payment_method_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint
      OR operation.operation_kind<>'reorder'
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',saas.payment_method_replay_payload(operation.result_payload);
    END IF;
    RETURN;
  END IF;

  PERFORM 1 FROM saas.payment_methods
  WHERE store_id=p_store_id ORDER BY id FOR UPDATE;
  SELECT pg_catalog.count(*) INTO live_count
  FROM saas.payment_methods WHERE store_id=p_store_id;
  IF live_count<>item_count OR EXISTS(
    SELECT 1 FROM saas.payment_methods AS method
    WHERE method.store_id=p_store_id
      AND NOT EXISTS(
        SELECT 1 FROM pg_catalog.jsonb_array_elements(p_items) AS item(value)
        WHERE (item.value->>'id')::uuid=method.id
      )
  ) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  IF EXISTS(
    SELECT 1
    FROM saas.payment_methods AS method
    JOIN pg_catalog.jsonb_to_recordset(p_items)
      AS item(id uuid,"expectedVersion" bigint,position integer)
      ON item.id=method.id
    WHERE method.store_id=p_store_id AND method.version<>item."expectedVersion"
  ) THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;

  UPDATE saas.payment_methods AS method SET
    position=item.position,version=method.version+1,updated_at=p_now
  FROM pg_catalog.jsonb_to_recordset(p_items)
    AS item(id uuid,"expectedVersion" bigint,position integer)
  WHERE method.store_id=p_store_id AND method.id=item.id;

  result:=saas.payment_method_reorder_projection(p_store_id,false);
  INSERT INTO saas.payment_method_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at
  ) VALUES(p_operation_id,p_store_id,'reorder',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'reordered',result;
END
$f$;

CREATE FUNCTION saas.payment_method_recover_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; operation saas.payment_method_operations%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_admin_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,'payment_setting',true
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO operation FROM saas.payment_method_operations
  WHERE operation_id=p_operation_id AND store_id=p_store_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb; RETURN; END IF;
  IF operation.payload_fingerprint<>p_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'operation_replayed',saas.payment_method_replay_payload(operation.result_payload);
END
$f$;

WITH latest AS (
  SELECT DISTINCT ON (store_id)
    store_id,config,created_at,updated_at
  FROM saas.merchant_admin_records
  WHERE record_kind='payment_setting' AND status='active'
  ORDER BY store_id,updated_at DESC,id DESC
)
INSERT INTO saas.payment_methods(
  id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
  position,config,version,created_at,updated_at
)
SELECT
  (
    pg_catalog.substr(pg_catalog.md5('celebix:payment-method:cash-on-delivery:'||latest.store_id::text),1,12)
    ||'4'||
    pg_catalog.substr(pg_catalog.md5('celebix:payment-method:cash-on-delivery:'||latest.store_id::text),14,3)
    ||'8'||
    pg_catalog.substr(pg_catalog.md5('celebix:payment-method:cash-on-delivery:'||latest.store_id::text),18)
  )::uuid,
  latest.store_id,'cash_on_delivery',NULL,NULL,'Kapıda ödeme','active',NULL,
  0,'{}'::jsonb,1,latest.created_at,latest.updated_at
FROM latest
WHERE latest.config->'cashOnDelivery'='true'::jsonb;

REVOKE ALL ON FUNCTION
  saas.payment_method_projection(uuid,uuid),
  saas.payment_method_mutation_projection(uuid,uuid,boolean),
  saas.payment_method_reorder_projection(uuid,boolean),
  saas.payment_method_replay_payload(jsonb),
  saas.payment_method_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,uuid,text,text,jsonb),
  saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text),
  saas.payment_method_reorder(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,jsonb),
  saas.payment_method_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.payment_method_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,uuid,text,text,jsonb),
  saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text),
  saas.payment_method_reorder(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,jsonb),
  saas.payment_method_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
TO celebix_saas_app;

COMMIT;
