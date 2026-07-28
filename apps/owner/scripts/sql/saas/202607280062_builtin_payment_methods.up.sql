-- Phase 3S: PostgreSQL authority for one exact built-in payment method of each kind per store.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

LOCK TABLE saas.payment_methods IN ACCESS EXCLUSIVE MODE;

DO $f$
BEGIN
  IF EXISTS(
    SELECT method.store_id,method.kind
    FROM saas.payment_methods AS method
    WHERE method.kind IN('cash_on_delivery','bank_transfer')
    GROUP BY method.store_id,method.kind
    HAVING pg_catalog.count(*)>1
  ) THEN
    RAISE EXCEPTION 'BUILT_IN_PAYMENT_METHOD_DUPLICATES_EXIST';
  END IF;
END
$f$;

CREATE FUNCTION saas.built_in_payment_method_config_valid(
  p_kind text,p_config jsonb
)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas
AS $f$
DECLARE
  value text;
  iban text;
  rearranged text;
  current_character text;
  digits text;
  remainder integer:=0;
  character_index integer;
  digit_index integer;
BEGIN
  IF p_config IS NULL OR pg_catalog.jsonb_typeof(p_config)<>'object' THEN
    RETURN false;
  END IF;

  IF p_kind='cash_on_delivery' THEN
    IF (SELECT pg_catalog.array_agg(key ORDER BY key)
        FROM pg_catalog.jsonb_object_keys(p_config) AS keys(key))
        IS DISTINCT FROM ARRAY['instructions']::text[]
      OR pg_catalog.jsonb_typeof(p_config->'instructions')<>'string'
    THEN RETURN false; END IF;
    value:=p_config->>'instructions';
    IF value IS DISTINCT FROM pg_catalog.btrim(
        value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
      )
      OR pg_catalog.octet_length(value) NOT BETWEEN 0 AND 500
      OR EXISTS(
        SELECT 1 FROM pg_catalog.regexp_split_to_table(value,'') AS character(value)
        WHERE pg_catalog.ascii(character.value) BETWEEN 1 AND 31
          OR pg_catalog.ascii(character.value) BETWEEN 127 AND 159
      )
    THEN RETURN false; END IF;
    RETURN true;
  END IF;

  IF p_kind<>'bank_transfer' THEN RETURN false; END IF;
  IF (SELECT pg_catalog.array_agg(key ORDER BY key)
      FROM pg_catalog.jsonb_object_keys(p_config) AS keys(key))
      IS DISTINCT FROM ARRAY['accountHolder','bankName','iban','instructions']::text[]
    OR pg_catalog.jsonb_typeof(p_config->'accountHolder')<>'string'
    OR pg_catalog.jsonb_typeof(p_config->'bankName')<>'string'
    OR pg_catalog.jsonb_typeof(p_config->'iban')<>'string'
    OR pg_catalog.jsonb_typeof(p_config->'instructions')<>'string'
  THEN RETURN false; END IF;

  value:=p_config->>'accountHolder';
  IF value IS DISTINCT FROM pg_catalog.btrim(
      value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    )
    OR pg_catalog.octet_length(value) NOT BETWEEN 2 AND 160
    OR EXISTS(
      SELECT 1 FROM pg_catalog.regexp_split_to_table(value,'') AS character(value)
      WHERE pg_catalog.ascii(character.value) BETWEEN 1 AND 31
        OR pg_catalog.ascii(character.value) BETWEEN 127 AND 159
    )
  THEN RETURN false; END IF;

  value:=p_config->>'bankName';
  IF value IS DISTINCT FROM pg_catalog.btrim(
      value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    )
    OR pg_catalog.octet_length(value) NOT BETWEEN 2 AND 120
    OR EXISTS(
      SELECT 1 FROM pg_catalog.regexp_split_to_table(value,'') AS character(value)
      WHERE pg_catalog.ascii(character.value) BETWEEN 1 AND 31
        OR pg_catalog.ascii(character.value) BETWEEN 127 AND 159
    )
  THEN RETURN false; END IF;

  value:=p_config->>'instructions';
  IF value IS DISTINCT FROM pg_catalog.btrim(
      value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    )
    OR pg_catalog.octet_length(value) NOT BETWEEN 0 AND 500
    OR EXISTS(
      SELECT 1 FROM pg_catalog.regexp_split_to_table(value,'') AS character(value)
      WHERE pg_catalog.ascii(character.value) BETWEEN 1 AND 31
        OR pg_catalog.ascii(character.value) BETWEEN 127 AND 159
    )
  THEN RETURN false; END IF;

  iban:=p_config->>'iban';
  IF iban IS DISTINCT FROM pg_catalog.btrim(iban)
    OR pg_catalog.octet_length(iban)<>26
    OR iban!~'^TR[0-9]{24}$'
  THEN RETURN false; END IF;
  rearranged:=pg_catalog.substring(iban,5)||pg_catalog.substring(iban,1,4);
  FOR character_index IN 1..pg_catalog.char_length(rearranged) LOOP
    current_character:=pg_catalog.substring(rearranged,character_index,1);
    IF current_character BETWEEN 'A' AND 'Z' THEN
      digits:=(pg_catalog.ascii(current_character)-55)::text;
    ELSE
      digits:=current_character;
    END IF;
    FOR digit_index IN 1..pg_catalog.char_length(digits) LOOP
      remainder:=(remainder*10+pg_catalog.substring(digits,digit_index,1)::integer)%97;
    END LOOP;
  END LOOP;
  RETURN remainder=1;
END
$f$;

REVOKE ALL ON FUNCTION saas.built_in_payment_method_config_valid(text,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

DO $f$
BEGIN
  IF EXISTS(
    SELECT 1 FROM saas.payment_methods AS method
    WHERE method.kind IN('cash_on_delivery','bank_transfer')
      AND NOT saas.built_in_payment_method_config_valid(method.kind,method.config)
  ) THEN
    RAISE EXCEPTION 'BUILT_IN_PAYMENT_METHOD_CONFIG_INVALID';
  END IF;
END
$f$;

CREATE UNIQUE INDEX payment_methods_one_builtin_kind_per_store
ON saas.payment_methods(store_id,kind)
WHERE kind IN ('cash_on_delivery','bank_transfer');

ALTER FUNCTION saas.payment_method_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
) RENAME TO payment_method_save_without_builtin_authority;
REVOKE ALL ON FUNCTION saas.payment_method_save_without_builtin_authority(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

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
  authority_error text;
  operation saas.payment_method_operations%ROWTYPE;
  violated_constraint text;
BEGIN
  IF p_kind IN('cash_on_delivery','bank_transfer') THEN
    IF p_operation_id IS NULL OR p_method_id IS NULL OR p_now IS NULL
      OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
      OR p_expected_version IS NULL OR p_expected_version<0
      OR p_label IS NULL OR p_label<>pg_catalog.btrim(p_label)
      OR pg_catalog.char_length(p_label) NOT BETWEEN 1 AND 120 OR p_label~'[[:cntrl:]]'
      OR p_config IS NULL OR NOT saas.merchant_provider_public_config_valid(p_config)
      OR p_profile_id IS NOT NULL OR p_provider_code IS NOT NULL
      OR NOT saas.built_in_payment_method_config_valid(p_kind,p_config)
    THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;

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

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'saas.payment.method.builtin:'||p_store_id::text||':'||p_kind,0
    ));
    IF EXISTS(
      SELECT 1 FROM saas.payment_methods AS method
      WHERE method.store_id=p_store_id AND method.kind=p_kind AND method.id<>p_method_id
    ) THEN
      RETURN QUERY SELECT 'method_already_exists',NULL::jsonb; RETURN;
    END IF;
  END IF;

  BEGIN
    RETURN QUERY SELECT * FROM saas.payment_method_save_without_builtin_authority(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
      p_operation_id,p_fingerprint,p_method_id,p_expected_version,p_kind,p_profile_id,
      p_provider_code,p_label,p_config
    );
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
    IF violated_constraint='payment_methods_one_builtin_kind_per_store' THEN
      RETURN QUERY SELECT 'method_already_exists',NULL::jsonb; RETURN;
    END IF;
    RAISE;
  END;
END
$f$;

REVOKE ALL ON FUNCTION saas.payment_method_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.payment_method_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
) TO celebix_saas_app;

CREATE FUNCTION saas.built_in_payment_methods_preflight()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  owner_oid oid:='celebix_saas_owner'::regrole;
  app_oid oid:='celebix_saas_app'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  validator_oid oid:=pg_catalog.to_regprocedure(
    'saas.built_in_payment_method_config_valid(text,jsonb)'
  );
  public_save_oid oid:=pg_catalog.to_regprocedure(
    'saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)'
  );
  delegate_save_oid oid:=pg_catalog.to_regprocedure(
    'saas.payment_method_save_without_builtin_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)'
  );
  preflight_oid oid:=pg_catalog.to_regprocedure('saas.built_in_payment_methods_preflight()');
  index_oid oid:=pg_catalog.to_regclass('saas.payment_methods_one_builtin_kind_per_store');
  store_attribute smallint;
  kind_attribute smallint;
BEGIN
  IF saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true
  THEN RETURN false; END IF;

  IF EXISTS(
    SELECT method.store_id,method.kind
    FROM saas.payment_methods AS method
    WHERE method.kind IN('cash_on_delivery','bank_transfer')
    GROUP BY method.store_id,method.kind HAVING pg_catalog.count(*)>1
  ) OR EXISTS(
    SELECT 1 FROM saas.payment_methods AS method
    WHERE method.kind IN('cash_on_delivery','bank_transfer')
      AND NOT saas.built_in_payment_method_config_valid(method.kind,method.config)
  ) THEN RETURN false; END IF;

  SELECT attribute.attnum INTO store_attribute FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid='saas.payment_methods'::regclass
    AND attribute.attname='store_id' AND attribute.attnum>0 AND NOT attribute.attisdropped;
  SELECT attribute.attnum INTO kind_attribute FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid='saas.payment_methods'::regclass
    AND attribute.attname='kind' AND attribute.attnum>0 AND NOT attribute.attisdropped;
  IF index_oid IS NULL OR store_attribute IS NULL OR kind_attribute IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_index AS index
    JOIN pg_catalog.pg_class AS relation ON relation.oid=index.indexrelid
    WHERE index.indexrelid=index_oid AND index.indrelid='saas.payment_methods'::regclass
      AND relation.relowner=owner_oid AND index.indisunique AND index.indisvalid AND index.indisready
      AND index.indnkeyatts=2 AND index.indnatts=2
      AND index.indkey[0]=store_attribute AND index.indkey[1]=kind_attribute
      AND pg_catalog.pg_get_expr(index.indpred,index.indrelid)=
        '(kind = ANY (ARRAY[''cash_on_delivery''::text, ''bank_transfer''::text]))'
  ) THEN RETURN false; END IF;

  IF validator_oid IS NULL OR public_save_oid IS NULL OR delegate_save_oid IS NULL
    OR preflight_oid IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=validator_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND NOT procedure.prosecdef AND NOT procedure.proleakproof
        AND NOT procedure.proisstrict AND procedure.proparallel='u' AND procedure.provolatile='i'
        AND procedure.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)='07a1ae2e5acc31dc8ebe92397e823090'
    ) OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=public_save_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef AND NOT procedure.proleakproof
        AND NOT procedure.proisstrict AND procedure.proparallel='u' AND procedure.provolatile='v'
        AND procedure.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)='10463ab9e89b4885aa41844db81c1e8c'
    ) OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=delegate_save_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef AND NOT procedure.proleakproof
        AND NOT procedure.proisstrict AND procedure.proparallel='u' AND procedure.provolatile='v'
        AND procedure.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)='d28dfa0740950aa197950675b4d6737b'
    ) OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=preflight_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef AND NOT procedure.proleakproof
        AND NOT procedure.proisstrict AND procedure.proparallel='u' AND procedure.provolatile='s'
        AND procedure.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
    )
  THEN RETURN false; END IF;

  IF NOT pg_catalog.has_function_privilege(owner_oid,validator_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(app_oid,validator_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,validator_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(owner_oid,delegate_save_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(app_oid,delegate_save_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,delegate_save_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(owner_oid,public_save_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,public_save_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,public_save_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(owner_oid,preflight_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,preflight_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,preflight_oid,'EXECUTE')
  THEN RETURN false; END IF;

  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid IN(validator_oid,delegate_save_oid,public_save_oid,preflight_oid)
      AND (privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
        OR privilege.grantor<>owner_oid OR privilege.grantee NOT IN(
          owner_oid,
          CASE WHEN procedure.oid IN(public_save_oid,preflight_oid) THEN app_oid ELSE owner_oid END,
          CASE WHEN procedure.oid=preflight_oid THEN workflow_oid ELSE owner_oid END
        ))
  ) THEN RETURN false; END IF;

  IF pg_catalog.has_table_privilege(app_oid,'saas.payment_methods','INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege(workflow_oid,'saas.payment_methods','INSERT,UPDATE,DELETE')
  THEN RETURN false; END IF;
  RETURN true;
END
$f$;

REVOKE ALL ON FUNCTION saas.built_in_payment_methods_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.built_in_payment_methods_preflight()
TO celebix_saas_app,celebix_saas_workflow;

COMMIT;
