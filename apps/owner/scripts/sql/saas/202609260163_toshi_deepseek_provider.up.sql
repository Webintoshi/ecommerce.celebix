BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Extend the existing encrypted BYOK vault; keep all authorization, versioning,
-- immutable replay/audit data, function owners and EXECUTE grants unchanged.
-- PostgreSQL regex repetition limits are below the intended encrypted payload
-- size; enforce the same ciphertext bound with length plus an ASCII allowlist.
LOCK TABLE saas.toshi_provider_configs, saas.toshi_provider_events IN ACCESS EXCLUSIVE MODE;

DO $toshi_deepseek_up$
DECLARE
  target record;
  definition text;
  needle text;
  replacement text;
BEGIN
  IF pg_catalog.to_regprocedure('saas.toshi_provider_list_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NOT NULL THEN
    RAISE EXCEPTION 'TOSHI_DEEPSEEK_V2_ALREADY_EXISTS';
  END IF;
  IF (SELECT pg_catalog.pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = 'saas.toshi_provider_configs'::regclass
        AND c.conname = 'toshi_provider_configs_provider_check' AND c.contype = 'c' AND c.convalidated)
      IS DISTINCT FROM 'CHECK ((provider = ANY (ARRAY[''openai''::text, ''gemini''::text, ''anthropic''::text])))' THEN
    RAISE EXCEPTION 'TOSHI_DEEPSEEK_CONSTRAINT_DRIFT';
  END IF;
  IF (SELECT pg_catalog.pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = 'saas.toshi_provider_events'::regclass
        AND c.conname = 'toshi_provider_events_provider_check' AND c.contype = 'c' AND c.convalidated)
      IS DISTINCT FROM 'CHECK ((provider = ANY (ARRAY[''openai''::text, ''gemini''::text, ''anthropic''::text])))' THEN
    RAISE EXCEPTION 'TOSHI_DEEPSEEK_CONSTRAINT_DRIFT';
  END IF;

  FOR target IN SELECT * FROM (VALUES
    ('saas.toshi_provider_connect(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb,text,bigint,text,text,jsonb,bigint)','bcd7332aaa93c94097a0fc254aa9d445','''openai'',''gemini'',''anthropic''','''openai'',''gemini'',''anthropic'',''deepseek'''),
    ('saas.toshi_provider_connection_identity(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)','a39402e23c1a14c5ffa6b813afcee11b','''openai'',''gemini'',''anthropic''','''openai'',''gemini'',''anthropic'',''deepseek'''),
    ('saas.toshi_provider_get_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)','bc7b1e9bb34e3f99168533e48270fa90','''openai'',''gemini'',''anthropic''','''openai'',''gemini'',''anthropic'',''deepseek'''),
    ('saas.toshi_provider_public_payload(uuid,uuid)','0e07a827b09770d180ec0bee1b2e1909','WHEN ''gemini'' THEN ''Google Gemini'' ELSE ''Anthropic Claude'' END','WHEN ''gemini'' THEN ''Google Gemini'' WHEN ''deepseek'' THEN ''DeepSeek'' ELSE ''Anthropic Claude'' END'),
    ('saas.toshi_provider_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,bigint)','d189304c3fc075401797b5b99bcccb03','''openai'',''gemini'',''anthropic''','''openai'',''gemini'',''anthropic'',''deepseek'''),
    ('saas.toshi_provider_select_model(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,text,bigint)','399e62766de8b192ed595e5e295b444a','''openai'',''gemini'',''anthropic''','''openai'',''gemini'',''anthropic'',''deepseek'''),
    ('saas.toshi_provider_set_default(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,bigint)','7c8bee8dabe64c54f316edb03181c912','''openai'',''gemini'',''anthropic''','''openai'',''gemini'',''anthropic'',''deepseek''')
,
    ('saas.toshi_provider_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)','26f95c24feabbf33cde18129ecaa41de','WHERE c.store_id=p_store_id AND c.status=''active''','WHERE c.store_id=p_store_id AND c.status=''active'' AND c.provider <> ''deepseek''')
,
    ('saas.toshi_provider_envelope_valid(jsonb)','ecf77335bc58c62bac75372a97ceec20','p_value->>''ciphertext'' ~ ''^[A-Za-z0-9_-]{2,21846}$''','p_value->>''ciphertext'' ~ ''^[A-Za-z0-9_-]+$'' AND pg_catalog.length(p_value->>''ciphertext'') BETWEEN 2 AND 21846')
  ) AS definitions(signature, expected_md5, old_fragment, new_fragment) LOOP
    IF pg_catalog.to_regprocedure(target.signature) IS NULL THEN
      RAISE EXCEPTION 'TOSHI_DEEPSEEK_FUNCTION_MISSING: %', target.signature;
    END IF;
    definition := pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(target.signature));
    IF pg_catalog.md5(definition) <> target.expected_md5 THEN
      RAISE EXCEPTION 'TOSHI_DEEPSEEK_PREDECESSOR_DRIFT: %', target.signature;
    END IF;
    needle := target.old_fragment;
    replacement := target.new_fragment;
    IF (pg_catalog.length(definition) - pg_catalog.length(pg_catalog.replace(definition, needle, ''))) / pg_catalog.length(needle) <> 1 THEN
      RAISE EXCEPTION 'TOSHI_DEEPSEEK_REPLACEMENT_COUNT_INVALID: %', target.signature;
    END IF;
    EXECUTE pg_catalog.replace(definition, needle, replacement);
  END LOOP;
END
$toshi_deepseek_up$;

ALTER TABLE saas.toshi_provider_configs DROP CONSTRAINT toshi_provider_configs_provider_check;
ALTER TABLE saas.toshi_provider_configs ADD CONSTRAINT toshi_provider_configs_provider_check
  CHECK (provider IN ('openai','gemini','anthropic','deepseek'));
ALTER TABLE saas.toshi_provider_events DROP CONSTRAINT toshi_provider_events_provider_check;
ALTER TABLE saas.toshi_provider_events ADD CONSTRAINT toshi_provider_events_provider_check
  CHECK (provider IN ('openai','gemini','anthropic','deepseek'));

-- Versioned reader sees all four families; the legacy reader stays compatible
-- with deployed clients whose public contract accepts only three providers.
CREATE FUNCTION saas.toshi_provider_list_v2(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
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
$function$;

ALTER FUNCTION saas.toshi_provider_list_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.toshi_provider_list_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.toshi_provider_list_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) TO celebix_saas_app;

COMMIT;
