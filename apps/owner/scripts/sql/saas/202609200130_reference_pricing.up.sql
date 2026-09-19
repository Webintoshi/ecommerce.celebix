-- Tenant-owned manual reference pricing. This migration is additive; no tenant is seeded.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE TABLE saas.pricing_reference_definitions (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('usd','eur','gold_gram')),
  label text NOT NULL CHECK (label=pg_catalog.btrim(label) AND pg_catalog.char_length(label) BETWEEN 1 AND 120 AND label!~'[[:cntrl:]]'),
  reference_purity numeric(12,8),
  created_by uuid NOT NULL REFERENCES saas.principals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL CHECK (pg_catalog.isfinite(created_at)),
  UNIQUE (store_id,id),
  CHECK ((kind='gold_gram' AND (reference_purity IS NULL OR reference_purity>0 AND reference_purity<=1))
    OR (kind IN ('usd','eur') AND reference_purity IS NULL))
);
CREATE UNIQUE INDEX pricing_reference_single_fx_kind
  ON saas.pricing_reference_definitions(store_id,kind) WHERE kind IN ('usd','eur');

CREATE TABLE saas.pricing_reference_sets (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
  created_by uuid NOT NULL REFERENCES saas.principals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL CHECK (pg_catalog.isfinite(created_at)),
  UNIQUE (store_id,id),
  UNIQUE (store_id,version)
);
CREATE TABLE saas.pricing_reference_set_values (
  store_id uuid NOT NULL,
  set_id uuid NOT NULL,
  reference_id uuid NOT NULL,
  rate_try numeric(28,8),
  active boolean NOT NULL,
  PRIMARY KEY (store_id,set_id,reference_id),
  FOREIGN KEY (store_id,set_id) REFERENCES saas.pricing_reference_sets(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id,reference_id) REFERENCES saas.pricing_reference_definitions(store_id,id) ON DELETE RESTRICT,
  CHECK ((active AND rate_try IS NOT NULL AND rate_try>0 AND rate_try<=9007199254740991)
    OR (NOT active AND (rate_try IS NULL OR rate_try>0 AND rate_try<=9007199254740991)))
);
CREATE INDEX pricing_reference_values_lookup
  ON saas.pricing_reference_set_values(store_id,reference_id,set_id);

CREATE TABLE saas.pricing_reference_state (
  store_id uuid PRIMARY KEY REFERENCES saas.stores(id) ON DELETE RESTRICT,
  active_set_id uuid,
  version bigint NOT NULL DEFAULT 0 CHECK (version BETWEEN 0 AND 9007199254740991),
  last_set_version bigint NOT NULL DEFAULT 0 CHECK (last_set_version BETWEEN 0 AND 9007199254740991),
  updated_at timestamptz,
  FOREIGN KEY (store_id,active_set_id) REFERENCES saas.pricing_reference_sets(store_id,id) ON DELETE RESTRICT,
  CHECK ((version=0 AND active_set_id IS NULL) OR (version>0 AND active_set_id IS NOT NULL)),
  CHECK (updated_at IS NULL OR pg_catalog.isfinite(updated_at))
);

CREATE TABLE saas.pricing_variant_policy_versions (
  store_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
  method text NOT NULL CHECK (method IN ('fixed_try','usd','eur','gold_gram')),
  fixed_price_cents bigint,
  source_amount numeric(28,8),
  metal_grams numeric(28,8),
  reference_id uuid,
  purity_mode text,
  product_purity numeric(12,8),
  labor_mode text,
  labor_amount numeric(28,8),
  uplift_percent numeric(28,8),
  allow_full_discount boolean NOT NULL,
  policy_payload jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(policy_payload)='object' AND pg_catalog.pg_column_size(policy_payload)<=8192),
  created_by uuid NOT NULL REFERENCES saas.principals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL CHECK (pg_catalog.isfinite(created_at)),
  PRIMARY KEY (store_id,variant_id,version),
  FOREIGN KEY (store_id,variant_id) REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id,reference_id) REFERENCES saas.pricing_reference_definitions(store_id,id) ON DELETE RESTRICT,
  CHECK (
    (method='fixed_try' AND fixed_price_cents IS NOT NULL AND fixed_price_cents BETWEEN 0 AND 8000000000
      AND source_amount IS NULL AND metal_grams IS NULL AND reference_id IS NULL
      AND purity_mode IS NULL AND product_purity IS NULL AND labor_mode IS NULL
      AND labor_amount IS NULL AND uplift_percent IS NULL)
    OR (method IN ('usd','eur') AND fixed_price_cents IS NULL AND source_amount IS NOT NULL AND source_amount>=0
      AND metal_grams IS NULL AND reference_id IS NOT NULL AND purity_mode IS NULL
      AND product_purity IS NULL AND labor_mode IS NOT NULL AND labor_mode IN ('none','per_item_try')
      AND labor_amount IS NOT NULL AND labor_amount>=0 AND uplift_percent IS NOT NULL AND uplift_percent BETWEEN 0 AND 9007199254740991)
    OR (method='gold_gram' AND fixed_price_cents IS NULL AND source_amount IS NULL
      AND metal_grams IS NOT NULL AND metal_grams>=0 AND reference_id IS NOT NULL AND purity_mode IS NOT NULL AND purity_mode IN ('direct','ratio')
      AND ((purity_mode='direct' AND product_purity IS NULL)
        OR (purity_mode='ratio' AND product_purity IS NOT NULL AND product_purity>0 AND product_purity<=1))
      AND labor_mode IS NOT NULL AND labor_mode IN ('none','per_item_try','per_gram_try')
      AND labor_amount IS NOT NULL AND labor_amount>=0 AND uplift_percent IS NOT NULL AND uplift_percent BETWEEN 0 AND 9007199254740991)
  ),
  CHECK (method='gold_gram' OR allow_full_discount=false)
);
CREATE INDEX pricing_policy_reference_lookup
  ON saas.pricing_variant_policy_versions(store_id,reference_id,variant_id,version);
CREATE TABLE saas.pricing_variant_policy_state (
  store_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  current_version bigint NOT NULL CHECK (current_version BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY (store_id,variant_id),
  FOREIGN KEY (store_id,variant_id) REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id,variant_id,current_version)
    REFERENCES saas.pricing_variant_policy_versions(store_id,variant_id,version) ON DELETE RESTRICT
);

CREATE TABLE saas.pricing_reference_operations (
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  operation_kind text NOT NULL CHECK (operation_kind IN ('define','save_set','activate','policy_save')),
  payload_fingerprint char(64) NOT NULL CHECK (payload_fingerprint~'^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=65536),
  committed_at timestamptz NOT NULL CHECK (pg_catalog.isfinite(committed_at)),
  UNIQUE (store_id,operation_id)
);

CREATE FUNCTION saas.pricing_reference_immutable_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $fn$
BEGIN
  RAISE EXCEPTION 'PRICING_REFERENCE_IMMUTABLE';
END $fn$;
CREATE TRIGGER pricing_reference_definitions_immutable BEFORE UPDATE OR DELETE ON saas.pricing_reference_definitions
  FOR EACH ROW EXECUTE FUNCTION saas.pricing_reference_immutable_guard();
CREATE TRIGGER pricing_reference_sets_immutable BEFORE UPDATE OR DELETE ON saas.pricing_reference_sets
  FOR EACH ROW EXECUTE FUNCTION saas.pricing_reference_immutable_guard();
CREATE TRIGGER pricing_reference_set_values_immutable BEFORE UPDATE OR DELETE ON saas.pricing_reference_set_values
  FOR EACH ROW EXECUTE FUNCTION saas.pricing_reference_immutable_guard();
CREATE TRIGGER pricing_variant_policy_versions_immutable BEFORE UPDATE OR DELETE ON saas.pricing_variant_policy_versions
  FOR EACH ROW EXECUTE FUNCTION saas.pricing_reference_immutable_guard();
CREATE TRIGGER pricing_reference_operations_immutable BEFORE UPDATE OR DELETE ON saas.pricing_reference_operations
  FOR EACH ROW EXECUTE FUNCTION saas.pricing_reference_immutable_guard();

ALTER TABLE saas.pricing_reference_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_reference_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_reference_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_reference_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_reference_set_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_reference_set_values FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_reference_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_reference_state FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_variant_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_variant_policy_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_variant_policy_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_variant_policy_state FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_reference_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_reference_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.pricing_reference_definitions,saas.pricing_reference_sets,
  saas.pricing_reference_set_values,saas.pricing_reference_state,
  saas.pricing_variant_policy_versions,saas.pricing_variant_policy_state,
  saas.pricing_reference_operations
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

CREATE FUNCTION saas.pricing_decimal_valid(p_text text,p_scale integer,p_positive boolean,p_max numeric)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $fn$
DECLARE v_value numeric; v_fraction text;
BEGIN
  IF p_text IS NULL OR p_scale IS NULL OR p_scale NOT BETWEEN 0 AND 8
    OR p_positive IS NULL OR p_max IS NULL OR pg_catalog.char_length(p_text) NOT BETWEEN 1 AND 40
    OR p_text!~'^(0|[1-9][0-9]*)(\.[0-9]+)?$' THEN RETURN false; END IF;
  v_fraction:=pg_catalog.split_part(p_text,'.',2);
  IF pg_catalog.char_length(v_fraction)>p_scale THEN RETURN false; END IF;
  v_value:=p_text::numeric;
  RETURN v_value<=p_max AND (NOT p_positive OR v_value>0);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $fn$;

CREATE FUNCTION saas.pricing_reference_scope_digest(p_store_id uuid,p_set_id uuid,p_now timestamptz)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'setId',p_set_id,
      'setVersion',(SELECT candidate.version FROM saas.pricing_reference_sets candidate WHERE candidate.store_id=p_store_id AND candidate.id=p_set_id),
      'activeStateVersion',(SELECT state.version FROM saas.pricing_reference_state state WHERE state.store_id=p_store_id),
      'policies',COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'variantId',variant.id,'variantVersion',variant.version,'policyVersion',policy.version,
          'referenceId',policy.reference_id,'method',policy.method,
          'overrides',COALESCE((
            SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'listId',list.id,'listVersion',list.version,'priceCents',item.price_cents,
              'channel',rule.channel,'priority',rule.priority,'startsAt',rule.starts_at,'endsAt',rule.ends_at,
              'tagId',rule.customer_tag_id) ORDER BY list.id,rule.id)
            FROM saas.price_lists list
            JOIN saas.price_list_items item ON item.store_id=list.store_id AND item.price_list_id=list.id
            JOIN saas.price_list_rules rule ON rule.store_id=list.store_id AND rule.price_list_id=list.id
            WHERE list.store_id=p_store_id AND list.status='active' AND item.variant_id=variant.id
              AND rule.starts_at<=p_now AND (rule.ends_at IS NULL OR p_now<rule.ends_at)
          ),'[]'::jsonb)
        ) ORDER BY variant.id)
        FROM saas.pricing_variant_policy_state state
        JOIN saas.pricing_variant_policy_versions policy
          ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id AND policy.version=state.current_version
        JOIN saas.product_variants variant ON variant.store_id=state.store_id AND variant.id=state.variant_id AND variant.status='active'
        JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'
        WHERE state.store_id=p_store_id AND policy.method<>'fixed_try'
      ),'[]'::jsonb)
    )::text,'UTF8')),'hex')
$fn$;

CREATE FUNCTION saas.pricing_calculate_variant_price(
  p_store_id uuid,p_variant_id uuid,p_set_id uuid
) RETURNS TABLE(outcome text,price_cents bigint,policy_version bigint,trace jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE
  selected_variant saas.product_variants%ROWTYPE;
  selected_policy saas.pricing_variant_policy_versions%ROWTYPE;
  selected_reference saas.pricing_reference_definitions%ROWTYPE;
  selected_value saas.pricing_reference_set_values%ROWTYPE;
  selected_set uuid;
  metal_component numeric; labor_component numeric; unit_try numeric; rounded numeric;
BEGIN
  SELECT variant.* INTO selected_variant FROM saas.product_variants variant
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id
    AND variant.status='active' AND product.status='active';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::bigint,NULL::bigint,NULL::jsonb; RETURN; END IF;
  SELECT policy.* INTO selected_policy FROM saas.pricing_variant_policy_state state
  JOIN saas.pricing_variant_policy_versions policy
    ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id AND policy.version=state.current_version
  WHERE state.store_id=p_store_id AND state.variant_id=p_variant_id;
  IF NOT FOUND OR selected_policy.method='fixed_try' THEN
    RETURN QUERY SELECT 'found',selected_variant.price_cents,
      CASE WHEN selected_policy.method='fixed_try' THEN selected_policy.version ELSE NULL::bigint END,
      pg_catalog.jsonb_build_object('method','fixed_try');
    RETURN;
  END IF;
  selected_set:=p_set_id;
  IF selected_set IS NULL THEN
    SELECT state.active_set_id INTO selected_set FROM saas.pricing_reference_state state WHERE state.store_id=p_store_id;
  END IF;
  SELECT definition.* INTO selected_reference FROM saas.pricing_reference_definitions definition
  WHERE definition.store_id=p_store_id AND definition.id=selected_policy.reference_id;
  IF NOT FOUND OR selected_reference.kind<>selected_policy.method THEN
    RETURN QUERY SELECT 'unavailable',NULL::bigint,selected_policy.version,NULL::jsonb; RETURN;
  END IF;
  SELECT value.* INTO selected_value FROM saas.pricing_reference_set_values value
  WHERE value.store_id=p_store_id AND value.set_id=selected_set AND value.reference_id=selected_policy.reference_id;
  IF NOT FOUND OR selected_value.active IS DISTINCT FROM true OR selected_value.rate_try IS NULL
    OR (selected_policy.method='gold_gram' AND selected_policy.purity_mode='ratio' AND selected_reference.reference_purity IS NULL) THEN
    RETURN QUERY SELECT 'unavailable',NULL::bigint,selected_policy.version,NULL::jsonb; RETURN;
  END IF;
  IF selected_policy.method='gold_gram' THEN
    metal_component:=selected_policy.metal_grams*selected_value.rate_try;
    IF selected_policy.purity_mode='ratio' THEN
      metal_component:=metal_component*selected_policy.product_purity/selected_reference.reference_purity;
    END IF;
  ELSE
    metal_component:=selected_policy.source_amount*selected_value.rate_try;
  END IF;
  labor_component:=CASE selected_policy.labor_mode
    WHEN 'per_item_try' THEN selected_policy.labor_amount
    WHEN 'per_gram_try' THEN selected_policy.metal_grams*selected_policy.labor_amount
    ELSE 0::numeric END;
  unit_try:=metal_component*(1+selected_policy.uplift_percent/100)+labor_component;
  IF unit_try<0 OR unit_try>80000000 THEN
    RETURN QUERY SELECT 'unavailable',NULL::bigint,selected_policy.version,NULL::jsonb; RETURN;
  END IF;
  rounded:=pg_catalog.round(unit_try*100,0);
  IF rounded NOT BETWEEN 0 AND 8000000000 THEN
    RETURN QUERY SELECT 'unavailable',NULL::bigint,selected_policy.version,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'found',rounded::bigint,selected_policy.version,
    pg_catalog.jsonb_build_object('method',selected_policy.method,'referenceId',selected_policy.reference_id,
      'setId',selected_set,'policyVersion',selected_policy.version,
      'componentTry',metal_component::text,'laborTry',labor_component::text);
END $fn$;

-- Fixed price-list overrides retain their historical priority. No stale base-price fallback exists
-- for an unavailable dynamic reference.
CREATE OR REPLACE FUNCTION saas.resolve_effective_variant_price(
  p_store_id uuid,p_variant_id uuid,p_channel text,p_now timestamptz,p_customer_email text DEFAULT NULL
) RETURNS TABLE(outcome text,price_cents bigint,source_kind text,price_list_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_customer uuid; selected_price bigint; selected_list uuid; base record;
BEGIN
  IF p_store_id IS NULL OR p_variant_id IS NULL OR p_channel IS NULL
    OR p_channel NOT IN ('storefront','quick_order') OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR (p_channel='storefront' AND p_customer_email IS NOT NULL)
    OR (p_customer_email IS NOT NULL AND (
      p_customer_email<>pg_catalog.btrim(p_customer_email)
      OR pg_catalog.char_length(p_customer_email) NOT BETWEEN 3 AND 320
      OR p_customer_email~'[[:cntrl:][:space:]]'
      OR p_customer_email!~'^[^@]+@[^@]+\.[^@]+$'
    )) THEN RETURN QUERY SELECT 'invalid_input',NULL::bigint,NULL::text,NULL::uuid; RETURN; END IF;
  IF p_channel='quick_order' AND p_customer_email IS NOT NULL THEN
    SELECT customer.id INTO selected_customer FROM saas.customers customer
    WHERE customer.store_id=p_store_id AND customer.email=pg_catalog.lower(p_customer_email) AND customer.status='active';
  END IF;
  SELECT item.price_cents,list.id INTO selected_price,selected_list
  FROM saas.price_lists list
  JOIN saas.price_list_items item ON item.store_id=list.store_id AND item.price_list_id=list.id
  JOIN saas.price_list_rules rule ON rule.store_id=list.store_id AND rule.price_list_id=list.id
  WHERE list.store_id=p_store_id AND list.status='active' AND item.variant_id=p_variant_id
    AND rule.channel=p_channel AND rule.starts_at<=p_now AND (rule.ends_at IS NULL OR p_now<rule.ends_at)
    AND (rule.customer_tag_id IS NULL OR (
      p_channel='quick_order' AND selected_customer IS NOT NULL AND EXISTS (
        SELECT 1 FROM saas.customer_tag_assignments assignment
        JOIN saas.customer_tags tag ON tag.store_id=assignment.store_id AND tag.id=assignment.tag_id AND tag.archived_at IS NULL
        WHERE assignment.store_id=p_store_id AND assignment.customer_id=selected_customer AND assignment.tag_id=rule.customer_tag_id
      )))
    AND EXISTS (SELECT 1 FROM saas.product_variants variant JOIN saas.products product
      ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'
      WHERE variant.store_id=p_store_id AND variant.id=p_variant_id AND variant.status='active')
  ORDER BY rule.priority DESC,rule.starts_at DESC,list.id LIMIT 1;
  IF selected_list IS NOT NULL THEN
    RETURN QUERY SELECT 'found',selected_price,'price_list',selected_list; RETURN;
  END IF;
  SELECT * INTO base FROM saas.pricing_calculate_variant_price(p_store_id,p_variant_id,NULL::uuid);
  RETURN QUERY SELECT base.outcome::text,base.price_cents::bigint,
    CASE WHEN base.outcome='found' THEN 'base'::text ELSE NULL::text END,NULL::uuid;
END $fn$;

CREATE FUNCTION saas.pricing_reference_definition_projection(p_store_id uuid,p_reference_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT pg_catalog.jsonb_build_object('id',definition.id,'kind',definition.kind,'label',definition.label,
    'createdAt',saas.pricing_json_timestamp(definition.created_at))
    || CASE WHEN definition.reference_purity IS NULL THEN '{}'::jsonb
      ELSE pg_catalog.jsonb_build_object('referencePurity',definition.reference_purity::text) END
  FROM saas.pricing_reference_definitions definition
  WHERE definition.store_id=p_store_id AND definition.id=p_reference_id
$fn$;

CREATE FUNCTION saas.pricing_reference_define(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,
  p_reference_id uuid,p_kind text,p_label text,p_reference_purity text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; prior saas.pricing_reference_operations%ROWTYPE; projected jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_reference_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_kind IS NULL OR p_kind NOT IN ('usd','eur','gold_gram')
    OR p_label IS NULL OR p_label<>pg_catalog.btrim(p_label)
    OR pg_catalog.char_length(p_label) NOT BETWEEN 1 AND 120 OR p_label~'[[:cntrl:]]'
    OR (p_kind<>'gold_gram' AND p_reference_purity IS NOT NULL)
    OR (p_reference_purity IS NOT NULL AND (NOT saas.pricing_decimal_valid(p_reference_purity,8,true,1::numeric))) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.pricing.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO prior FROM saas.pricing_reference_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='define'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
      CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='define'
        AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM saas.pricing_reference_definitions definition
      WHERE definition.store_id=p_store_id AND (definition.id=p_reference_id OR definition.kind=p_kind AND p_kind IN ('usd','eur'))) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF (SELECT pg_catalog.count(*) FROM saas.pricing_reference_definitions definition
      WHERE definition.store_id=p_store_id)>=100 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  INSERT INTO saas.pricing_reference_state(store_id) VALUES(p_store_id) ON CONFLICT (store_id) DO NOTHING;
  INSERT INTO saas.pricing_reference_definitions(id,store_id,kind,label,reference_purity,created_by,created_at)
  VALUES(p_reference_id,p_store_id,p_kind,p_label,p_reference_purity::numeric,p_principal_id,p_now);
  projected:=saas.pricing_reference_definition_projection(p_store_id,p_reference_id);
  INSERT INTO saas.pricing_reference_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,'define',p_fingerprint,projected,p_now);
  RETURN QUERY SELECT 'defined',projected;
END $fn$;

CREATE FUNCTION saas.pricing_reference_set_projection(p_store_id uuid,p_set_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT pg_catalog.jsonb_build_object(
    'setId',selected.id,'version',selected.version,'stateVersion',COALESCE(state.version,0),
    'isActive',state.active_set_id=selected.id,
    'createdAt',saas.pricing_json_timestamp(selected.created_at),
    'values',COALESCE((SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('referenceId',definition.id,'kind',definition.kind,
        'label',definition.label,'rateTry',CASE WHEN value.rate_try IS NULL THEN NULL ELSE value.rate_try::text END,
        'active',value.active)
        || CASE WHEN definition.reference_purity IS NULL THEN '{}'::jsonb
           ELSE pg_catalog.jsonb_build_object('referencePurity',definition.reference_purity::text) END
      ORDER BY definition.kind,definition.id)
      FROM saas.pricing_reference_set_values value JOIN saas.pricing_reference_definitions definition
        ON definition.store_id=value.store_id AND definition.id=value.reference_id
      WHERE value.store_id=selected.store_id AND value.set_id=selected.id),'[]'::jsonb))
  FROM saas.pricing_reference_sets selected
  LEFT JOIN saas.pricing_reference_state state ON state.store_id=selected.store_id
  WHERE selected.store_id=p_store_id AND selected.id=p_set_id
$fn$;

CREATE FUNCTION saas.pricing_reference_set_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,
  p_set_id uuid,p_expected_state_version bigint,p_values jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; prior saas.pricing_reference_operations%ROWTYPE;
  selected_state saas.pricing_reference_state%ROWTYPE; entry jsonb; reference_text text;
  seen uuid[]:='{}'::uuid[]; reference_id uuid; rate_text text; next_version bigint; projected jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_set_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_state_version IS NULL OR p_expected_state_version<0
    OR p_values IS NULL OR pg_catalog.jsonb_typeof(p_values)<>'array' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF pg_catalog.jsonb_array_length(p_values) NOT BETWEEN 1 AND 100 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_values) value LOOP
    IF pg_catalog.jsonb_typeof(entry)<>'object' OR entry - 'referenceId' - 'rateTry' - 'active'<>'{}'::jsonb
      OR NOT (entry ? 'referenceId' AND entry ? 'rateTry' AND entry ? 'active')
      OR pg_catalog.jsonb_typeof(entry->'referenceId')<>'string'
      OR pg_catalog.jsonb_typeof(entry->'active')<>'boolean'
      OR (entry->>'referenceId')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
    reference_text:=entry->>'referenceId'; reference_id:=reference_text::uuid;
    IF reference_id=ANY(seen) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    seen:=pg_catalog.array_append(seen,reference_id);
    rate_text:=entry->>'rateTry';
    IF (entry->>'active')::boolean AND NOT saas.pricing_decimal_valid(rate_text,8,true,9007199254740991::numeric)
      OR (entry->>'active')::boolean IS FALSE AND rate_text IS NOT NULL
        AND NOT saas.pricing_decimal_valid(rate_text,8,true,9007199254740991::numeric) THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
    IF rate_text IS NOT NULL AND pg_catalog.jsonb_typeof(entry->'rateTry')<>'string' THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
  END LOOP;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.pricing.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO prior FROM saas.pricing_reference_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='save_set'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
      CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='save_set'
        AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END;
    RETURN;
  END IF;
  INSERT INTO saas.pricing_reference_state(store_id) VALUES(p_store_id) ON CONFLICT (store_id) DO NOTHING;
  SELECT * INTO selected_state FROM saas.pricing_reference_state WHERE store_id=p_store_id FOR UPDATE;
  IF selected_state.version<>p_expected_state_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM saas.pricing_reference_sets existing WHERE existing.store_id=p_store_id AND existing.id=p_set_id)
    OR pg_catalog.cardinality(seen)<>(SELECT pg_catalog.count(*) FROM saas.pricing_reference_definitions WHERE store_id=p_store_id)
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(seen) input_id
      WHERE NOT EXISTS (SELECT 1 FROM saas.pricing_reference_definitions definition
        WHERE definition.store_id=p_store_id AND definition.id=input_id)) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  next_version:=selected_state.last_set_version+1;
  IF next_version>9007199254740991 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.pricing_reference_sets(id,store_id,version,created_by,created_at)
  VALUES(p_set_id,p_store_id,next_version,p_principal_id,p_now);
  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_values) value LOOP
    INSERT INTO saas.pricing_reference_set_values(store_id,set_id,reference_id,rate_try,active)
    VALUES(p_store_id,p_set_id,(entry->>'referenceId')::uuid,(entry->>'rateTry')::numeric,(entry->>'active')::boolean);
  END LOOP;
  UPDATE saas.pricing_reference_state SET last_set_version=next_version WHERE store_id=p_store_id;
  projected:=saas.pricing_reference_set_projection(p_store_id,p_set_id);
  INSERT INTO saas.pricing_reference_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,'save_set',p_fingerprint,projected,p_now);
  RETURN QUERY SELECT 'saved',projected;
END $fn$;

CREATE FUNCTION saas.pricing_variant_policy_valid(p_policy jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $fn$
DECLARE method text; selected_labor text; amount text; raw_cents text;
BEGIN
  IF p_policy IS NULL OR pg_catalog.jsonb_typeof(p_policy)<>'object'
    OR pg_catalog.pg_column_size(p_policy)>8192 THEN RETURN false; END IF;
  method:=p_policy->>'method';
  IF method='fixed_try' THEN
    raw_cents:=p_policy->>'fixedPriceCents';
    RETURN p_policy - ARRAY['method','fixedPriceCents']::text[]='{}'::jsonb
      AND pg_catalog.jsonb_typeof(p_policy->'fixedPriceCents')='number'
      AND raw_cents~'^(0|[1-9][0-9]*)$'
      AND pg_catalog.char_length(raw_cents)<=10 AND raw_cents::numeric<=8000000000;
  END IF;
  IF method NOT IN ('usd','eur','gold_gram') OR method IS NULL
    OR pg_catalog.jsonb_typeof(p_policy->'referenceId')<>'string'
    OR (p_policy->>'referenceId')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    OR NOT saas.pricing_decimal_valid(COALESCE(p_policy->>'upliftPercent','0'),8,false,9007199254740991::numeric)
    OR (p_policy ? 'upliftPercent' AND pg_catalog.jsonb_typeof(p_policy->'upliftPercent')<>'string')
  THEN RETURN false; END IF;
  selected_labor:=COALESCE(p_policy->>'laborMode','none');
  IF selected_labor NOT IN ('none','per_item_try','per_gram_try')
    OR (method<>'gold_gram' AND selected_labor='per_gram_try') THEN RETURN false; END IF;
  IF selected_labor='none' THEN
    IF p_policy ? 'laborAmount' THEN RETURN false; END IF;
  ELSE
    IF pg_catalog.jsonb_typeof(p_policy->'laborAmount')<>'string'
      OR NOT saas.pricing_decimal_valid(p_policy->>'laborAmount',8,false,9007199254740991::numeric)
    THEN RETURN false; END IF;
  END IF;
  IF method IN ('usd','eur') THEN
    RETURN p_policy - ARRAY['method','referenceId','sourceAmount','upliftPercent','laborMode','laborAmount']::text[]='{}'::jsonb
      AND pg_catalog.jsonb_typeof(p_policy->'sourceAmount')='string'
      AND saas.pricing_decimal_valid(p_policy->>'sourceAmount',8,false,9007199254740991::numeric);
  END IF;
  IF p_policy - ARRAY['method','referenceId','metalGrams','purityMode','productPurity',
      'laborMode','laborAmount','upliftPercent','allowFullDiscount']::text[]<>'{}'::jsonb
    OR pg_catalog.jsonb_typeof(p_policy->'metalGrams')<>'string'
    OR NOT saas.pricing_decimal_valid(p_policy->>'metalGrams',6,false,9007199254740991::numeric)
    OR p_policy->>'purityMode' NOT IN ('direct','ratio')
    OR (p_policy ? 'allowFullDiscount' AND pg_catalog.jsonb_typeof(p_policy->'allowFullDiscount')<>'boolean')
  THEN RETURN false; END IF;
  IF p_policy->>'purityMode'='direct' THEN RETURN NOT (p_policy ? 'productPurity'); END IF;
  RETURN pg_catalog.jsonb_typeof(p_policy->'productPurity')='string'
    AND saas.pricing_decimal_valid(p_policy->>'productPurity',8,true,1::numeric);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $fn$;

CREATE FUNCTION saas.pricing_variant_policy_projection(p_store_id uuid,p_variant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT pg_catalog.jsonb_build_object('variantId',variant.id,'variantVersion',variant.version,
    'version',policy.version,'policy',policy.policy_payload,
    'updatedAt',saas.pricing_json_timestamp(policy.created_at))
  FROM saas.pricing_variant_policy_state state
  JOIN saas.pricing_variant_policy_versions policy
    ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id AND policy.version=state.current_version
  JOIN saas.product_variants variant ON variant.store_id=state.store_id AND variant.id=state.variant_id
  WHERE state.store_id=p_store_id AND state.variant_id=p_variant_id
$fn$;

CREATE FUNCTION saas.pricing_variant_price_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_policy saas.pricing_variant_policy_versions%ROWTYPE;
BEGIN
  IF NEW.price_cents IS NOT DISTINCT FROM OLD.price_cents THEN RETURN NEW; END IF;
  SELECT policy.* INTO selected_policy FROM saas.pricing_variant_policy_state state
  JOIN saas.pricing_variant_policy_versions policy ON policy.store_id=state.store_id
    AND policy.variant_id=state.variant_id AND policy.version=state.current_version
  WHERE state.store_id=OLD.store_id AND state.variant_id=OLD.id;
  IF FOUND AND (selected_policy.method<>'fixed_try' OR NEW.price_cents IS DISTINCT FROM selected_policy.fixed_price_cents) THEN
    RAISE EXCEPTION 'PRICING_POLICY_PRICE_CONFLICT' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER product_variants_pricing_policy_guard BEFORE UPDATE OF price_cents ON saas.product_variants
  FOR EACH ROW EXECUTE FUNCTION saas.pricing_variant_price_write_guard();

CREATE FUNCTION saas.pricing_variant_policy_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,
  p_variant_id uuid,p_expected_variant_version bigint,p_expected_policy_version bigint,p_policy jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; prior saas.pricing_reference_operations%ROWTYPE;
  selected_variant saas.product_variants%ROWTYPE; selected_state saas.pricing_variant_policy_state%ROWTYPE;
  selected_reference saas.pricing_reference_definitions%ROWTYPE; selected_value saas.pricing_reference_set_values%ROWTYPE;
  method text; selected_labor text; next_policy_version bigint; projected jsonb;
  component numeric; labor_component numeric; estimated numeric;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_variant_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_variant_version IS NULL OR p_expected_variant_version<1
    OR p_expected_policy_version IS NULL OR p_expected_policy_version<0
    OR NOT saas.pricing_variant_policy_valid(p_policy) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.pricing.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO prior FROM saas.pricing_reference_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='policy_save'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
      CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='policy_save'
        AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END;
    RETURN;
  END IF;
  SELECT variant.* INTO selected_variant FROM saas.product_variants variant
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected_state FROM saas.pricing_variant_policy_state state
  WHERE state.store_id=p_store_id AND state.variant_id=p_variant_id FOR UPDATE;
  IF selected_variant.version<>p_expected_variant_version
    OR COALESCE(selected_state.current_version,0)<>p_expected_policy_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF selected_variant.version>=9007199254740991 OR p_expected_policy_version>=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  method:=p_policy->>'method'; selected_labor:=COALESCE(p_policy->>'laborMode','none');
  IF method<>'fixed_try' THEN
    SELECT definition.* INTO selected_reference FROM saas.pricing_reference_definitions definition
    WHERE definition.store_id=p_store_id AND definition.id=(p_policy->>'referenceId')::uuid;
    IF NOT FOUND OR selected_reference.kind<>method OR (method='gold_gram'
      AND p_policy->>'purityMode'='ratio' AND selected_reference.reference_purity IS NULL) THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
    SELECT value.* INTO selected_value FROM saas.pricing_reference_state state
    JOIN saas.pricing_reference_set_values value ON value.store_id=state.store_id
      AND value.set_id=state.active_set_id AND value.reference_id=selected_reference.id
    WHERE state.store_id=p_store_id;
    IF FOUND AND selected_value.active AND selected_value.rate_try IS NOT NULL THEN
      IF method='gold_gram' THEN
        component:=(p_policy->>'metalGrams')::numeric*selected_value.rate_try;
        IF p_policy->>'purityMode'='ratio' THEN
          component:=component*(p_policy->>'productPurity')::numeric/selected_reference.reference_purity;
        END IF;
      ELSE
        component:=(p_policy->>'sourceAmount')::numeric*selected_value.rate_try;
      END IF;
      labor_component:=CASE selected_labor
        WHEN 'per_item_try' THEN (p_policy->>'laborAmount')::numeric
        WHEN 'per_gram_try' THEN (p_policy->>'metalGrams')::numeric*(p_policy->>'laborAmount')::numeric
        ELSE 0::numeric END;
      estimated:=component*(1+COALESCE(p_policy->>'upliftPercent','0')::numeric/100)+labor_component;
      IF estimated<0 OR estimated>80000000 OR pg_catalog.round(estimated*100,0)>8000000000 THEN
        RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
      END IF;
    END IF;
  END IF;
  next_policy_version:=p_expected_policy_version+1;
  INSERT INTO saas.pricing_variant_policy_versions(store_id,variant_id,version,method,
    fixed_price_cents,source_amount,metal_grams,reference_id,purity_mode,product_purity,
    labor_mode,labor_amount,uplift_percent,allow_full_discount,policy_payload,created_by,created_at)
  VALUES(p_store_id,p_variant_id,next_policy_version,method,
    CASE WHEN method='fixed_try' THEN (p_policy->>'fixedPriceCents')::bigint ELSE NULL END,
    CASE WHEN method IN ('usd','eur') THEN (p_policy->>'sourceAmount')::numeric ELSE NULL END,
    CASE WHEN method='gold_gram' THEN (p_policy->>'metalGrams')::numeric ELSE NULL END,
    CASE WHEN method='fixed_try' THEN NULL ELSE (p_policy->>'referenceId')::uuid END,
    CASE WHEN method='gold_gram' THEN p_policy->>'purityMode' ELSE NULL END,
    CASE WHEN method='gold_gram' AND p_policy->>'purityMode'='ratio' THEN (p_policy->>'productPurity')::numeric ELSE NULL END,
    CASE WHEN method='fixed_try' THEN NULL ELSE selected_labor END,
    CASE WHEN method='fixed_try' THEN NULL ELSE COALESCE(p_policy->>'laborAmount','0')::numeric END,
    CASE WHEN method='fixed_try' THEN NULL ELSE COALESCE(p_policy->>'upliftPercent','0')::numeric END,
    CASE WHEN method='gold_gram' THEN COALESCE((p_policy->>'allowFullDiscount')::boolean,false) ELSE false END,
    p_policy,p_principal_id,p_now);
  INSERT INTO saas.pricing_variant_policy_state(store_id,variant_id,current_version)
  VALUES(p_store_id,p_variant_id,next_policy_version)
  ON CONFLICT (store_id,variant_id) DO UPDATE SET current_version=EXCLUDED.current_version;
  UPDATE saas.product_variants variant SET
    version=variant.version+1,
    updated_at=p_now,
    price_cents=CASE WHEN method='fixed_try' THEN (p_policy->>'fixedPriceCents')::bigint ELSE variant.price_cents END
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id;
  projected:=saas.pricing_variant_policy_projection(p_store_id,p_variant_id);
  INSERT INTO saas.pricing_reference_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,'policy_save',p_fingerprint,projected,p_now);
  RETURN QUERY SELECT 'policy_saved',projected;
END $fn$;

CREATE FUNCTION saas.pricing_reference_set_preview(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_set_id uuid,p_channel text,
  p_page_size integer,p_after_variant_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; selected_variant record; old_price record; candidate record;
  entries jsonb:='[]'::jsonb; seen_products uuid[]:='{}'::uuid[];
  affected_count bigint:=0; override_count bigint:=0; unavailable_count bigint:=0;
  page_count integer:=0; last_id uuid; has_more boolean:=false; is_override boolean;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_set_id IS NULL OR p_channel IS NULL OR p_channel NOT IN ('storefront','quick_order')
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.pricing_reference_sets selected
    WHERE selected.store_id=p_store_id AND selected.id=p_set_id) THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;
  FOR selected_variant IN
    SELECT variant.id,variant.product_id FROM saas.pricing_variant_policy_state state
    JOIN saas.pricing_variant_policy_versions policy
      ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id AND policy.version=state.current_version
    JOIN saas.product_variants variant ON variant.store_id=state.store_id AND variant.id=state.variant_id
    JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE state.store_id=p_store_id AND policy.method<>'fixed_try'
      AND variant.status='active' AND product.status='active'
    ORDER BY variant.id
  LOOP
    affected_count:=affected_count+1;
    IF NOT selected_variant.product_id=ANY(seen_products) THEN
      seen_products:=pg_catalog.array_append(seen_products,selected_variant.product_id);
    END IF;
    SELECT * INTO old_price FROM saas.resolve_effective_variant_price(
      p_store_id,selected_variant.id,p_channel,p_now,NULL::text);
    SELECT * INTO candidate FROM saas.pricing_calculate_variant_price(p_store_id,selected_variant.id,p_set_id);
    is_override:=COALESCE(old_price.source_kind='price_list',false);
    IF is_override THEN override_count:=override_count+1; END IF;
    IF candidate.outcome<>'found' THEN unavailable_count:=unavailable_count+1; END IF;
    IF p_after_variant_id IS NOT NULL AND selected_variant.id<=p_after_variant_id THEN CONTINUE; END IF;
    IF page_count>=p_page_size THEN has_more:=true; CONTINUE; END IF;
    entries:=entries||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'variantId',selected_variant.id,'productId',selected_variant.product_id,
      'oldPriceCents',CASE WHEN old_price.outcome='found' THEN old_price.price_cents ELSE NULL END,
      'newPriceCents',CASE WHEN is_override THEN old_price.price_cents
        WHEN candidate.outcome='found' THEN candidate.price_cents ELSE NULL END,
      'overriddenByPriceList',is_override));
    page_count:=page_count+1; last_id:=selected_variant.id;
  END LOOP;
  RETURN QUERY SELECT 'previewed',pg_catalog.jsonb_build_object(
    'setId',p_set_id,'scopeDigest',saas.pricing_reference_scope_digest(p_store_id,p_set_id,p_now),
    'affectedProducts',pg_catalog.cardinality(seen_products),'affectedVariants',affected_count,
    'fixedOverrideVariants',override_count,'unavailableVariants',unavailable_count,
    'entries',entries,'nextCursor',CASE WHEN has_more THEN last_id ELSE NULL::uuid END);
END $fn$;

CREATE FUNCTION saas.pricing_reference_set_activate(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,
  p_set_id uuid,p_expected_state_version bigint,p_expected_scope_digest text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; prior saas.pricing_reference_operations%ROWTYPE;
  selected_state saas.pricing_reference_state%ROWTYPE; selected_set saas.pricing_reference_sets%ROWTYPE;
  selected_variant record; candidate record; projected jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_set_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_state_version IS NULL OR p_expected_state_version<0
    OR p_expected_scope_digest IS NULL OR p_expected_scope_digest!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.pricing.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO prior FROM saas.pricing_reference_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='activate'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
      CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='activate'
        AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END;
    RETURN;
  END IF;
  SELECT * INTO selected_state FROM saas.pricing_reference_state WHERE store_id=p_store_id FOR UPDATE;
  IF NOT FOUND OR selected_state.version<>p_expected_state_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF selected_state.version>=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO selected_set FROM saas.pricing_reference_sets selected
  WHERE selected.store_id=p_store_id AND selected.id=p_set_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF;
  IF saas.pricing_reference_scope_digest(p_store_id,p_set_id,p_now) IS DISTINCT FROM p_expected_scope_digest THEN
    RETURN QUERY SELECT 'scope_conflict',NULL::jsonb; RETURN;
  END IF;
  -- A reference with no usable active value must never publish a stale cached base price.
  FOR selected_variant IN
    SELECT variant.id FROM saas.pricing_variant_policy_state state
    JOIN saas.pricing_variant_policy_versions policy ON policy.store_id=state.store_id
      AND policy.variant_id=state.variant_id AND policy.version=state.current_version
    JOIN saas.product_variants variant ON variant.store_id=state.store_id AND variant.id=state.variant_id AND variant.status='active'
    JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'
    WHERE state.store_id=p_store_id AND policy.method<>'fixed_try'
  LOOP
    SELECT * INTO candidate FROM saas.pricing_calculate_variant_price(p_store_id,selected_variant.id,p_set_id);
    IF candidate.outcome<>'found' THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
  END LOOP;
  UPDATE saas.pricing_reference_state SET active_set_id=p_set_id,version=version+1,updated_at=p_now
  WHERE store_id=p_store_id;
  projected:=pg_catalog.jsonb_build_object('setId',p_set_id,'version',selected_set.version,
    'stateVersion',selected_state.version+1,'activatedAt',saas.pricing_json_timestamp(p_now));
  INSERT INTO saas.pricing_reference_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,'activate',p_fingerprint,projected,p_now);
  RETURN QUERY SELECT 'activated',projected;
END $fn$;

CREATE FUNCTION saas.pricing_reference_definitions_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((
    SELECT pg_catalog.jsonb_agg(saas.pricing_reference_definition_projection(p_store_id,definition.id)
      ORDER BY definition.kind,definition.id)
    FROM saas.pricing_reference_definitions definition WHERE definition.store_id=p_store_id),'[]'::jsonb));
END $fn$;

CREATE FUNCTION saas.pricing_reference_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_set_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; selected_id uuid; projected jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  selected_id:=p_set_id;
  IF selected_id IS NULL THEN SELECT state.active_set_id INTO selected_id
    FROM saas.pricing_reference_state state WHERE state.store_id=p_store_id; END IF;
  projected:=saas.pricing_reference_set_projection(p_store_id,selected_id);
  RETURN QUERY SELECT CASE WHEN projected IS NULL THEN 'not_found' ELSE 'found' END,projected;
END $fn$;

CREATE FUNCTION saas.pricing_reference_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_page_size integer,p_after_set_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; selected_state saas.pricing_reference_state%ROWTYPE;
  items jsonb; has_more boolean; cursor_version bigint;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR (p_after_set_version IS NOT NULL AND p_after_set_version<1) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO selected_state FROM saas.pricing_reference_state state WHERE state.store_id=p_store_id;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'setId',page.id,'version',page.version,
    'createdAt',saas.pricing_json_timestamp(page.created_at),
    'isActive',page.id=selected_state.active_set_id) ORDER BY page.version DESC),'[]'::jsonb),
    MIN(page.version)
  INTO items,cursor_version
  FROM (SELECT selected.id,selected.version,selected.created_at
    FROM saas.pricing_reference_sets selected WHERE selected.store_id=p_store_id
      AND (p_after_set_version IS NULL OR selected.version<p_after_set_version)
    ORDER BY selected.version DESC LIMIT p_page_size) page;
  SELECT EXISTS(SELECT 1 FROM saas.pricing_reference_sets selected
    WHERE selected.store_id=p_store_id AND selected.version<cursor_version) INTO has_more;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object(
    'activeSetId',selected_state.active_set_id,'stateVersion',COALESCE(selected_state.version,0),
    'items',items,'nextCursor',CASE WHEN has_more THEN cursor_version ELSE NULL::bigint END);
END $fn$;

CREATE FUNCTION saas.pricing_variant_policy_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_variant_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; projected jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  projected:=saas.pricing_variant_policy_projection(p_store_id,p_variant_id);
  RETURN QUERY SELECT CASE WHEN projected IS NULL THEN 'not_found' ELSE 'found' END,projected;
END $fn$;

CREATE FUNCTION saas.pricing_reference_operation_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_operation_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; projected jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.jsonb_build_object('operationKind',operation.operation_kind,'result',operation.result_payload)
  INTO projected FROM saas.pricing_reference_operations operation
  WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id;
  RETURN QUERY SELECT CASE WHEN projected IS NULL THEN 'not_found' ELSE 'found' END,projected;
END $fn$;

-- The established merchant price-list preview has a strict base/effective equality
-- check. Its base now comes from the same dynamic calculator as the resolver.
CREATE OR REPLACE FUNCTION saas.pricing_preview(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_channel text,p_variant_ids uuid[]
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; expected_count integer; active_count integer;
  resolved_count integer; entries jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_channel IS NULL OR p_channel NOT IN ('storefront','quick_order')
    OR p_variant_ids IS NULL OR pg_catalog.array_ndims(p_variant_ids) IS DISTINCT FROM 1
    OR pg_catalog.array_lower(p_variant_ids,1) IS DISTINCT FROM 1
    OR pg_catalog.cardinality(p_variant_ids) NOT BETWEEN 1 AND 100
    OR pg_catalog.array_position(p_variant_ids,NULL) IS NOT NULL THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  expected_count:=pg_catalog.cardinality(p_variant_ids);
  IF (SELECT pg_catalog.count(DISTINCT variant_id)
      FROM pg_catalog.unnest(p_variant_ids) selected(variant_id))<>expected_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.count(*) INTO active_count FROM saas.product_variants variant
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
    AND product.status='active'
  WHERE variant.store_id=p_store_id AND variant.id=ANY(p_variant_ids) AND variant.status='active';
  IF active_count<>expected_count THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.count(*),pg_catalog.jsonb_agg(
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'variantId',selected.variant_id,'channel',p_channel,
      'basePriceCents',base.price_cents,'effectivePriceCents',resolved.price_cents,
      'sourceKind',resolved.source_kind,'priceListId',resolved.price_list_id
    )) ORDER BY selected.variant_id::text)
  INTO resolved_count,entries
  FROM pg_catalog.unnest(p_variant_ids) selected(variant_id)
  JOIN saas.product_variants variant ON variant.store_id=p_store_id AND variant.id=selected.variant_id
    AND variant.status='active'
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
    AND product.status='active'
  CROSS JOIN LATERAL saas.pricing_calculate_variant_price(p_store_id,selected.variant_id,NULL::uuid) base
  CROSS JOIN LATERAL saas.resolve_effective_variant_price(p_store_id,selected.variant_id,p_channel,p_now,NULL::text) resolved
  WHERE base.outcome='found' AND base.price_cents BETWEEN 0 AND 8000000000
    AND resolved.outcome='found' AND resolved.price_cents BETWEEN 0 AND 8000000000
    AND resolved.source_kind IN ('base','price_list')
    AND ((resolved.source_kind='base' AND resolved.price_list_id IS NULL
      AND resolved.price_cents=base.price_cents)
      OR (resolved.source_kind='price_list' AND resolved.price_list_id IS NOT NULL));
  IF resolved_count<>expected_count OR entries IS NULL THEN
    RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'previewed',pg_catalog.jsonb_build_object(
    'entries',entries,'asOf',saas.pricing_json_timestamp(p_now));
END $fn$;

REVOKE ALL ON FUNCTION saas.pricing_decimal_valid(text,integer,boolean,numeric),
  saas.pricing_reference_scope_digest(uuid,uuid,timestamptz),
  saas.pricing_calculate_variant_price(uuid,uuid,uuid),
  saas.pricing_reference_definition_projection(uuid,uuid),
  saas.pricing_reference_set_projection(uuid,uuid),
  saas.pricing_variant_policy_valid(jsonb),
  saas.pricing_variant_policy_projection(uuid,uuid),
  saas.pricing_reference_immutable_guard(),
  saas.pricing_variant_price_write_guard()
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
  celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.pricing_reference_define(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,text),
  saas.pricing_reference_set_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb),
  saas.pricing_reference_set_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,integer,uuid),
  saas.pricing_reference_set_activate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),
  saas.pricing_variant_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,jsonb),
  saas.pricing_reference_definitions_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.pricing_reference_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.pricing_reference_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer,bigint),
  saas.pricing_variant_policy_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.pricing_reference_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
  celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.pricing_reference_define(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,text),
  saas.pricing_reference_set_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb),
  saas.pricing_reference_set_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,integer,uuid),
  saas.pricing_reference_set_activate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),
  saas.pricing_variant_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,jsonb),
  saas.pricing_reference_definitions_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.pricing_reference_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.pricing_reference_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer,bigint),
  saas.pricing_variant_policy_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.pricing_reference_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)
TO celebix_saas_app;

COMMIT;
