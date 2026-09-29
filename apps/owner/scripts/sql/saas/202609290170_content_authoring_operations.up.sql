BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE saas.content_authoring_settings (
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id) ON DELETE RESTRICT,
 daily_limit integer NOT NULL DEFAULT 100 CHECK(daily_limit BETWEEN 1 AND 10000),
 updated_at timestamptz NOT NULL
);
CREATE TABLE saas.content_authoring_operations (
 id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
 principal_id uuid NOT NULL REFERENCES saas.principals(id) ON DELETE RESTRICT,
 draft_id uuid NOT NULL, product_id uuid, request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 source_fingerprint text NOT NULL CHECK(source_fingerprint ~ '^[a-f0-9]{64}$'),
 config_id uuid NOT NULL REFERENCES saas.toshi_provider_configs(id) ON DELETE RESTRICT,
 provider text NOT NULL, model text NOT NULL, credential_version bigint NOT NULL CHECK(credential_version>0),prompt_version text NOT NULL,
 status text NOT NULL CHECK(status IN('pending','completed','failed','unknown')), version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 dispatch_state text NOT NULL DEFAULT 'not_dispatched' CHECK(dispatch_state IN('not_dispatched','dispatched','unknown')),
 claim_token uuid,lease_expires_at timestamptz,usage jsonb, draft jsonb,safe_code text,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,finished_at timestamptz,
 FOREIGN KEY(product_id,store_id) REFERENCES saas.products(id,store_id) ON DELETE RESTRICT,
 CHECK((status='pending')=(finished_at IS NULL)),CHECK((status='completed')=(draft IS NOT NULL)),
 CHECK((dispatch_state='not_dispatched')=(claim_token IS NULL)),UNIQUE(id,store_id)
);
CREATE UNIQUE INDEX content_authoring_one_active ON saas.content_authoring_operations(store_id,principal_id) WHERE status='pending';
CREATE INDEX content_authoring_daily ON saas.content_authoring_operations(store_id,created_at);
CREATE INDEX content_authoring_actor_rate ON saas.content_authoring_operations(store_id,principal_id,created_at);
CREATE TABLE saas.content_authoring_origin_history (
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
 product_id uuid NOT NULL,draft_id uuid NOT NULL,field text NOT NULL CHECK(field IN('description','seoTitle','seoDescription')),
 origin text NOT NULL CHECK(origin IN('manual','ai','edited_ai')),generation_id uuid,
 source_fingerprint text,content_digest text NOT NULL CHECK(content_digest ~ '^sha256:[a-f0-9]{64}$'),
 product_version bigint NOT NULL CHECK(product_version>0),principal_id uuid NOT NULL REFERENCES saas.principals(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL,
 FOREIGN KEY(product_id,store_id) REFERENCES saas.products(id,store_id) ON DELETE RESTRICT,
 FOREIGN KEY(generation_id,store_id) REFERENCES saas.content_authoring_operations(id,store_id) ON DELETE RESTRICT,
 CHECK((origin='manual')=(generation_id IS NULL)),CHECK((origin='manual')=(source_fingerprint IS NULL)), UNIQUE(store_id,product_id,product_version,field)
);
-- Future catalog save functions must append one entry per field inside their save transaction.
CREATE FUNCTION saas.content_authoring_origin_binding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $f$ BEGIN
 IF NEW.generation_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.origin:'||NEW.generation_id::text,170));END IF;
 IF NEW.generation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.content_authoring_operations o WHERE o.id=NEW.generation_id AND o.store_id=NEW.store_id AND o.principal_id=NEW.principal_id AND o.draft_id=NEW.draft_id AND (o.product_id IS NULL OR o.product_id=NEW.product_id) AND o.status='completed' AND o.source_fingerprint=NEW.source_fingerprint AND o.draft ? NEW.field) THEN RAISE EXCEPTION 'CONTENT_AUTHORING_ORIGIN_BINDING_INVALID';END IF;
 IF NEW.generation_id IS NOT NULL AND EXISTS(SELECT 1 FROM saas.content_authoring_origin_history h WHERE h.generation_id=NEW.generation_id AND h.product_id<>NEW.product_id) THEN RAISE EXCEPTION 'CONTENT_AUTHORING_GENERATION_ALREADY_BOUND';END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER content_authoring_origin_binding BEFORE INSERT ON saas.content_authoring_origin_history FOR EACH ROW EXECUTE FUNCTION saas.content_authoring_origin_binding_guard();
CREATE FUNCTION saas.content_authoring_origin_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $f$ BEGIN RAISE EXCEPTION 'CONTENT_AUTHORING_ORIGIN_IMMUTABLE'; END $f$;
CREATE TRIGGER content_authoring_origin_immutable BEFORE UPDATE OR DELETE ON saas.content_authoring_origin_history FOR EACH ROW EXECUTE FUNCTION saas.content_authoring_origin_immutable();
ALTER TABLE saas.content_authoring_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.content_authoring_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.content_authoring_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.content_authoring_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.content_authoring_origin_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.content_authoring_origin_history FORCE ROW LEVEL SECURITY;
CREATE FUNCTION saas.content_authoring_payload(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $f$ SELECT jsonb_build_object('id',o.id,'draftId',o.draft_id,'productId',o.product_id,'status',o.status,
 'requestFingerprint',o.request_fingerprint,'sourceFingerprint',o.source_fingerprint,'configId',o.config_id,
 'provider',o.provider,'model',o.model,'credentialVersion',o.credential_version,'promptVersion',o.prompt_version,'version',o.version,
 'dispatchState',o.dispatch_state,'claimToken',o.claim_token,'leaseExpiresAt',saas.toshi_provider_timestamp(o.lease_expires_at),
 'usage',o.usage,'draft',o.draft,'safeCode',o.safe_code,'createdAt',saas.toshi_provider_timestamp(o.created_at),
 'updatedAt',saas.toshi_provider_timestamp(o.updated_at),'finishedAt',saas.toshi_provider_timestamp(o.finished_at)) FROM saas.content_authoring_operations o WHERE o.id=p_id $f$;
-- These private helpers validate structure only. Fact grounding remains a service responsibility.
CREATE FUNCTION saas.content_authoring_object_valid(p_value jsonb,p_required text[],p_optional text[])
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF p_value IS NULL OR jsonb_typeof(p_value)<>'object' THEN RETURN false; END IF;
 RETURN p_value ?& p_required AND NOT EXISTS(
  SELECT 1 FROM jsonb_object_keys(p_value) k WHERE NOT(k=ANY(p_required||p_optional))
 );
END $f$;
CREATE FUNCTION saas.content_authoring_utf16_length(p_value text)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT char_length(p_value)+char_length(regexp_replace(p_value,U&'[^\+010000-\+10FFFF]','','g'))
$f$;
CREATE FUNCTION saas.content_authoring_text_valid(p_value jsonb,p_min integer,p_max integer)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE s text;
BEGIN
 IF p_value IS NULL OR jsonb_typeof(p_value)<>'string' THEN RETURN false; END IF;
 s:=p_value#>>'{}';
 RETURN saas.content_authoring_utf16_length(s) BETWEEN p_min AND p_max
  AND s !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]';
END $f$;
-- Return a node count, or -1 for invalid nodes. Callers accumulate a global 1000-node bound.
CREATE FUNCTION saas.content_authoring_nodes_count(p_value jsonb)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE n jsonb; total integer:=0;
BEGIN
 IF p_value IS NULL OR jsonb_typeof(p_value)<>'array' THEN RETURN -1; END IF;
 IF jsonb_array_length(p_value)>100 THEN RETURN -1; END IF;
 FOR n IN SELECT value FROM jsonb_array_elements(p_value) LOOP
  IF n->>'type'='text' THEN
   IF NOT saas.content_authoring_object_valid(n,ARRAY['type','text'],ARRAY[]::text[])
    OR NOT saas.content_authoring_text_valid(n->'text',1,10000) THEN RETURN -1; END IF;
  ELSIF n->>'type'='fact' THEN
   IF NOT saas.content_authoring_object_valid(n,ARRAY['type','factRef','value'],ARRAY['unit'])
    OR NOT saas.content_authoring_text_valid(n->'factRef',1,200)
    OR NOT saas.content_authoring_text_valid(n->'value',1,1000)
    OR (n ? 'unit' AND NOT saas.content_authoring_text_valid(n->'unit',1,20)) THEN RETURN -1; END IF;
  ELSE RETURN -1;
  END IF;
  total:=total+1;
 END LOOP;
 RETURN total;
END $f$;
CREATE FUNCTION saas.content_authoring_draft_valid(p_value jsonb,p_source text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE item jsonb; block jsonb; row_value jsonb; cell jsonb; key text; count_nodes integer; total_nodes integer:=0; compact text;
BEGIN
 IF NOT saas.content_authoring_object_valid(p_value,ARRAY['suggestions','claims','sourceFingerprint'],ARRAY['description','seoTitle','seoDescription']) THEN RETURN false; END IF;
 IF NOT (p_value ?| ARRAY['description','seoTitle','seoDescription'])
  OR NOT saas.content_authoring_text_valid(p_value->'sourceFingerprint',64,64)
  OR p_value->>'sourceFingerprint' !~ '^[a-f0-9]{64}$'
  OR p_value->>'sourceFingerprint' IS DISTINCT FROM p_source THEN RETURN false; END IF;
 IF jsonb_typeof(p_value->'suggestions')<>'array' OR jsonb_typeof(p_value->'claims')<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_value->'suggestions')>5 OR jsonb_array_length(p_value->'claims')>100 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_value->'suggestions') LOOP
  IF NOT saas.content_authoring_text_valid(item,1,300) THEN RETURN false; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(p_value->'claims') LOOP
  IF NOT saas.content_authoring_object_valid(item,ARRAY['field','factRef','value'],ARRAY['unit'])
   OR NOT saas.content_authoring_text_valid(item->'field',1,20)
   OR item->>'field' NOT IN('description','seoTitle','seoDescription')
   OR NOT(p_value ? (item->>'field'))
   OR NOT saas.content_authoring_text_valid(item->'factRef',1,200)
   OR NOT saas.content_authoring_text_valid(item->'value',1,1000)
   OR (item ? 'unit' AND NOT saas.content_authoring_text_valid(item->'unit',1,20)) THEN RETURN false; END IF;
 END LOOP;
 FOREACH key IN ARRAY ARRAY['seoTitle','seoDescription'] LOOP
  IF p_value ? key THEN
   IF NOT saas.content_authoring_text_valid(p_value->key,1,CASE WHEN key='seoTitle' THEN 200 ELSE 500 END)
    OR p_value->>key ~ '[<>\r\n]' THEN RETURN false; END IF;
  END IF;
 END LOOP;
 IF p_value ? 'description' THEN
  IF jsonb_typeof(p_value->'description')<>'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p_value->'description')>100 THEN RETURN false; END IF;
  -- Remove JSON layout whitespace while preserving whitespace inside JSON strings.
  compact:=regexp_replace((p_value->'description')::text,'("(?:[^"\\]|\\.)*")|[[:space:]]+','\1','g');
  IF saas.content_authoring_utf16_length(compact)>20000 THEN RETURN false; END IF;
  FOR block IN SELECT value FROM jsonb_array_elements(p_value->'description') LOOP
   IF block->>'type' IN('paragraph','heading') THEN
    IF block->>'type'='paragraph' THEN
     IF NOT saas.content_authoring_object_valid(block,ARRAY['type','children'],ARRAY[]::text[]) THEN RETURN false; END IF;
    ELSE
     IF NOT saas.content_authoring_object_valid(block,ARRAY['type','level','children'],ARRAY[]::text[])
      OR jsonb_typeof(block->'level')<>'number' OR block->'level' NOT IN('2'::jsonb,'3'::jsonb,'4'::jsonb) THEN RETURN false; END IF;
    END IF;
    count_nodes:=saas.content_authoring_nodes_count(block->'children');
    IF count_nodes<0 THEN RETURN false; END IF;
    total_nodes:=total_nodes+count_nodes;
   ELSIF block->>'type'='list' THEN
    IF NOT saas.content_authoring_object_valid(block,ARRAY['type','ordered','items'],ARRAY[]::text[])
     OR jsonb_typeof(block->'ordered')<>'boolean' OR jsonb_typeof(block->'items')<>'array' THEN RETURN false; END IF;
    IF jsonb_array_length(block->'items')>100 THEN RETURN false; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(block->'items') LOOP
     count_nodes:=saas.content_authoring_nodes_count(item);
     IF count_nodes<0 THEN RETURN false; END IF;
     total_nodes:=total_nodes+count_nodes;
    END LOOP;
   ELSIF block->>'type'='table' THEN
    IF NOT saas.content_authoring_object_valid(block,ARRAY['type','rows'],ARRAY[]::text[]) OR jsonb_typeof(block->'rows')<>'array' THEN RETURN false; END IF;
    IF jsonb_array_length(block->'rows')>50 THEN RETURN false; END IF;
    FOR row_value IN SELECT value FROM jsonb_array_elements(block->'rows') LOOP
     IF jsonb_typeof(row_value)<>'array' THEN RETURN false; END IF;
     IF jsonb_array_length(row_value)>20 THEN RETURN false; END IF;
     FOR cell IN SELECT value FROM jsonb_array_elements(row_value) LOOP
      count_nodes:=saas.content_authoring_nodes_count(cell);
      IF count_nodes<0 THEN RETURN false; END IF;
      total_nodes:=total_nodes+count_nodes;
     END LOOP;
    END LOOP;
   ELSE RETURN false;
   END IF;
   IF total_nodes>1000 THEN RETURN false; END IF;
  END LOOP;
 END IF;
 RETURN true;
END $f$;
CREATE FUNCTION saas.content_authoring_usage_valid(p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE key text; counter numeric;
BEGIN
 IF p_value IS NULL OR p_value='null'::jsonb THEN RETURN true; END IF;
 IF NOT saas.content_authoring_object_valid(p_value,ARRAY['inputTokens','outputTokens','totalTokens'],ARRAY[]::text[]) THEN RETURN false; END IF;
 FOREACH key IN ARRAY ARRAY['inputTokens','outputTokens','totalTokens'] LOOP
  IF jsonb_typeof(p_value->key)<>'number' THEN RETURN false; END IF;
  counter:=(p_value->>key)::numeric;
  IF counter<0 OR counter>2147483647 OR counter<>trunc(counter) THEN RETURN false; END IF;
 END LOOP;
 RETURN (p_value->>'inputTokens')::numeric+(p_value->>'outputTokens')::numeric=(p_value->>'totalTokens')::numeric;
END $f$;
CREATE FUNCTION saas.content_authoring_transition(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_action text,p_id uuid,p_expected_version bigint,p_token uuid,p_data jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text; op saas.content_authoring_operations%ROWTYPE; cfg saas.toshi_provider_configs%ROWTYPE; lim integer; cnt integer;
BEGIN
 denied:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog',CASE WHEN p_action='set_daily_limit' THEN 'configuration.manage' ELSE 'catalog_admin.manage' END);
 IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 IF p_action NOT IN('begin','claim','get','complete','fail','set_daily_limit') OR p_data IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;RETURN;END IF;
 -- Serialize store reservations and setting changes; replay does not reserve again.
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store_id::text,170));
 IF p_action='set_daily_limit' THEN
  IF jsonb_typeof(p_data->'dailyLimit')<>'number' OR (p_data->>'dailyLimit')::numeric<>trunc((p_data->>'dailyLimit')::numeric) OR (p_data->>'dailyLimit')::numeric NOT BETWEEN 1 AND 10000 THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.content_authoring_settings VALUES(p_store_id,(p_data->>'dailyLimit')::integer,p_now) ON CONFLICT(store_id) DO UPDATE SET daily_limit=EXCLUDED.daily_limit,updated_at=EXCLUDED.updated_at;
  RETURN QUERY SELECT 'updated'::text,p_data->'dailyLimit';RETURN;
 END IF;
 IF p_id IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;RETURN;END IF;
 SELECT * INTO op FROM saas.content_authoring_operations o WHERE o.id=p_id FOR UPDATE;
 IF FOUND AND (op.store_id<>p_store_id OR op.principal_id<>p_principal_id) THEN RETURN QUERY SELECT 'operation_not_found'::text,NULL::jsonb;RETURN;END IF;
 -- No expired dispatched operation may ever become dispatchable again.
 UPDATE saas.content_authoring_operations o SET status=CASE WHEN o.dispatch_state='not_dispatched' THEN 'failed' ELSE 'unknown' END,
 dispatch_state=CASE WHEN o.dispatch_state='not_dispatched' THEN 'not_dispatched' ELSE 'unknown' END,
 safe_code='provider_timeout',version=o.version+1,finished_at=p_now,updated_at=p_now
 WHERE o.store_id=p_store_id AND o.principal_id=p_principal_id AND o.status='pending' AND o.lease_expires_at<=p_now;
 SELECT * INTO op FROM saas.content_authoring_operations o WHERE o.id=p_id FOR UPDATE;
 IF p_action='begin' THEN
  IF (p_data->>'requestFingerprint') IS NULL OR (p_data->>'requestFingerprint') !~ '^[a-f0-9]{64}$' OR (p_data->>'sourceFingerprint') IS NULL OR (p_data->>'sourceFingerprint') !~ '^[a-f0-9]{64}$' OR p_data->>'draftId' IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;RETURN;END IF;
  IF FOUND THEN
   IF op.request_fingerprint<>p_data->>'requestFingerprint' OR op.draft_id<>(p_data->>'draftId')::uuid OR op.product_id IS DISTINCT FROM (p_data->>'productId')::uuid OR op.source_fingerprint<>p_data->>'sourceFingerprint' OR op.config_id<>(p_data->>'configId')::uuid OR op.provider<>p_data->>'provider' OR op.model<>p_data->>'model' OR op.credential_version<>(p_data->>'credentialVersion')::bigint OR op.prompt_version<>p_data->>'promptVersion' THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;RETURN;END IF;
   RETURN QUERY SELECT CASE WHEN op.status='completed' THEN 'replayed-result' ELSE 'existing-status' END::text,saas.content_authoring_payload(p_id);RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM saas.content_authoring_operations o WHERE o.store_id=p_store_id AND o.principal_id=p_principal_id AND o.status='pending') THEN RETURN QUERY SELECT 'operation_busy'::text,NULL::jsonb;RETURN;END IF;
  SELECT count(*) INTO cnt FROM saas.content_authoring_operations o WHERE o.store_id=p_store_id AND o.principal_id=p_principal_id AND o.created_at>p_now-interval '1 minute';
  IF cnt>=6 THEN RETURN QUERY SELECT 'rate_limited'::text,NULL::jsonb;RETURN;END IF;
  SELECT daily_limit INTO lim FROM saas.content_authoring_settings WHERE store_id=p_store_id;lim:=coalesce(lim,100);
  SELECT count(*) INTO cnt FROM saas.content_authoring_operations o WHERE o.store_id=p_store_id AND o.created_at >= date_trunc('day',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND o.created_at < (date_trunc('day',p_now AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC';
  IF cnt>=lim THEN RETURN QUERY SELECT 'quota_exceeded'::text,NULL::jsonb;RETURN;END IF;
  SELECT * INTO cfg FROM saas.toshi_provider_configs c WHERE c.id=(p_data->>'configId')::uuid AND c.store_id=p_store_id FOR SHARE;
  IF NOT FOUND OR cfg.status<>'active' THEN RETURN QUERY SELECT 'connection_revoked'::text,NULL::jsonb;RETURN;END IF;
  IF cfg.provider<>p_data->>'provider' OR cfg.credential_version<>(p_data->>'credentialVersion')::bigint THEN RETURN QUERY SELECT 'credential_invalid'::text,NULL::jsonb;RETURN;END IF;
  IF NOT saas.toshi_provider_model_available(cfg.available_models,p_data->>'model') THEN RETURN QUERY SELECT 'model_unavailable'::text,NULL::jsonb;RETURN;END IF;
  IF p_data->>'productId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.products p WHERE p.id=(p_data->>'productId')::uuid AND p.store_id=p_store_id AND p.status<>'archived') THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.content_authoring_operations(id,store_id,principal_id,draft_id,product_id,request_fingerprint,source_fingerprint,config_id,provider,model,credential_version,prompt_version,status,lease_expires_at,created_at,updated_at)
  VALUES(p_id,p_store_id,p_principal_id,(p_data->>'draftId')::uuid,(p_data->>'productId')::uuid,p_data->>'requestFingerprint',p_data->>'sourceFingerprint',cfg.id,cfg.provider,p_data->>'model',cfg.credential_version,p_data->>'promptVersion','pending',p_now+interval '60 seconds',p_now,p_now);
  RETURN QUERY SELECT 'pending'::text,saas.content_authoring_payload(p_id);RETURN;
 END IF;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found'::text,NULL::jsonb;RETURN;END IF;
 IF p_action='get' THEN RETURN QUERY SELECT 'found'::text,saas.content_authoring_payload(p_id);RETURN;END IF;
 IF op.status<>'pending' THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb;RETURN;END IF;
 IF p_expected_version IS NULL OR op.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb;RETURN;END IF;
 IF p_action='claim' THEN
  IF op.dispatch_state<>'not_dispatched' OR op.claim_token IS NOT NULL THEN RETURN QUERY SELECT 'dispatch_already_claimed'::text,NULL::jsonb;RETURN;END IF;
  SELECT * INTO cfg FROM saas.toshi_provider_configs c WHERE c.id=op.config_id AND c.store_id=p_store_id FOR SHARE;
  IF NOT FOUND OR cfg.status<>'active' THEN RETURN QUERY SELECT 'connection_revoked'::text,NULL::jsonb;RETURN;END IF;
  IF cfg.credential_version<>op.credential_version THEN RETURN QUERY SELECT 'credential_invalid'::text,NULL::jsonb;RETURN;END IF;
  IF NOT saas.toshi_provider_model_available(cfg.available_models,op.model) THEN RETURN QUERY SELECT 'model_unavailable'::text,NULL::jsonb;RETURN;END IF;
  UPDATE saas.content_authoring_operations SET dispatch_state='dispatched',claim_token=gen_random_uuid(),version=version+1,lease_expires_at=p_now+interval '60 seconds',updated_at=p_now WHERE id=p_id;
  RETURN QUERY SELECT 'claimed'::text,saas.content_authoring_payload(p_id);RETURN;
 END IF;
 IF op.claim_token IS DISTINCT FROM p_token OR (p_action='complete' AND (op.dispatch_state<>'dispatched' OR p_token IS NULL)) THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb;RETURN;END IF;
 IF p_action='complete' THEN
  IF NOT saas.content_authoring_draft_valid(p_data->'draft',op.source_fingerprint)
   OR NOT saas.content_authoring_usage_valid(p_data->'usage') THEN
   RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
   RETURN;
  END IF;
  UPDATE saas.content_authoring_operations
  SET status='completed',
   draft=p_data->'draft',
   usage=nullif(p_data->'usage','null'::jsonb),
   version=version+1,
   finished_at=p_now,
   updated_at=p_now
  WHERE id=p_id;
  RETURN QUERY SELECT 'completed'::text,saas.content_authoring_payload(p_id);
  RETURN;
 END IF;
 IF p_data->>'safeCode' IS NULL
  OR p_data->>'safeCode' NOT IN(
   'invalid_input','rate_limited','quota_exceeded','provider_timeout','provider_unavailable',
   'invalid_output','cancelled','credential_invalid','connection_revoked','model_unavailable','unavailable'
  )
  OR p_data->>'dispatchState' IS NULL
  OR p_data->>'dispatchState' NOT IN('not_dispatched','dispatched','unknown')
  OR (op.dispatch_state='not_dispatched')<>(p_data->>'dispatchState'='not_dispatched') THEN
  RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
  RETURN;
 END IF;
 UPDATE saas.content_authoring_operations
 SET status=CASE WHEN p_data->>'dispatchState'='unknown' THEN 'unknown' ELSE 'failed' END,
  dispatch_state=p_data->>'dispatchState',
  safe_code=p_data->>'safeCode',
  version=version+1,
  finished_at=p_now,
  updated_at=p_now
 WHERE id=p_id;
 RETURN QUERY SELECT 'failed'::text,saas.content_authoring_payload(p_id);
END $f$;
CREATE FUNCTION saas.content_authoring_begin(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_fingerprint text,p_draft_id uuid,p_product_id uuid,p_source_fingerprint text,p_config_id uuid,p_provider text,p_model text,p_credential_version bigint,p_prompt_version text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_authoring_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'begin',p_id,NULL,NULL,jsonb_build_object('requestFingerprint',p_fingerprint,'draftId',p_draft_id,'productId',p_product_id,'sourceFingerprint',p_source_fingerprint,'configId',p_config_id,'provider',p_provider,'model',p_model,'credentialVersion',p_credential_version,'promptVersion',p_prompt_version)) $f$;
CREATE FUNCTION saas.content_authoring_get(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_authoring_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'get',p_id,NULL,NULL,'{}'::jsonb) $f$;
CREATE FUNCTION saas.content_authoring_claim(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_version bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_authoring_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'claim',p_id,p_version,NULL,'{}'::jsonb) $f$;
CREATE FUNCTION saas.content_authoring_complete(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_token uuid,p_version bigint,p_draft jsonb,p_usage jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_authoring_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'complete',p_id,p_version,p_token,jsonb_build_object('draft',p_draft,'usage',p_usage)) $f$;
CREATE FUNCTION saas.content_authoring_fail(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_token uuid,p_version bigint,p_code text,p_dispatch_state text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_authoring_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'fail',p_id,p_version,p_token,jsonb_build_object('safeCode',p_code,'dispatchState',p_dispatch_state)) $f$;
CREATE FUNCTION saas.content_authoring_set_daily_limit(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_limit integer) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_authoring_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'set_daily_limit',NULL,NULL,NULL,jsonb_build_object('dailyLimit',p_limit)) $f$;
REVOKE ALL ON FUNCTION saas.content_authoring_object_valid(jsonb,text[],text[]),saas.content_authoring_utf16_length(text),saas.content_authoring_text_valid(jsonb,integer,integer),saas.content_authoring_nodes_count(jsonb),saas.content_authoring_draft_valid(jsonb,text),saas.content_authoring_usage_valid(jsonb) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON TABLE saas.content_authoring_settings,saas.content_authoring_operations,saas.content_authoring_origin_history FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.content_authoring_begin(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text,uuid,text,text,bigint,text),saas.content_authoring_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.content_authoring_claim(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint),saas.content_authoring_complete(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint,jsonb,jsonb),saas.content_authoring_fail(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint,text,text),saas.content_authoring_set_daily_limit(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer),saas.content_authoring_payload(uuid),saas.content_authoring_origin_immutable(),saas.content_authoring_origin_binding_guard(),saas.content_authoring_transition(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid,bigint,uuid,jsonb) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.content_authoring_begin(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text,uuid,text,text,bigint,text),saas.content_authoring_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.content_authoring_claim(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint),saas.content_authoring_complete(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint,jsonb,jsonb),saas.content_authoring_fail(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint,text,text),saas.content_authoring_set_daily_limit(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer) TO celebix_saas_app;
COMMIT;
