-- Internal platform binding; legacy merchant provider permissions stay unchanged.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.toshi-central.release284',0));
DO $guard$BEGIN
 IF to_regclass('saas.toshi_credit_wallets')IS NULL OR to_regclass('saas.toshi_central284_predecessors')IS NOT NULL THEN RAISE EXCEPTION 'TOSHI_CENTRAL284_PREDECESSOR_INVALID';END IF;
END $guard$;
CREATE TABLE saas.toshi_central284_predecessors(signature text PRIMARY KEY,definition_sha256 char(64)NOT NULL,owner_name text NOT NULL,acl text,config text[],security_definer boolean NOT NULL,volatility char NOT NULL);
INSERT INTO saas.toshi_central284_predecessors SELECT p.oid::regprocedure::text,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),pg_get_userbyid(p.proowner),p.proacl::text,p.proconfig,p.prosecdef,p.provolatile FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND(p.proname LIKE 'toshi_provider_%'OR p.proname='merchant_action_authority_error');
ALTER TABLE saas.toshi_central284_predecessors ENABLE ROW LEVEL SECURITY;ALTER TABLE saas.toshi_central284_predecessors FORCE ROW LEVEL SECURITY;
CREATE POLICY toshi_central284_owner ON saas.toshi_central284_predecessors TO celebix_saas_owner USING(true)WITH CHECK(true);
REVOKE ALL ON saas.toshi_central284_predecessors FROM PUBLIC;
DO $private$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON saas.toshi_central284_predecessors FROM %I',r.rolname);END LOOP;END $private$;
CREATE FUNCTION saas.toshi_central_envelope_valid284(p jsonb)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE k text;raw text;decoded bytea;BEGIN
 IF p IS NULL OR saas.toshi_provider_envelope_valid(p)IS DISTINCT FROM true THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['iv','tag','ciphertext']LOOP
  raw:=p->>k;decoded:=decode(translate(raw,'-_','+/')||repeat('=',(4-length(raw)%4)%4),'base64');
  IF translate(rtrim(replace(encode(decoded,'base64'),E'\n',''),'='),'+/','-_')<>raw OR octet_length(decoded)NOT BETWEEN 1 AND 16384
   OR(k='iv'AND octet_length(decoded)<>12)OR(k='tag'AND octet_length(decoded)<>16)THEN RETURN false;END IF;
 END LOOP;RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $f$;
CREATE FUNCTION saas.toshi_central_binding_command(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_action text,p_args jsonb)
RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE moment timestamptz:=date_trunc('milliseconds',clock_timestamp());e text;c saas.toshi_provider_configs;op saas.toshi_provider_operations;event saas.toshi_provider_events;selected uuid;config uuid;fp text;payload jsonb;expected bigint;credential bigint;kind text;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now)OR abs(extract(epoch FROM(moment-p_now)))>60 OR p_action IS NULL OR p_action NOT IN('identity','authority','connect','recover')OR p_args IS NULL OR jsonb_typeof(p_args)<>'object'OR octet_length(p_args::text)>32768 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'catalog','catalog_admin.manage');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_action IN('identity','authority')THEN
  IF p_args<>'{}'::jsonb THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  SELECT *INTO c FROM saas.toshi_provider_configs WHERE store_id=p_store AND provider='deepseek'AND status='active';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF p_action='identity'THEN RETURN QUERY SELECT 'found',jsonb_build_object('configId',c.id,'credentialVersion',c.credential_version,'version',c.version);
  ELSE RETURN QUERY SELECT 'found',jsonb_build_object('configId',c.id,'provider',c.provider,'selectedModel',c.selected_model,'sealedCredentials',c.sealed_credentials,'credentialVersion',c.credential_version,'version',c.version);END IF;RETURN;
 END IF;
 IF saas.catalog_onboarding_json_exact(p_args,CASE WHEN p_action='recover'THEN ARRAY['operationId','fingerprint']ELSE ARRAY['operationId','fingerprint','configId','provider','sealedCredentials','credentialDigest','credentialVersion','maskedKey','selectedModel','availableModels','expectedVersion']END,ARRAY[]::text[])IS DISTINCT FROM true
  OR saas.store_engagement_uuid_valid(p_args->'operationId')IS DISTINCT FROM true OR jsonb_typeof(p_args->'fingerprint')<>'string'OR p_args->>'fingerprint'!~'^[a-f0-9]{64}$'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected:=(p_args->>'operationId')::uuid;fp:=p_args->>'fingerprint';
 IF p_action='connect'THEN
  IF saas.store_engagement_uuid_valid(p_args->'configId')IS DISTINCT FROM true OR p_args->'provider'IS DISTINCT FROM '"deepseek"'::jsonb OR p_args->'selectedModel'IS DISTINCT FROM '"deepseek-flash"'::jsonb OR p_args->'maskedKey'IS DISTINCT FROM '"••••oshi"'::jsonb OR p_args->'availableModels'IS DISTINCT FROM '[{"id":"deepseek-flash","label":"Toshi"}]'::jsonb
   OR saas.toshi_central_envelope_valid284(p_args->'sealedCredentials')IS DISTINCT FROM true OR jsonb_typeof(p_args->'credentialDigest')<>'string'OR p_args->>'credentialDigest'!~'^sha256:[a-f0-9]{64}$'
   OR jsonb_typeof(p_args->'credentialVersion')<>'number'OR p_args->>'credentialVersion'!~'^[1-9][0-9]{0,15}$'OR(p_args->>'credentialVersion')::numeric>9007199254740991
   OR jsonb_typeof(p_args->'expectedVersion')<>'number'OR p_args->>'expectedVersion'!~'^(0|[1-9][0-9]{0,15})$'OR(p_args->>'expectedVersion')::numeric>9007199254740990 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  config:=(p_args->>'configId')::uuid;expected:=(p_args->>'expectedVersion')::bigint;credential:=(p_args->>'credentialVersion')::bigint;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.toshi-central.operation284:'||selected,0));
 IF p_action='connect'THEN PERFORM 1 FROM saas.stores WHERE id=p_store FOR UPDATE;END IF;
 SELECT *INTO op FROM saas.toshi_provider_operations WHERE operation_id=selected;
 IF FOUND THEN
  SELECT *INTO event FROM saas.toshi_provider_events WHERE id=selected;
  IF op.store_id<>p_store OR op.operation_kind<>'connect'OR op.payload_fingerprint<>fp OR event.store_id IS DISTINCT FROM p_store OR event.summary->'centralBinding'IS DISTINCT FROM 'true'::jsonb OR event.summary->>'principalId'IS DISTINCT FROM p_principal::text OR event.summary->>'membershipId'IS DISTINCT FROM p_member::text
   THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload;END IF;RETURN;
 END IF;
 IF p_action='recover'THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;RETURN;END IF;
 SELECT *INTO c FROM saas.toshi_provider_configs WHERE store_id=p_store AND provider='deepseek'AND status='active'FOR UPDATE;
 IF FOUND THEN
  IF c.id<>config OR c.version<>expected OR credential<>c.credential_version+1 THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  UPDATE saas.toshi_provider_configs SET sealed_credentials=p_args->'sealedCredentials',credential_digest=p_args->>'credentialDigest',credential_version=credential,masked_key='••••oshi',selected_model='deepseek-flash',available_models='[{"id":"deepseek-flash","label":"Toshi"}]',verified_at=moment,updated_at=moment,version=version+1 WHERE id=c.id;kind:='rotated';
 ELSE
  IF expected<>0 OR credential<>1 OR EXISTS(SELECT 1 FROM saas.toshi_provider_configs WHERE id=config)THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.toshi_provider_configs(id,store_id,provider,sealed_credentials,credential_digest,credential_version,masked_key,selected_model,available_models,status,is_default,version,verified_at,revoked_at,created_at,updated_at)
  VALUES(config,p_store,'deepseek',p_args->'sealedCredentials',p_args->>'credentialDigest',credential,'••••oshi','deepseek-flash','[{"id":"deepseek-flash","label":"Toshi"}]','active',false,1,moment,NULL,moment,moment);kind:='connected';
 END IF;
 payload:=saas.toshi_provider_public_payload(p_store,config);
 INSERT INTO saas.toshi_provider_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,created_at)VALUES(selected,p_store,'connect',fp,payload,moment);
 INSERT INTO saas.toshi_provider_events(id,store_id,config_id,provider,event_kind,summary,occurred_at)VALUES(selected,p_store,config,'deepseek',kind,jsonb_build_object('centralBinding',true,'principalId',p_principal,'membershipId',p_member,'connection',payload),moment);
 RETURN QUERY SELECT 'connected',payload;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR foreign_key_violation OR not_null_violation THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
 WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
END $f$;
REVOKE ALL ON FUNCTION saas.toshi_central_envelope_valid284(jsonb),saas.toshi_central_binding_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.toshi_central_envelope_valid284(jsonb),saas.toshi_central_binding_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)FROM %I',r.rolname);END LOOP;END $acl$;
GRANT EXECUTE ON FUNCTION saas.toshi_central_binding_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)TO celebix_saas_app;
COMMIT;
