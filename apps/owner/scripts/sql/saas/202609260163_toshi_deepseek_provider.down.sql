BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Extend the existing encrypted BYOK vault; keep all authorization, versioning,
-- immutable replay/audit data, function owners and EXECUTE grants unchanged.
-- PostgreSQL regex repetition limits are below the intended encrypted payload
-- size; enforce the same ciphertext bound with length plus an ASCII allowlist.
LOCK TABLE saas.toshi_provider_configs, saas.toshi_provider_events, saas.toshi_provider_operations IN ACCESS EXCLUSIVE MODE;

DO $toshi_deepseek_down$
DECLARE
  target record;
  definition text;
  needle text;
  replacement text;
BEGIN
  IF pg_catalog.to_regprocedure('saas.toshi_provider_list_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NULL
     OR pg_catalog.md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('saas.toshi_provider_list_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)'))) IS DISTINCT FROM 'fdf1ff1289eecdc85247b875c814abf8' THEN
    RAISE EXCEPTION 'TOSHI_DEEPSEEK_ROLLBACK_V2_DRIFT';
  END IF;
  -- Even revoked connections remain durable history. Never delete credentials
  -- or ledger records merely to make a schema rollback possible.
  IF EXISTS(SELECT 1 FROM saas.toshi_provider_configs WHERE provider = 'deepseek')
     OR EXISTS(SELECT 1 FROM saas.toshi_provider_events WHERE provider = 'deepseek')
     OR EXISTS(SELECT 1 FROM saas.toshi_provider_operations WHERE result_payload->>'provider' = 'deepseek') THEN
    RAISE EXCEPTION 'TOSHI_DEEPSEEK_ROLLBACK_DATA_PRESENT';
  END IF;
  IF (SELECT pg_catalog.pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = 'saas.toshi_provider_configs'::regclass
        AND c.conname = 'toshi_provider_configs_provider_check' AND c.contype = 'c' AND c.convalidated)
      IS DISTINCT FROM 'CHECK ((provider = ANY (ARRAY[''openai''::text, ''gemini''::text, ''anthropic''::text, ''deepseek''::text])))' THEN
    RAISE EXCEPTION 'TOSHI_DEEPSEEK_CONSTRAINT_DRIFT';
  END IF;
  IF (SELECT pg_catalog.pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = 'saas.toshi_provider_events'::regclass
        AND c.conname = 'toshi_provider_events_provider_check' AND c.contype = 'c' AND c.convalidated)
      IS DISTINCT FROM 'CHECK ((provider = ANY (ARRAY[''openai''::text, ''gemini''::text, ''anthropic''::text, ''deepseek''::text])))' THEN
    RAISE EXCEPTION 'TOSHI_DEEPSEEK_CONSTRAINT_DRIFT';
  END IF;

  FOR target IN SELECT * FROM (VALUES
    ('saas.toshi_provider_connect(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb,text,bigint,text,text,jsonb,bigint)','397c2aca523d26e40565c14f98110998','''openai'',''gemini'',''anthropic'',''deepseek''','''openai'',''gemini'',''anthropic'''),
    ('saas.toshi_provider_connection_identity(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)','76b1c8628ec0e0d7519388232a59e45c','''openai'',''gemini'',''anthropic'',''deepseek''','''openai'',''gemini'',''anthropic'''),
    ('saas.toshi_provider_get_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)','2e0da51701b287335005c6e878a2fdc1','''openai'',''gemini'',''anthropic'',''deepseek''','''openai'',''gemini'',''anthropic'''),
    ('saas.toshi_provider_public_payload(uuid,uuid)','ac1382de16018caa784562ac29fb63d0','WHEN ''gemini'' THEN ''Google Gemini'' WHEN ''deepseek'' THEN ''DeepSeek'' ELSE ''Anthropic Claude'' END','WHEN ''gemini'' THEN ''Google Gemini'' ELSE ''Anthropic Claude'' END'),
    ('saas.toshi_provider_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,bigint)','48ed1c6631e905caf9b91be839e1844f','''openai'',''gemini'',''anthropic'',''deepseek''','''openai'',''gemini'',''anthropic'''),
    ('saas.toshi_provider_select_model(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,text,bigint)','e3528486e8ab8327a39c7fa42018e73c','''openai'',''gemini'',''anthropic'',''deepseek''','''openai'',''gemini'',''anthropic'''),
    ('saas.toshi_provider_set_default(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,bigint)','d7b947dbd982fec8d1a0191d51d36d5a','''openai'',''gemini'',''anthropic'',''deepseek''','''openai'',''gemini'',''anthropic''')
,
    ('saas.toshi_provider_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)','cf4058b13e0cc519d7f26f71fd23b5ed','WHERE c.store_id=p_store_id AND c.status=''active'' AND c.provider <> ''deepseek''','WHERE c.store_id=p_store_id AND c.status=''active''')
,
    ('saas.toshi_provider_envelope_valid(jsonb)','8852e2efd92c19c3636a3e049661b39c','p_value->>''ciphertext'' ~ ''^[A-Za-z0-9_-]+$'' AND pg_catalog.length(p_value->>''ciphertext'') BETWEEN 2 AND 21846','p_value->>''ciphertext'' ~ ''^[A-Za-z0-9_-]{2,21846}$''')
  ) AS definitions(signature, expected_md5, old_fragment, new_fragment) LOOP
    IF pg_catalog.to_regprocedure(target.signature) IS NULL THEN
      RAISE EXCEPTION 'TOSHI_DEEPSEEK_FUNCTION_MISSING: %', target.signature;
    END IF;
    definition := pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(target.signature));
    IF pg_catalog.md5(definition) <> target.expected_md5 THEN
      RAISE EXCEPTION 'TOSHI_DEEPSEEK_ROLLBACK_DRIFT: %', target.signature;
    END IF;
    needle := target.old_fragment;
    replacement := target.new_fragment;
    IF (pg_catalog.length(definition) - pg_catalog.length(pg_catalog.replace(definition, needle, ''))) / pg_catalog.length(needle) <> 1 THEN
      RAISE EXCEPTION 'TOSHI_DEEPSEEK_REPLACEMENT_COUNT_INVALID: %', target.signature;
    END IF;
    EXECUTE pg_catalog.replace(definition, needle, replacement);
  END LOOP;
END
$toshi_deepseek_down$;

ALTER TABLE saas.toshi_provider_configs DROP CONSTRAINT toshi_provider_configs_provider_check;
ALTER TABLE saas.toshi_provider_configs ADD CONSTRAINT toshi_provider_configs_provider_check
  CHECK (provider IN ('openai','gemini','anthropic'));
ALTER TABLE saas.toshi_provider_events DROP CONSTRAINT toshi_provider_events_provider_check;
ALTER TABLE saas.toshi_provider_events ADD CONSTRAINT toshi_provider_events_provider_check
  CHECK (provider IN ('openai','gemini','anthropic'));

DROP FUNCTION saas.toshi_provider_list_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone);

COMMIT;
