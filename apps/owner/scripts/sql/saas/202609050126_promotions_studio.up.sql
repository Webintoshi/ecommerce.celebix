-- Promotions Studio v1 is additive. Checkout/order entry points deliberately remain untouched.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS saas.promotions (
  id uuid NOT NULL,
  store_id uuid NOT NULL,
  legacy_record_id uuid NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('draft','scheduled','active','paused','archived')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  rule_document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id),
  UNIQUE (id),
  UNIQUE (store_id,legacy_record_id),
  FOREIGN KEY (store_id) REFERENCES saas.stores(id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_versions (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version > 0), rule_document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,promotion_id,version),
  FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_targets (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('product','variant','category','brand','collection')),
  target_id uuid NOT NULL, inclusion text NOT NULL CHECK (inclusion IN ('include','exclude')),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,promotion_id,target_kind,target_id,inclusion),
  FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_code_batches (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
  requested_count integer NOT NULL CHECK (requested_count BETWEEN 1 AND 10000),
  operation_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,operation_id),
  FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_codes (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL, batch_id uuid NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,code),
  FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id),
  FOREIGN KEY (store_id,batch_id) REFERENCES saas.promotion_code_batches(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_operations (
  id uuid NOT NULL, store_id uuid NOT NULL, operation_id uuid NOT NULL,
  operation_kind text NOT NULL CHECK (operation_kind ~ '^[a-z_]{1,64}$'),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,operation_id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_usage_reservations (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL, code_id uuid NULL,
  customer_id uuid NULL, operation_id uuid NOT NULL, source_reference text NOT NULL CHECK (length(source_reference) BETWEEN 1 AND 200),
  reserved_uses integer NOT NULL DEFAULT 1 CHECK (reserved_uses > 0), reserved_budget_minor bigint NOT NULL DEFAULT 0 CHECK (reserved_budget_minor >= 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','committed','released','expired')),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,operation_id),
  FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id), FOREIGN KEY (store_id,code_id) REFERENCES saas.promotion_codes(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_redemptions (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL, reservation_id uuid NULL,
  order_id uuid NULL, customer_id uuid NULL, discount_minor bigint NOT NULL CHECK (discount_minor >= 0), currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), PRIMARY KEY (store_id,id),
  UNIQUE (store_id,reservation_id), FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id),
  FOREIGN KEY (store_id,reservation_id) REFERENCES saas.promotion_usage_reservations(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_audit_events (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NULL, actor_principal_id uuid NULL,
  event_kind text NOT NULL CHECK (event_kind ~ '^[a-z_]{1,64}$'), payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), PRIMARY KEY (store_id,id),
  FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.order_promotion_snapshots (
  id uuid NOT NULL, store_id uuid NOT NULL, order_id uuid NOT NULL, promotion_id uuid NOT NULL,
  promotion_version bigint NOT NULL CHECK (promotion_version > 0), normalized_code text NULL, snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), PRIMARY KEY (store_id,id),
  UNIQUE (store_id,order_id,promotion_id,promotion_version), FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.order_discount_allocations (
  id uuid NOT NULL, store_id uuid NOT NULL, order_id uuid NOT NULL, snapshot_id uuid NOT NULL,
  line_id uuid NULL, line_position integer NOT NULL CHECK (line_position >= 0), discount_minor bigint NOT NULL CHECK (discount_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), PRIMARY KEY (store_id,id),
  FOREIGN KEY (store_id,snapshot_id) REFERENCES saas.order_promotion_snapshots(store_id,id)
);

CREATE OR REPLACE FUNCTION saas.promotion_rule_document_valid(p_document jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT p_document IS NOT NULL AND pg_catalog.jsonb_typeof(p_document)='object'
    AND p_document ?& ARRAY['schemaVersion','benefit','targets','audience','trigger','schedule','limits','conditions','combinationPolicy','priority','marginPolicy','progressMessagePolicy']
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_document) AS key WHERE key NOT IN ('schemaVersion','benefit','targets','audience','trigger','schedule','limits','conditions','combinationPolicy','priority','marginPolicy','progressMessagePolicy'))
    AND p_document->>'schemaVersion'='1'
    AND pg_catalog.jsonb_typeof(p_document->'benefit')='object'
    AND (p_document->'benefit'->>'kind') IN ('percentage','fixed_amount','free_shipping','buy_x_get_y','quantity_tiers','bundle_price','gift')
    AND pg_catalog.jsonb_typeof(p_document->'targets')='object'
    AND pg_catalog.jsonb_typeof(p_document->'audience')='object'
    AND pg_catalog.jsonb_typeof(p_document->'trigger')='object'
    AND pg_catalog.jsonb_typeof(p_document->'schedule')='object'
    AND pg_catalog.jsonb_typeof(p_document->'limits')='object'
    AND pg_catalog.jsonb_typeof(p_document->'conditions')='object'
    AND pg_catalog.jsonb_typeof(p_document->'combinationPolicy')='object'
    AND pg_catalog.jsonb_typeof(p_document->'marginPolicy')='object'
    AND pg_catalog.jsonb_typeof(p_document->'progressMessagePolicy')='object'
$fn$;

DO $fn$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.promotions'::regclass AND conname='promotions_rule_document_check') THEN
    ALTER TABLE saas.promotions ADD CONSTRAINT promotions_rule_document_check CHECK (saas.promotion_rule_document_valid(rule_document)) NOT VALID;
    ALTER TABLE saas.promotions VALIDATE CONSTRAINT promotions_rule_document_check;
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_normalize_code(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE WHEN p_code ~ '[[:space:][:cntrl:]]' THEN NULL ELSE pg_catalog.upper(pg_catalog.translate(p_code,'İIıiÇçĞğÖöŞşÜü','IIiiCCGgOoSsUu')) END
$fn$;
CREATE OR REPLACE FUNCTION saas.promotion_operation_fingerprint(p_kind text,p_payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_kind||':'||p_payload::text,'UTF8')),'hex')
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_audit_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN RAISE EXCEPTION 'promotion audit events are append-only'; END $fn$;
DROP TRIGGER IF EXISTS promotion_audit_events_immutable ON saas.promotion_audit_events;
CREATE TRIGGER promotion_audit_events_immutable BEFORE UPDATE OR DELETE ON saas.promotion_audit_events FOR EACH ROW EXECUTE FUNCTION saas.promotion_audit_append_only();

CREATE OR REPLACE FUNCTION saas.promotion_evaluate_v1(p_store_id uuid,p_context jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_currency text:=p_context->>'currency'; v_subtotal bigint:=0; v_shipping bigint:=0; v_discount bigint:=0; v_lines jsonb:=COALESCE(p_context->'cartLines','[]'::jsonb); v_candidate record; v_rule jsonb; v_saving bigint; v_quantity integer:=0; v_bps integer:=0; v_gifts jsonb:='[]'::jsonb; v_applied jsonb:='[]'::jsonb; v_effects jsonb:='[]'::jsonb;
BEGIN
  IF p_store_id IS NULL OR p_context IS NULL OR p_now IS NULL OR v_currency !~ '^[A-Z]{3}$' OR pg_catalog.jsonb_typeof(v_lines)<>'array' THEN
    RETURN pg_catalog.jsonb_build_object('eligiblePromotionIds','[]'::jsonb,'appliedPromotions','[]'::jsonb,'rejectedPromotions','[]'::jsonb,'lineEffects','[]'::jsonb,'shippingEffects','[]'::jsonb,'gifts','[]'::jsonb,'subtotalBeforeDiscountMinor',0,'lineDiscountTotalMinor',0,'shippingBeforeDiscountMinor',0,'shippingDiscountTotalMinor',0,'discountTotalMinor',0,'grandTotalMinor',0,'currency',COALESCE(v_currency,'TRY'),'progressMessages','[]'::jsonb,'merchantExplanation','invalid context');
  END IF;
  SELECT COALESCE(sum((line->>'unitPriceMinor')::bigint * (line->>'quantity')::integer),0) INTO v_subtotal FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE (line->>'unitPriceMinor') ~ '^[0-9]+$' AND (line->>'quantity') ~ '^[1-9][0-9]*$';
  v_shipping:=COALESCE(NULLIF(p_context->>'shippingBeforeDiscountMinor','')::bigint,0);
  FOR v_candidate IN SELECT p.* FROM saas.promotions p WHERE p.store_id=p_store_id AND p.status IN ('active','scheduled') AND saas.promotion_rule_document_valid(p.rule_document) AND (p.rule_document->'schedule'->>'startsAt' IS NULL OR (p.rule_document->'schedule'->>'startsAt')::timestamptz <= p_now) AND (p.rule_document->'schedule'->>'endsAt' IS NULL OR p_now < (p.rule_document->'schedule'->>'endsAt')::timestamptz) ORDER BY p.created_at,p.id LOOP
    v_rule:=v_candidate.rule_document;
    IF v_rule->'trigger'->>'kind'='code' AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_context->'submittedCodes','[]'::jsonb)) c JOIN saas.promotion_codes code ON code.store_id=p_store_id AND code.promotion_id=v_candidate.id AND code.code=saas.promotion_normalize_code(c) AND code.status='active') THEN CONTINUE; END IF;
    SELECT COALESCE(sum((line->>'quantity')::integer),0) INTO v_quantity FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE (line->>'quantity') ~ '^[1-9][0-9]*$';
    IF v_rule->'benefit'->>'kind'='free_shipping' THEN v_saving:=v_shipping;
    ELSIF v_rule->'benefit'->>'kind'='percentage' THEN v_saving:=LEAST(v_subtotal, GREATEST(0::bigint,(v_subtotal*COALESCE((v_rule->'benefit'->>'percentageBps')::integer,0))/10000));
    ELSIF v_rule->'benefit'->>'kind'='fixed_amount' AND v_rule->'benefit'->>'currency'=v_currency THEN v_saving:=LEAST(v_subtotal,COALESCE((v_rule->'benefit'->>'amountMinor')::bigint,0));
    ELSIF v_rule->'benefit'->>'kind'='quantity_tiers' THEN SELECT COALESCE(max((tier->>'percentageBps')::integer),0) INTO v_bps FROM pg_catalog.jsonb_array_elements(COALESCE(v_rule->'benefit'->'tiers','[]'::jsonb)) tier WHERE (tier->>'minimumQuantity')::integer<=v_quantity; v_saving:=LEAST(v_subtotal,GREATEST(0::bigint,(v_subtotal*v_bps)/10000));
    ELSIF v_rule->'benefit'->>'kind'='bundle_price' AND v_rule->'benefit'->>'currency'=v_currency THEN v_saving:=GREATEST(0::bigint,v_subtotal-((v_quantity/NULLIF((v_rule->'benefit'->>'bundleQuantity')::integer,0))*(v_rule->'benefit'->>'bundlePriceMinor')::bigint));
    ELSIF v_rule->'benefit'->>'kind'='buy_x_get_y' THEN v_saving:=LEAST(v_subtotal,GREATEST(0::bigint,((v_quantity/NULLIF(((v_rule->'benefit'->>'buyQuantity')::integer+(v_rule->'benefit'->>'receiveQuantity')::integer),0))*COALESCE((SELECT min((line->>'unitPriceMinor')::bigint) FROM pg_catalog.jsonb_array_elements(v_lines) line),0)*(v_rule->'benefit'->>'discountPercentageBps')::integer)/10000));
    ELSIF v_rule->'benefit'->>'kind'='gift' THEN v_saving:=0; v_gifts:=v_gifts||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'variantId',v_rule->'benefit'->>'giftVariantId','quantity',1,'paidMinor',0));
    ELSE v_saving:=0; END IF;
    v_saving:=LEAST(v_saving,COALESCE(NULLIF(v_rule->'limits'->>'orderMaximumMinor','')::bigint,v_saving));
    IF v_saving>0 THEN v_discount:=v_discount+v_saving; v_applied:=v_applied || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'version',v_candidate.version,'name',v_candidate.name,'benefitKind',v_rule->'benefit'->>'kind','lineDiscountMinor',CASE WHEN v_rule->'benefit'->>'kind'='free_shipping' THEN 0 ELSE v_saving END,'shippingDiscountMinor',CASE WHEN v_rule->'benefit'->>'kind'='free_shipping' THEN v_saving ELSE 0 END,'discountTotalMinor',v_saving)); END IF;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('eligiblePromotionIds','[]'::jsonb,'appliedPromotions',v_applied,'rejectedPromotions','[]'::jsonb,'lineEffects',v_effects,'shippingEffects','[]'::jsonb,'gifts',v_gifts,'subtotalBeforeDiscountMinor',v_subtotal,'lineDiscountTotalMinor',v_discount,'shippingBeforeDiscountMinor',v_shipping,'shippingDiscountTotalMinor',0,'discountTotalMinor',v_discount,'grandTotalMinor',GREATEST(0::bigint,v_subtotal+v_shipping-v_discount),'currency',v_currency,'progressMessages','[]'::jsonb,'merchantExplanation','evaluated');
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_authority_error(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_action text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  IF p_action NOT IN ('promotions.read','promotions.manage','promotions.archive') THEN RETURN 'durable_authority_invalid'; END IF;
  v_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions',p_action);
  RETURN v_error;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_projection(p_store_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT pg_catalog.jsonb_build_object('id',p.id,'version',p.version,'name',p.name,'status',p.status,'ruleDocument',p.rule_document,'createdAt',pg_catalog.to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedAt',pg_catalog.to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) FROM saas.promotions p WHERE p.store_id=p_store_id AND p.id=p_id
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_record_operation(p_store_id uuid,p_operation_id uuid,p_kind text,p_fingerprint text,p_result jsonb,p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN
  INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_payload,created_at)
  VALUES (p_operation_id,p_store_id,p_operation_id,p_kind,p_fingerprint,p_result,p_now);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_create_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_promotion_id uuid,p_name text,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_operation saas.promotion_operations%ROWTYPE; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.manage'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_store_id::text||':'||p_operation_id::text,0));
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN IF v_operation.operation_kind<>'create' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF; RETURN; END IF;
  IF p_promotion_id IS NULL OR p_operation_id IS NULL OR p_fingerprint<>saas.promotion_operation_fingerprint('create',pg_catalog.jsonb_build_object('id',p_promotion_id,'name',p_name,'ruleDocument',p_rule_document)) OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR p_name~'[[:cntrl:]]' OR NOT saas.promotion_rule_document_valid(p_rule_document) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES(p_promotion_id,p_store_id,p_name,'draft',1,p_rule_document,p_now,p_now);
  INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(p_promotion_id,p_store_id,p_promotion_id,1,p_rule_document,p_now);
  v_result:=saas.promotion_projection(p_store_id,p_promotion_id); PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'create',p_fingerprint,v_result,p_now); INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,actor_principal_id,event_kind,payload,created_at) VALUES(p_operation_id,p_store_id,p_promotion_id,p_principal_id,'created','{}'::jsonb,p_now); RETURN QUERY SELECT 'created',v_result;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'conflict',NULL::jsonb;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_update_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_promotion_id uuid,p_expected_version bigint,p_name text,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_current saas.promotions%ROWTYPE; v_operation saas.promotion_operations%ROWTYPE; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.manage'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_store_id::text||':'||p_promotion_id::text,0)); SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE; IF FOUND THEN IF v_operation.operation_kind<>'update' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF; RETURN; END IF;
  SELECT * INTO v_current FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF; IF v_current.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id); RETURN; END IF; IF v_current.status='archived' OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR NOT saas.promotion_rule_document_valid(p_rule_document) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  UPDATE saas.promotions SET name=p_name,rule_document=p_rule_document,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_promotion_id; INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(p_operation_id,p_store_id,p_promotion_id,v_current.version+1,p_rule_document,p_now); v_result:=saas.promotion_projection(p_store_id,p_promotion_id); PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'update',p_fingerprint,v_result,p_now); RETURN QUERY SELECT 'updated',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_lifecycle_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_promotion_id uuid,p_expected_version bigint,p_next_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_action text; v_error text; v_current saas.promotions%ROWTYPE; v_result jsonb;
BEGIN
  v_action:=CASE WHEN p_next_status='archived' THEN 'promotions.archive' ELSE 'promotions.manage' END; v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,v_action); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF; IF p_next_status NOT IN ('scheduled','active','paused','archived') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_store_id::text||':'||p_promotion_id::text,0)); SELECT * INTO v_current FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF; IF v_current.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id); RETURN; END IF; IF v_current.status='archived' OR (p_next_status='active' AND NOT saas.promotion_rule_document_valid(v_current.rule_document)) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  UPDATE saas.promotions SET status=p_next_status,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_promotion_id; v_result:=saas.promotion_projection(p_store_id,p_promotion_id); PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'lifecycle',p_fingerprint,v_result,p_now); RETURN QUERY SELECT 'updated',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_list_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_search text,p_statuses text[],p_limit integer)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF; IF p_limit NOT BETWEEN 1 AND 100 OR COALESCE(pg_catalog.array_length(p_statuses,1),0)>5 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.promotion_projection(p_store_id,x.id) ORDER BY x.updated_at DESC,x.id DESC) FROM (SELECT id,updated_at FROM saas.promotions WHERE store_id=p_store_id AND (p_search IS NULL OR name ILIKE '%'||p_search||'%') AND (COALESCE(pg_catalog.array_length(p_statuses,1),0)=0 OR status=ANY(p_statuses)) ORDER BY updated_at DESC,id DESC LIMIT p_limit) x),'[]'::jsonb)); END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_simulate_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_context jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; BEGIN v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF; RETURN QUERY SELECT 'simulated',pg_catalog.jsonb_build_object('evaluation',saas.promotion_evaluate_v1(p_store_id,p_context,p_now),'mutated',false); END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_detail_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_promotion_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  v_result:=saas.promotion_projection(p_store_id,p_promotion_id);
  IF v_result IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; ELSE RETURN QUERY SELECT 'found',v_result; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_conflicts_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF NOT saas.promotion_rule_document_valid(p_rule_document) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'checked',pg_catalog.jsonb_build_object('blocking',false,'conflicts','[]'::jsonb,'margin','warn');
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_create_code_batch_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_batch_id uuid,p_promotion_id uuid,p_count integer,p_prefix text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_operation saas.promotion_operations%ROWTYPE; v_code text; v_index integer; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.manage'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_batch_id IS NULL OR p_count NOT BETWEEN 1 AND 10000 OR p_prefix !~ '^[A-Z0-9_-]{0,20}$' OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_store_id::text||':'||p_promotion_id::text,0)); SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN IF v_operation.operation_kind<>'code_batch' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id AND status<>'archived') THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.promotion_code_batches(id,store_id,promotion_id,status,requested_count,operation_id,created_at) VALUES(p_batch_id,p_store_id,p_promotion_id,'active',p_count,p_operation_id,p_now);
  FOR v_index IN 1..p_count LOOP
    v_code:=saas.promotion_normalize_code(p_prefix||pg_catalog.substr(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_operation_id::text||':'||v_index::text,'UTF8')),'hex'),1,20));
    INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_promotion_id,p_batch_id,v_code,'active',p_now);
  END LOOP;
  v_result:=pg_catalog.jsonb_build_object('id',p_batch_id,'promotionId',p_promotion_id,'status','active','count',p_count,'createdAt',pg_catalog.to_char(p_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'code_batch',p_fingerprint,v_result,p_now); RETURN QUERY SELECT 'created',v_result;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'code_conflict',NULL::jsonb;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_codes_csv_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_batch_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.manage'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.promotion_code_batches WHERE store_id=p_store_id AND id=p_batch_id) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('rows',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code',c.code,'status',c.status) ORDER BY c.code) FROM saas.promotion_codes c WHERE c.store_id=p_store_id AND c.batch_id=p_batch_id),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_analytics_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_promotion_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('currency',currency,'redemptions',redemptions,'discountMinor',discount_minor,'revenueMinor',0,'conversionBps',0) ORDER BY currency) FROM (SELECT currency,count(*)::bigint redemptions,COALESCE(sum(discount_minor),0)::bigint discount_minor FROM saas.promotion_redemptions WHERE store_id=p_store_id AND promotion_id=p_promotion_id GROUP BY currency) x),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_code_batch_status_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_batch_id uuid,p_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.manage');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF p_status NOT IN ('active','paused','revoked') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  UPDATE saas.promotion_code_batches SET status=p_status WHERE store_id=p_store_id AND id=p_batch_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  UPDATE saas.promotion_codes SET status=p_status WHERE store_id=p_store_id AND batch_id=p_batch_id AND status<>'revoked';
  RETURN QUERY SELECT 'updated',pg_catalog.jsonb_build_object('id',p_batch_id,'status',p_status);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_legacy_list_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('legacyRecordId',r.id,'promotionId',p.id,'reason',CASE WHEN p.id IS NULL THEN 'legacy_discount_requires_review' ELSE 'adopted' END) ORDER BY r.created_at,r.id) FROM saas.merchant_admin_records r LEFT JOIN saas.promotions p ON p.store_id=r.store_id AND p.legacy_record_id=r.id WHERE r.store_id=p_store_id AND r.record_kind='discount'),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_margin_check_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT * FROM saas.promotion_conflicts_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_rule_document)
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_reserve_v1(p_store_id uuid,p_promotion_id uuid,p_code_id uuid,p_customer_id uuid,p_operation_id uuid,p_source_reference text,p_budget_minor bigint,p_now timestamptz,p_expires_at timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_existing saas.promotion_usage_reservations%ROWTYPE; v_used bigint;
BEGIN
  IF p_store_id IS NULL OR p_promotion_id IS NULL OR p_operation_id IS NULL OR p_source_reference IS NULL OR p_expires_at<=p_now OR p_budget_minor<0 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_store_id::text||':'||p_promotion_id::text,0)); SELECT * INTO v_existing FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE; IF FOUND THEN RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object('reservationId',v_existing.id,'status',v_existing.status); RETURN; END IF;
  SELECT count(*) INTO v_used FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND promotion_id=p_promotion_id AND (status='committed' OR (status='reserved' AND expires_at>p_now)); IF NOT EXISTS(SELECT 1 FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id AND status='active') THEN RETURN QUERY SELECT 'not_eligible',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,code_id,customer_id,operation_id,source_reference,reserved_budget_minor,status,expires_at,created_at,updated_at) VALUES(p_operation_id,p_store_id,p_promotion_id,p_code_id,p_customer_id,p_operation_id,p_source_reference,p_budget_minor,'reserved',p_expires_at,p_now,p_now); RETURN QUERY SELECT 'reserved',pg_catalog.jsonb_build_object('reservationId',p_operation_id,'contendedUses',v_used+1);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_release_expired_v1(p_store_id uuid,p_now timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_count integer; BEGIN UPDATE saas.promotion_usage_reservations SET status='expired',updated_at=p_now WHERE store_id=p_store_id AND status='reserved' AND expires_at<=p_now; GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_release_reservation_v1(p_store_id uuid,p_reservation_id uuid,p_operation_id uuid,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_reservation saas.promotion_usage_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_reservation FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_reservation.operation_id<>p_operation_id THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  IF v_reservation.status='committed' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF v_reservation.status='reserved' THEN UPDATE saas.promotion_usage_reservations SET status='released',updated_at=p_now WHERE store_id=p_store_id AND id=p_reservation_id; END IF;
  RETURN QUERY SELECT 'released',pg_catalog.jsonb_build_object('reservationId',p_reservation_id);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_commit_reservation_v1(p_store_id uuid,p_reservation_id uuid,p_operation_id uuid,p_redemption_id uuid,p_order_id uuid,p_discount_minor bigint,p_currency text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_reservation saas.promotion_usage_reservations%ROWTYPE;
BEGIN
  IF p_discount_minor<0 OR p_currency !~ '^[A-Z]{3}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_reservation FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_reservation.operation_id<>p_operation_id THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  IF v_reservation.status='committed' THEN RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object('reservationId',p_reservation_id); RETURN; END IF;
  IF v_reservation.status<>'reserved' OR v_reservation.expires_at<=p_now THEN RETURN QUERY SELECT 'not_eligible',NULL::jsonb; RETURN; END IF;
  UPDATE saas.promotion_usage_reservations SET status='committed',updated_at=p_now WHERE store_id=p_store_id AND id=p_reservation_id;
  INSERT INTO saas.promotion_redemptions(id,store_id,promotion_id,reservation_id,order_id,customer_id,discount_minor,currency,created_at) VALUES(p_redemption_id,p_store_id,v_reservation.promotion_id,p_reservation_id,p_order_id,v_reservation.customer_id,p_discount_minor,p_currency,p_now);
  RETURN QUERY SELECT 'committed',pg_catalog.jsonb_build_object('reservationId',p_reservation_id,'redemptionId',p_redemption_id);
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object('reservationId',p_reservation_id); END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_recover_operation_v1(p_store_id uuid,p_operation_id uuid,p_kind text,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_operation saas.promotion_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_operation.operation_kind<>p_kind OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_adopt_legacy_discounts_v1(p_store_id uuid,p_now timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_count integer; BEGIN
  INSERT INTO saas.promotions(id,store_id,legacy_record_id,name,status,version,rule_document,created_at,updated_at)
  SELECT r.id,r.store_id,r.id,pg_catalog.left(r.name,200),'draft',1,
    pg_catalog.jsonb_build_object('schemaVersion',1,'benefit',CASE WHEN r.config->>'discountType'='percent' THEN pg_catalog.jsonb_build_object('kind','percentage','percentageBps',((r.config->>'value')::numeric*100)::integer) ELSE pg_catalog.jsonb_build_object('kind','fixed_amount','amountMinor',(r.config->>'value')::bigint,'currency','TRY') END,'targets',pg_catalog.jsonb_build_object('mode','all','include','[]'::jsonb,'exclude','[]'::jsonb),'audience',pg_catalog.jsonb_build_object('mode','everyone'),'trigger',CASE WHEN r.config ? 'code' AND saas.promotion_normalize_code(r.config->>'code')~'^[A-Z0-9][A-Z0-9_-]{0,63}$' THEN pg_catalog.jsonb_build_object('kind','code','codes',pg_catalog.jsonb_build_array(saas.promotion_normalize_code(r.config->>'code'))) ELSE pg_catalog.jsonb_build_object('kind','automatic') END,'schedule',pg_catalog.jsonb_build_object('timezone','Europe/Istanbul'),'limits',pg_catalog.jsonb_build_object('totalUsage',NULLIF(r.config->>'usageLimit','')::integer,'perCustomerUsage',NULL,'budgetMinor',NULL,'orderMaximumMinor',NULL),'conditions',pg_catalog.jsonb_build_object('minimumBasketMinor',COALESCE(NULLIF(r.config->>'minimumOrderCents','')::bigint,0),'minimumQuantity',0,'minimumProductQuantity',0),'combinationPolicy',pg_catalog.jsonb_build_object('kind','none'),'priority',0,'marginPolicy',pg_catalog.jsonb_build_object('kind','warn'),'progressMessagePolicy',pg_catalog.jsonb_build_object('enabled',false)),p_now,p_now
  FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind='discount' AND r.config->>'discountType' IN ('percent','fixed') AND r.config->>'value'~'^[0-9]+([.][0-9]+)?$' ON CONFLICT (store_id,legacy_record_id) DO NOTHING; GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count;
END $fn$;

DO $fn$ DECLARE v_table text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',v_table); EXECUTE pg_catalog.format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE pg_catalog.format('REVOKE ALL ON TABLE saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity',v_table);
    EXECUTE pg_catalog.format('DROP POLICY IF EXISTS promotions_owner_only ON saas.%I',v_table); EXECUTE pg_catalog.format('CREATE POLICY promotions_owner_only ON saas.%I TO celebix_saas_owner USING (true) WITH CHECK (true)',v_table);
  END LOOP;
END $fn$;
ALTER FUNCTION saas.promotion_evaluate_v1(uuid,jsonb,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.promotion_lifecycle_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text[],integer) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.promotion_evaluate_v1(uuid,jsonb,timestamptz),saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb),saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb),saas.promotion_lifecycle_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text[],integer),saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb),saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb),saas.promotion_lifecycle_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text[],integer),saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.promotion_detail_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.promotion_conflicts_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.promotion_margin_check_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,integer,text),saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),saas.promotion_codes_csv_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.promotion_analytics_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
COMMIT;
