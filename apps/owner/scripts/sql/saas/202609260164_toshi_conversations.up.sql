BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $precondition$
BEGIN
 IF pg_catalog.to_regprocedure('saas.toshi_provider_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)') IS NULL
 OR pg_catalog.to_regprocedure('saas.toshi_provider_list_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NULL THEN
  RAISE EXCEPTION 'TOSHI_CONVERSATIONS_PRECONDITION_FAILED';
 END IF;
END $precondition$;

CREATE FUNCTION saas.toshi_conversation_sources_valid(p_sources jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas
AS $sources$
DECLARE entry jsonb; key_count integer; seen text[]:=ARRAY[]::text[]; href text;
BEGIN
 IF jsonb_typeof(p_sources)<>'array' OR jsonb_array_length(p_sources)>12 OR pg_column_size(p_sources)>16384 THEN RETURN false; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
  IF jsonb_typeof(entry)<>'object' THEN RETURN false; END IF;
  SELECT count(*) INTO key_count FROM jsonb_object_keys(entry);
  href:=entry->>'href';
  IF key_count<>2 OR NOT(entry ?& ARRAY['label','href']) OR jsonb_typeof(entry->'label')<>'string' OR jsonb_typeof(entry->'href')<>'string'
   OR char_length(entry->>'label') NOT BETWEEN 1 AND 120 OR entry->>'label'<>btrim(entry->>'label') OR entry->>'label' ~ '[[:cntrl:]]'
   OR char_length(href)>240 OR (href<>'/' AND href !~ '^/(products|orders|customers|analytics|settings|marketing|discounts|promotions|content|seo|inventory|pricing|toshi|dashboard)(/[A-Za-z0-9_-]+)*/?$')
   OR href=ANY(seen) THEN RETURN false; END IF;
  seen:=array_append(seen,href);
 END LOOP;
 RETURN true;
END $sources$;

CREATE TABLE saas.toshi_conversations (
 id uuid PRIMARY KEY,
 store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
 principal_id uuid NOT NULL REFERENCES saas.principals(id) ON DELETE RESTRICT,
 provider_config_id uuid NOT NULL REFERENCES saas.toshi_provider_configs(id) ON DELETE RESTRICT,
 provider text NOT NULL CHECK(provider IN ('openai','gemini','anthropic','deepseek')),
 model text NOT NULL CHECK(octet_length(model) BETWEEN 1 AND 640 AND model=btrim(model) AND model !~ '[[:cntrl:]]'),
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 80 AND title=btrim(title) AND title !~ '[[:cntrl:]]'),
 version bigint NOT NULL DEFAULT 0 CHECK(version BETWEEN 0 AND 100),
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL CHECK(updated_at>=created_at)
);
CREATE INDEX toshi_conversations_actor_history_idx ON saas.toshi_conversations(store_id,principal_id,updated_at DESC,id DESC);
CREATE TABLE saas.toshi_generation_operations (
 operation_id uuid PRIMARY KEY,
 store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
 principal_id uuid NOT NULL REFERENCES saas.principals(id) ON DELETE RESTRICT,
 conversation_id uuid NOT NULL REFERENCES saas.toshi_conversations(id) ON DELETE RESTRICT,
 provider_config_id uuid NOT NULL REFERENCES saas.toshi_provider_configs(id) ON DELETE RESTRICT,
 credential_version bigint NOT NULL CHECK(credential_version>=1),
 expected_version bigint NOT NULL CHECK(expected_version BETWEEN 0 AND 99),
 payload_fingerprint text NOT NULL CHECK(payload_fingerprint ~ '^[a-f0-9]{64}$'),
 user_text text NOT NULL CHECK(char_length(user_text) BETWEEN 1 AND 4000 AND octet_length(user_text)<=16000 AND user_text=btrim(user_text) AND user_text !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
 status text NOT NULL CHECK(status IN ('pending','completed','failed')),
 error_code text,
 result_payload jsonb,
 created_at timestamptz NOT NULL, lease_expires_at timestamptz NOT NULL,
 finished_at timestamptz,
 CHECK(lease_expires_at>created_at),
 CHECK((status='pending' AND error_code IS NULL AND result_payload IS NULL AND finished_at IS NULL)
  OR(status='completed' AND error_code IS NULL AND result_payload IS NOT NULL AND finished_at IS NOT NULL)
  OR(status='failed' AND error_code IS NOT NULL AND result_payload IS NULL AND finished_at IS NOT NULL)),
 CHECK(result_payload IS NULL OR (jsonb_typeof(result_payload)='object' AND pg_column_size(result_payload)<=2097152))
);
CREATE INDEX toshi_generation_actor_lease_idx ON saas.toshi_generation_operations(store_id,principal_id,lease_expires_at) WHERE status='pending';
CREATE INDEX toshi_generation_actor_attempts_idx ON saas.toshi_generation_operations(store_id,principal_id,created_at DESC);
CREATE TABLE saas.toshi_messages (
 id uuid PRIMARY KEY,
 conversation_id uuid NOT NULL REFERENCES saas.toshi_conversations(id) ON DELETE RESTRICT,
 operation_id uuid NOT NULL REFERENCES saas.toshi_generation_operations(operation_id) ON DELETE RESTRICT,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 200),
 role text NOT NULL CHECK(role IN ('user','assistant')),
 text text NOT NULL CHECK(char_length(text)>=1 AND text=btrim(text) AND text !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
  AND ((role='user' AND char_length(text)<=4000 AND octet_length(text)<=16000) OR (role='assistant' AND char_length(text)<=12000 AND octet_length(text)<=48000))),
 sources jsonb NOT NULL CHECK(saas.toshi_conversation_sources_valid(sources) AND (role='assistant' OR sources='[]'::jsonb)),
 created_at timestamptz NOT NULL,
 UNIQUE(conversation_id,ordinal), UNIQUE(operation_id,role)
);
CREATE TABLE saas.toshi_generation_events (
 id uuid PRIMARY KEY,
 operation_id uuid NOT NULL REFERENCES saas.toshi_generation_operations(operation_id) ON DELETE RESTRICT,
 store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
 principal_id uuid NOT NULL REFERENCES saas.principals(id) ON DELETE RESTRICT,
 event_kind text NOT NULL CHECK(event_kind IN ('reserved','completed','failed','expired')),
 occurred_at timestamptz NOT NULL
);
CREATE FUNCTION saas.guard_toshi_generation_event_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $immutable$ BEGIN RAISE EXCEPTION 'TOSHI_GENERATION_EVENT_IMMUTABLE'; END $immutable$;
CREATE TRIGGER toshi_generation_events_immutable BEFORE UPDATE OR DELETE ON saas.toshi_generation_events FOR EACH ROW EXECUTE FUNCTION saas.guard_toshi_generation_event_immutability();
ALTER TABLE saas.toshi_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.toshi_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.toshi_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.toshi_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.toshi_generation_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.toshi_generation_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.toshi_generation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.toshi_generation_events FORCE ROW LEVEL SECURITY;

CREATE FUNCTION saas.toshi_conversation_summary(p_id uuid,p_store_id uuid,p_principal_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $summary$
 SELECT jsonb_build_object('id',c.id,'title',c.title,'provider',c.provider,'model',c.model,'version',c.version,
  'createdAt',saas.toshi_provider_timestamp(c.created_at),'updatedAt',saas.toshi_provider_timestamp(c.updated_at))
 FROM saas.toshi_conversations c WHERE c.id=p_id AND c.store_id=p_store_id AND c.principal_id=p_principal_id
$summary$;
CREATE FUNCTION saas.toshi_conversation_public_payload(p_id uuid,p_store_id uuid,p_principal_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $payload$
 SELECT saas.toshi_conversation_summary(p_id,p_store_id,p_principal_id)||jsonb_build_object('messages',coalesce((
  SELECT jsonb_agg(jsonb_build_object('id',m.id,'role',m.role,'text',m.text,'sources',m.sources,'createdAt',saas.toshi_provider_timestamp(m.created_at)) ORDER BY m.ordinal)
  FROM (SELECT x.* FROM saas.toshi_messages x JOIN saas.toshi_conversations c ON c.id=x.conversation_id
   WHERE c.id=p_id AND c.store_id=p_store_id AND c.principal_id=p_principal_id ORDER BY x.ordinal DESC LIMIT 40) m
 ),'[]'::jsonb))
$payload$;

CREATE FUNCTION saas.toshi_conversation_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $list$
DECLARE denied text;
BEGIN
 denied:=saas.toshi_provider_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false);
 IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'listed'::text,jsonb_build_object('conversations',coalesce((SELECT jsonb_agg(saas.toshi_conversation_summary(c.id,p_store_id,p_principal_id) ORDER BY c.updated_at DESC,c.id DESC)
 FROM(SELECT x.id,x.updated_at FROM saas.toshi_conversations x WHERE x.store_id=p_store_id AND x.principal_id=p_principal_id ORDER BY x.updated_at DESC,x.id DESC LIMIT 20)c),'[]'::jsonb));
END $list$;
CREATE FUNCTION saas.toshi_conversation_get(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_conversation_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $get$
DECLARE denied text; payload jsonb;
BEGIN
 denied:=saas.toshi_provider_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false);
 IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb; RETURN; END IF;
 payload:=saas.toshi_conversation_public_payload(p_conversation_id,p_store_id,p_principal_id);
 IF payload IS NULL THEN RETURN QUERY SELECT 'conversation_not_found'::text,NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'found'::text,payload;
END $get$;

CREATE FUNCTION saas.toshi_conversation_begin_turn(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_conversation_id uuid,p_expected_version bigint,p_text text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $begin_turn$
DECLARE denied text; op saas.toshi_generation_operations%ROWTYPE; conv saas.toshi_conversations%ROWTYPE; config saas.toshi_provider_configs%ROWTYPE; attempts integer; stale record;
BEGIN
 denied:=saas.toshi_provider_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false);
 IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb; RETURN; END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_text IS NULL OR char_length(p_text) NOT BETWEEN 1 AND 4000 OR octet_length(p_text)>16000 OR p_text<>btrim(p_text)
  OR p_text ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' OR (p_conversation_id IS NULL AND p_expected_version IS NOT NULL) OR (p_conversation_id IS NOT NULL AND (p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 100)) THEN
  RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('toshi.operation:'||p_operation_id::text,164));
 PERFORM pg_advisory_xact_lock(hashtextextended('toshi.actor:'||p_store_id::text||':'||p_principal_id::text,164));
 SELECT * INTO op FROM saas.toshi_generation_operations o WHERE o.operation_id=p_operation_id FOR UPDATE;
 IF FOUND THEN
  IF op.store_id<>p_store_id OR op.principal_id<>p_principal_id OR op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  IF op.status='completed' THEN RETURN QUERY SELECT 'replayed'::text,op.result_payload; RETURN; END IF;
  IF op.status='failed' THEN RETURN QUERY SELECT op.error_code,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT CASE WHEN op.lease_expires_at>p_now THEN 'turn_busy' ELSE 'operation_failed' END::text,NULL::jsonb; RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM saas.toshi_generation_operations o WHERE o.store_id=p_store_id AND o.principal_id=p_principal_id AND o.status='pending' AND o.lease_expires_at>p_now) THEN RETURN QUERY SELECT 'turn_busy'::text,NULL::jsonb; RETURN; END IF;
 SELECT count(*) INTO attempts FROM saas.toshi_generation_operations o WHERE o.store_id=p_store_id AND o.principal_id=p_principal_id AND o.created_at>p_now-interval '1 minute';
 IF attempts >= 6 THEN RETURN QUERY SELECT 'rate_limited'::text,NULL::jsonb; RETURN; END IF;
 IF p_conversation_id IS NULL THEN
  SELECT * INTO config FROM saas.toshi_provider_configs c WHERE c.store_id=p_store_id AND c.status='active' AND c.is_default FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'credential_invalid'::text,NULL::jsonb; RETURN; END IF;
  conv.id:=gen_random_uuid(); conv.store_id:=p_store_id; conv.principal_id:=p_principal_id; conv.provider_config_id:=config.id; conv.provider:=config.provider; conv.model:=config.selected_model; conv.version:=0;
  conv.title:=btrim(left(regexp_replace(p_text,'[[:cntrl:]]',' ','g'),80)); conv.created_at:=p_now; conv.updated_at:=p_now;
  INSERT INTO saas.toshi_conversations VALUES(conv.id,conv.store_id,conv.principal_id,conv.provider_config_id,conv.provider,conv.model,conv.title,conv.version,conv.created_at,conv.updated_at);
 ELSE
  SELECT * INTO conv FROM saas.toshi_conversations c WHERE c.id=p_conversation_id AND c.store_id=p_store_id AND c.principal_id=p_principal_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'conversation_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF conv.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF conv.version >= 100 THEN RETURN QUERY SELECT 'conversation_limit_reached'::text,NULL::jsonb; RETURN; END IF;
  SELECT * INTO config FROM saas.toshi_provider_configs c WHERE c.id=conv.provider_config_id AND c.store_id=p_store_id AND c.provider=conv.provider FOR SHARE;
  IF NOT FOUND OR config.status<>'active' THEN RETURN QUERY SELECT 'connection_revoked'::text,NULL::jsonb; RETURN; END IF;
  IF NOT saas.toshi_provider_model_available(config.available_models,conv.model) THEN RETURN QUERY SELECT 'model_unavailable'::text,NULL::jsonb; RETURN; END IF;
 END IF;
 FOR stale IN UPDATE saas.toshi_generation_operations o SET status='failed',error_code='provider_timeout',finished_at=p_now
  WHERE o.store_id=p_store_id AND o.principal_id=p_principal_id AND o.status='pending' AND o.lease_expires_at<=p_now RETURNING o.operation_id LOOP
  INSERT INTO saas.toshi_generation_events VALUES(gen_random_uuid(),stale.operation_id,p_store_id,p_principal_id,'expired',p_now);
 END LOOP;
 INSERT INTO saas.toshi_generation_operations(operation_id,store_id,principal_id,conversation_id,provider_config_id,credential_version,expected_version,payload_fingerprint,user_text,status,created_at,lease_expires_at)
 VALUES(p_operation_id,p_store_id,p_principal_id,conv.id,config.id,config.credential_version,conv.version,p_fingerprint,p_text,'pending',p_now,p_now+interval '120 seconds');
 INSERT INTO saas.toshi_generation_events VALUES(gen_random_uuid(),p_operation_id,p_store_id,p_principal_id,'reserved',p_now);
 RETURN QUERY SELECT 'ready'::text,jsonb_build_object('operationId',p_operation_id,'conversation',saas.toshi_conversation_public_payload(conv.id,p_store_id,p_principal_id),'configId',config.id,'credentialVersion',config.credential_version);
END $begin_turn$;

CREATE FUNCTION saas.toshi_conversation_complete_turn(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_text text,p_sources jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $complete_turn$
DECLARE denied text; op saas.toshi_generation_operations%ROWTYPE; conv saas.toshi_conversations%ROWTYPE; config saas.toshi_provider_configs%ROWTYPE; payload jsonb;
BEGIN
 denied:=saas.toshi_provider_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false);
 IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb; RETURN; END IF;
 IF p_operation_id IS NULL OR p_text IS NULL OR char_length(p_text) NOT BETWEEN 1 AND 12000 OR octet_length(p_text)>48000 OR p_text<>btrim(p_text) OR p_text ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' OR NOT coalesce(saas.toshi_conversation_sources_valid(p_sources),false) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('toshi.operation:'||p_operation_id::text,164));
 PERFORM pg_advisory_xact_lock(hashtextextended('toshi.actor:'||p_store_id::text||':'||p_principal_id::text,164));
 SELECT * INTO op FROM saas.toshi_generation_operations o WHERE o.operation_id=p_operation_id AND o.store_id=p_store_id AND o.principal_id=p_principal_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found'::text,NULL::jsonb; RETURN; END IF;
 IF op.status='completed' THEN RETURN QUERY SELECT 'completed'::text,op.result_payload; RETURN; END IF;
 IF op.status='failed' THEN RETURN QUERY SELECT op.error_code,NULL::jsonb; RETURN; END IF;
 IF op.lease_expires_at<=p_now THEN RETURN QUERY SELECT 'operation_failed'::text,NULL::jsonb; RETURN; END IF;
 SELECT * INTO conv FROM saas.toshi_conversations c WHERE c.id=op.conversation_id AND c.store_id=p_store_id AND c.principal_id=p_principal_id FOR UPDATE;
 IF NOT FOUND OR conv.version<>op.expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
 SELECT * INTO config FROM saas.toshi_provider_configs c WHERE c.id=op.provider_config_id AND c.store_id=p_store_id FOR SHARE;
 IF NOT FOUND OR config.status<>'active' THEN RETURN QUERY SELECT 'connection_revoked'::text,NULL::jsonb; RETURN; END IF;
 IF config.credential_version<>op.credential_version OR conv.provider_config_id<>op.provider_config_id OR conv.provider<>config.provider THEN RETURN QUERY SELECT 'credential_invalid'::text,NULL::jsonb; RETURN; END IF;
 IF NOT saas.toshi_provider_model_available(config.available_models,conv.model) THEN RETURN QUERY SELECT 'model_unavailable'::text,NULL::jsonb; RETURN; END IF;
 INSERT INTO saas.toshi_messages VALUES(gen_random_uuid(),conv.id,p_operation_id,(conv.version*2+1)::integer,'user',op.user_text,'[]'::jsonb,p_now);
 INSERT INTO saas.toshi_messages VALUES(gen_random_uuid(),conv.id,p_operation_id,(conv.version*2+2)::integer,'assistant',p_text,p_sources,p_now);
 UPDATE saas.toshi_conversations c SET version=conv.version+1,updated_at=p_now WHERE c.id=conv.id;
 payload:=saas.toshi_conversation_public_payload(conv.id,p_store_id,p_principal_id);
 UPDATE saas.toshi_generation_operations o SET status='completed',result_payload=payload,finished_at=p_now WHERE o.operation_id=p_operation_id;
 INSERT INTO saas.toshi_generation_events VALUES(gen_random_uuid(),p_operation_id,p_store_id,p_principal_id,'completed',p_now);
 RETURN QUERY SELECT 'completed'::text,payload;
END $complete_turn$;

CREATE FUNCTION saas.toshi_conversation_fail_turn(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_code text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $fail_turn$
DECLARE denied text; op saas.toshi_generation_operations%ROWTYPE;
BEGIN
 denied:=saas.toshi_provider_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false);
 IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb; RETURN; END IF;
 IF p_operation_id IS NULL OR p_code IS NULL OR p_code NOT IN ('invalid_input','unauthenticated','membership_denied','store_inactive','feature_not_enabled','durable_authority_invalid','credential_invalid','connection_revoked','model_unavailable','rate_limited','quota_exceeded','provider_timeout','provider_unavailable','version_conflict','turn_busy','conversation_limit_reached','conversation_not_found','operation_mismatch','operation_failed','operation_not_found','cancelled','unavailable') THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('toshi.operation:'||p_operation_id::text,164));
 PERFORM pg_advisory_xact_lock(hashtextextended('toshi.actor:'||p_store_id::text||':'||p_principal_id::text,164));
 SELECT * INTO op FROM saas.toshi_generation_operations o WHERE o.operation_id=p_operation_id AND o.store_id=p_store_id AND o.principal_id=p_principal_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found'::text,NULL::jsonb; RETURN; END IF;
 IF op.status='completed' THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
 IF op.status='failed' THEN RETURN QUERY SELECT 'failed'::text,jsonb_build_object('code',op.error_code); RETURN; END IF;
 UPDATE saas.toshi_generation_operations o SET status='failed',error_code=p_code,finished_at=p_now WHERE o.operation_id=p_operation_id;
 INSERT INTO saas.toshi_generation_events VALUES(gen_random_uuid(),p_operation_id,p_store_id,p_principal_id,'failed',p_now);
 RETURN QUERY SELECT 'failed'::text,jsonb_build_object('code',p_code);
END $fail_turn$;
CREATE FUNCTION saas.toshi_conversation_recover_turn(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_phase text,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $recover_turn$
DECLARE denied text; op saas.toshi_generation_operations%ROWTYPE; payload jsonb;
BEGIN
 denied:=saas.toshi_provider_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false);
 IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb; RETURN; END IF;
 IF p_phase IS NULL OR p_phase NOT IN ('begin','complete','fail') THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
 SELECT * INTO op FROM saas.toshi_generation_operations o WHERE o.operation_id=p_operation_id AND o.store_id=p_store_id AND o.principal_id=p_principal_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found'::text,NULL::jsonb; RETURN; END IF;
 IF p_phase='begin' THEN
  IF p_fingerprint IS NULL OR op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  IF op.status='completed' THEN RETURN QUERY SELECT 'replayed'::text,op.result_payload; RETURN; END IF;
  IF op.status='failed' THEN RETURN QUERY SELECT op.error_code,NULL::jsonb; RETURN; END IF;
  IF op.lease_expires_at<=p_now THEN RETURN QUERY SELECT 'operation_failed'::text,NULL::jsonb; RETURN; END IF;
  payload:=jsonb_build_object('operationId',p_operation_id,'conversation',saas.toshi_conversation_public_payload(op.conversation_id,p_store_id,p_principal_id),'configId',op.provider_config_id,'credentialVersion',op.credential_version);
  RETURN QUERY SELECT 'ready'::text,payload; RETURN;
 END IF;
 IF p_phase='complete' AND op.status='completed' THEN RETURN QUERY SELECT 'completed'::text,op.result_payload; RETURN; END IF;
 IF p_phase='fail' AND op.status='failed' THEN RETURN QUERY SELECT 'failed'::text,jsonb_build_object('code',op.error_code); RETURN; END IF;
 IF op.status='failed' THEN RETURN QUERY SELECT op.error_code,NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'operation_failed'::text,NULL::jsonb;
END $recover_turn$;

REVOKE ALL ON TABLE saas.toshi_conversations,saas.toshi_messages,saas.toshi_generation_operations,saas.toshi_generation_events FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.toshi_conversation_sources_valid(jsonb),saas.guard_toshi_generation_event_immutability(),saas.toshi_conversation_summary(uuid,uuid,uuid),saas.toshi_conversation_public_payload(uuid,uuid,uuid),
 saas.toshi_conversation_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.toshi_conversation_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
 saas.toshi_conversation_begin_turn(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),saas.toshi_conversation_complete_turn(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,jsonb),
 saas.toshi_conversation_fail_turn(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),saas.toshi_conversation_recover_turn(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text)
 FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.toshi_conversation_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.toshi_conversation_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
 saas.toshi_conversation_begin_turn(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),saas.toshi_conversation_complete_turn(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,jsonb),
 saas.toshi_conversation_fail_turn(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),saas.toshi_conversation_recover_turn(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text)
 TO celebix_saas_app;
COMMIT;
