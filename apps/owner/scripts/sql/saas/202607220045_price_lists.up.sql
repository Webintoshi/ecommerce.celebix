-- Versioned price lists and one shared effective-price authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.price_lists (
  id uuid,
  store_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  activated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT price_lists_pkey PRIMARY KEY (id),
  CONSTRAINT price_lists_store_id_key UNIQUE (store_id,id),
  CONSTRAINT price_lists_store_fk FOREIGN KEY (store_id)
    REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT price_lists_name_check CHECK (
    name=pg_catalog.btrim(name)
    AND pg_catalog.char_length(name) BETWEEN 1 AND 200
    AND name!~'[[:cntrl:]]'
  ),
  CONSTRAINT price_lists_status_check CHECK (
    status IN('draft','active','archived')
  ),
  CONSTRAINT price_lists_version_check CHECK (
    version BETWEEN 1 AND 9007199254740991
  ),
  CONSTRAINT price_lists_time_check CHECK (
    pg_catalog.isfinite(created_at)
    AND pg_catalog.isfinite(updated_at)
    AND updated_at>=created_at
    AND (activated_at IS NULL OR (
      pg_catalog.isfinite(activated_at)
      AND activated_at>=created_at
      AND updated_at>=activated_at
    ))
    AND (archived_at IS NULL OR (
      pg_catalog.isfinite(archived_at)
      AND archived_at>=created_at
      AND updated_at>=archived_at
    ))
  ),
  CONSTRAINT price_lists_lifecycle_check CHECK (
    (status='draft' AND activated_at IS NULL AND archived_at IS NULL)
    OR (status='active' AND activated_at IS NOT NULL AND archived_at IS NULL)
    OR (status='archived' AND archived_at IS NOT NULL
      AND (activated_at IS NULL OR archived_at>=activated_at))
  )
);

CREATE INDEX price_lists_store_list_idx
  ON saas.price_lists(store_id,updated_at DESC,id DESC);
CREATE INDEX price_lists_store_active_idx
  ON saas.price_lists(store_id,id) WHERE status='active';

CREATE TABLE saas.price_list_items (
  store_id uuid NOT NULL,
  price_list_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  price_cents bigint NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT price_list_items_pkey PRIMARY KEY (store_id,price_list_id,variant_id),
  CONSTRAINT price_list_items_list_store_fk
    FOREIGN KEY (store_id,price_list_id)
    REFERENCES saas.price_lists(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT price_list_items_variant_store_fk
    FOREIGN KEY (store_id,variant_id)
    REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT price_list_items_price_check CHECK (
    price_cents BETWEEN 0 AND 8000000000
  ),
  CONSTRAINT price_list_items_time_check CHECK (
    pg_catalog.isfinite(created_at)
  )
);

CREATE INDEX price_list_items_variant_idx
  ON saas.price_list_items(store_id,variant_id,price_list_id);

CREATE TABLE saas.price_list_rules (
  id uuid,
  store_id uuid NOT NULL,
  price_list_id uuid NOT NULL,
  channel text NOT NULL,
  customer_tag_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  priority integer NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT price_list_rules_pkey PRIMARY KEY (id),
  CONSTRAINT price_list_rules_store_id_key UNIQUE (store_id,id),
  CONSTRAINT price_list_rules_list_store_fk
    FOREIGN KEY (store_id,price_list_id)
    REFERENCES saas.price_lists(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT price_list_rules_tag_store_fk
    FOREIGN KEY (store_id,customer_tag_id)
    REFERENCES saas.customer_tags(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT price_list_rules_channel_check CHECK (
    channel IN('storefront','quick_order')
  ),
  CONSTRAINT price_list_rules_priority_check CHECK (
    priority BETWEEN 0 AND 1000
  ),
  CONSTRAINT price_list_rules_time_check CHECK (
    pg_catalog.isfinite(starts_at)
    AND (ends_at IS NULL OR (
      pg_catalog.isfinite(ends_at) AND ends_at>starts_at
    ))
    AND pg_catalog.isfinite(created_at)
  )
);

CREATE INDEX price_list_rules_lookup_idx
  ON saas.price_list_rules(
    store_id,channel,priority DESC,starts_at DESC,price_list_id,id
  );

CREATE TABLE saas.price_list_operations (
  operation_id uuid,
  store_id uuid NOT NULL,
  price_list_id uuid NOT NULL,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  CONSTRAINT price_list_operations_pkey PRIMARY KEY (operation_id),
  CONSTRAINT price_list_operations_store_id_key UNIQUE (store_id,operation_id),
  CONSTRAINT price_list_operations_list_store_fk
    FOREIGN KEY (store_id,price_list_id)
    REFERENCES saas.price_lists(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT price_list_operations_kind_check CHECK (
    operation_kind IN('save','activate','archive')
  ),
  CONSTRAINT price_list_operations_fingerprint_check CHECK (
    payload_fingerprint~'^[a-f0-9]{64}$'
  ),
  CONSTRAINT price_list_operations_result_check CHECK (
    pg_catalog.jsonb_typeof(result_payload)='object'
    AND pg_catalog.pg_column_size(result_payload)<=65536
  ),
  CONSTRAINT price_list_operations_time_check CHECK (
    pg_catalog.isfinite(committed_at)
  )
);

CREATE INDEX price_list_operations_store_committed_idx
  ON saas.price_list_operations(store_id,committed_at DESC,operation_id);

CREATE FUNCTION saas.guard_price_list_operation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $f$
BEGIN
  RAISE EXCEPTION 'PRICE_LIST_OPERATION_IMMUTABLE';
END
$f$;

CREATE TRIGGER price_list_operations_immutable
BEFORE UPDATE OR DELETE ON saas.price_list_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_price_list_operation_mutation();

ALTER TABLE saas.price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.price_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.price_list_items FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.price_list_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.price_list_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.price_list_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.price_list_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.price_lists,saas.price_list_items,saas.price_list_rules,
  saas.price_list_operations
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

CREATE FUNCTION saas.pricing_json_timestamp(p_value timestamptz)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT
SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.to_char(
    p_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  )
$f$;

CREATE FUNCTION saas.pricing_items_valid(p_store_id uuid,p_items jsonb)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,saas
AS $f$
DECLARE entry jsonb; variant_text text; price numeric;
BEGIN
  IF p_store_id IS NULL OR pg_catalog.jsonb_typeof(p_items)<>'array'
     OR pg_catalog.jsonb_array_length(p_items) NOT BETWEEN 1 AND 500 THEN
    RETURN false;
  END IF;
  IF (
    SELECT pg_catalog.count(DISTINCT value->>'variantId')
    FROM pg_catalog.jsonb_array_elements(p_items) value
  )<>pg_catalog.jsonb_array_length(p_items) THEN
    RETURN false;
  END IF;
  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    IF pg_catalog.jsonb_typeof(entry)<>'object'
       OR NOT entry ?& ARRAY['variantId','priceCents']
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(entry))<>2
       OR pg_catalog.jsonb_typeof(entry->'variantId')<>'string'
       OR pg_catalog.jsonb_typeof(entry->'priceCents')<>'number' THEN
      RETURN false;
    END IF;
    variant_text:=entry->>'variantId';
    price:=(entry->>'priceCents')::numeric;
    IF variant_text!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR price<>pg_catalog.trunc(price)
       OR price NOT BETWEEN 0 AND 8000000000
       OR NOT EXISTS(
         SELECT 1 FROM saas.product_variants variant
         JOIN saas.products product
           ON product.store_id=variant.store_id
          AND product.id=variant.product_id
          AND product.status='active'
         WHERE variant.store_id=p_store_id
           AND variant.id=variant_text::uuid
           AND variant.status='active'
       ) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range
    OR datetime_field_overflow THEN
    RETURN false;
END
$f$;

CREATE FUNCTION saas.pricing_rules_valid(
  p_store_id uuid,p_rules jsonb,p_now timestamptz
)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  entry jsonb;
  starts_text text;
  ends_text text;
  starts_at timestamptz;
  ends_at timestamptz;
  priority numeric;
  tag_text text;
BEGIN
  IF p_store_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
     OR pg_catalog.jsonb_typeof(p_rules)<>'array'
     OR pg_catalog.jsonb_array_length(p_rules) NOT BETWEEN 1 AND 100 THEN
    RETURN false;
  END IF;
  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rules) LOOP
    IF pg_catalog.jsonb_typeof(entry)<>'object'
       OR NOT entry ?& ARRAY['channel','priority']
       OR EXISTS(
         SELECT 1 FROM pg_catalog.jsonb_object_keys(entry) supplied
         WHERE supplied<>ALL(ARRAY[
           'channel','customerTagId','startsAt','endsAt','priority'
         ])
       )
       OR pg_catalog.jsonb_typeof(entry->'channel')<>'string'
       OR entry->>'channel' NOT IN('storefront','quick_order')
       OR pg_catalog.jsonb_typeof(entry->'priority')<>'number'
       OR (entry ? 'customerTagId'
         AND pg_catalog.jsonb_typeof(entry->'customerTagId')<>'string')
       OR (entry ? 'startsAt'
         AND pg_catalog.jsonb_typeof(entry->'startsAt')<>'string')
       OR (entry ? 'endsAt'
         AND entry->'endsAt' IS DISTINCT FROM 'null'::jsonb
         AND pg_catalog.jsonb_typeof(entry->'endsAt')<>'string') THEN
      RETURN false;
    END IF;
    priority:=(entry->>'priority')::numeric;
    IF entry ? 'startsAt' THEN
      starts_text:=entry->>'startsAt';
      IF starts_text IS NULL
         OR pg_catalog.char_length(starts_text) NOT IN(24,27)
         OR starts_text!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.](?:[0-9]{3}|[0-9]{6})Z$' THEN
        RETURN false;
      END IF;
      starts_at:=starts_text::timestamptz;
      IF starts_text<>pg_catalog.to_char(
        starts_at AT TIME ZONE 'UTC',
        CASE pg_catalog.char_length(starts_text)
          WHEN 24 THEN 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ELSE 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        END
      ) THEN
        RETURN false;
      END IF;
    ELSE
      starts_at:=p_now;
    END IF;
    IF entry ? 'endsAt' AND entry->'endsAt' IS DISTINCT FROM 'null'::jsonb THEN
      ends_text:=entry->>'endsAt';
      IF pg_catalog.char_length(ends_text) NOT IN(24,27)
         OR ends_text!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.](?:[0-9]{3}|[0-9]{6})Z$' THEN
        RETURN false;
      END IF;
      ends_at:=ends_text::timestamptz;
      IF ends_text<>pg_catalog.to_char(
        ends_at AT TIME ZONE 'UTC',
        CASE pg_catalog.char_length(ends_text)
          WHEN 24 THEN 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ELSE 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        END
      ) THEN
        RETURN false;
      END IF;
    ELSE
      ends_at:=NULL;
    END IF;
    IF priority<>pg_catalog.trunc(priority)
       OR priority NOT BETWEEN 0 AND 1000
       OR NOT pg_catalog.isfinite(starts_at)
       OR (ends_at IS NOT NULL
         AND (NOT pg_catalog.isfinite(ends_at) OR ends_at<=starts_at)) THEN
      RETURN false;
    END IF;
    IF entry ? 'customerTagId' THEN
      tag_text:=entry->>'customerTagId';
      IF tag_text!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR NOT EXISTS(
           SELECT 1 FROM saas.customer_tags tag
           WHERE tag.store_id=p_store_id
             AND tag.id=tag_text::uuid
             AND tag.archived_at IS NULL
         ) THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range
    OR datetime_field_overflow THEN
    RETURN false;
END
$f$;

CREATE FUNCTION saas.pricing_projection(p_store_id uuid,p_price_list_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',list.id,
    'name',list.name,
    'status',list.status,
    'items',(
      SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'variantId',item.variant_id,'priceCents',item.price_cents
        ) ORDER BY item.variant_id
      ),'[]'::jsonb)
      FROM saas.price_list_items item
      WHERE item.store_id=list.store_id AND item.price_list_id=list.id
    ),
    'rules',(
      SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'channel',rule.channel,
          'customerTagId',rule.customer_tag_id,
          'startsAt',saas.pricing_json_timestamp(rule.starts_at),
          'endsAt',CASE WHEN rule.ends_at IS NULL THEN NULL
            ELSE saas.pricing_json_timestamp(rule.ends_at) END,
          'priority',rule.priority
        )) ORDER BY
          rule.priority DESC,rule.starts_at,rule.channel,
          rule.customer_tag_id NULLS FIRST,rule.id
      ),'[]'::jsonb)
      FROM saas.price_list_rules rule
      WHERE rule.store_id=list.store_id AND rule.price_list_id=list.id
    ),
    'version',list.version,
    'createdAt',saas.pricing_json_timestamp(list.created_at),
    'updatedAt',saas.pricing_json_timestamp(list.updated_at),
    'activatedAt',CASE WHEN list.activated_at IS NULL THEN NULL
      ELSE saas.pricing_json_timestamp(list.activated_at) END,
    'archivedAt',CASE WHEN list.archived_at IS NULL THEN NULL
      ELSE saas.pricing_json_timestamp(list.archived_at) END
  ))
  FROM saas.price_lists list
  WHERE list.store_id=p_store_id AND list.id=p_price_list_id
$f$;

CREATE FUNCTION saas.pricing_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','pricing.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object(
    'items',COALESCE(pg_catalog.jsonb_agg(
      saas.pricing_projection(p_store_id,list.id)
      ORDER BY list.updated_at DESC,list.id DESC
    ),'[]'::jsonb)
  )
  FROM saas.price_lists list WHERE list.store_id=p_store_id;
END
$f$;

CREATE FUNCTION saas.pricing_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_price_list_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; projection jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','pricing.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  projection:=saas.pricing_projection(p_store_id,p_price_list_id);
  RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'not_found' ELSE 'found' END,
    projection;
END
$f$;

CREATE FUNCTION saas.pricing_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_price_list_id uuid,
  p_expected_version bigint,p_name text,p_items jsonb,p_rules jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.price_list_operations%ROWTYPE;
  current_list saas.price_lists%ROWTYPE;
  entry jsonb;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','pricing.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_price_list_id IS NULL
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name)
     OR pg_catalog.char_length(p_name) NOT BETWEEN 1 AND 200
     OR p_name~'[[:cntrl:]]'
     OR saas.pricing_items_valid(p_store_id,p_items) IS DISTINCT FROM true
     OR saas.pricing_rules_valid(p_store_id,p_rules,p_now) IS DISTINCT FROM true THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'saas.pricing.operation:'||p_operation_id::text,0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  SELECT * INTO operation FROM saas.price_list_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id=p_store_id
       AND operation.operation_kind='save'
       AND operation.price_list_id=p_price_list_id
       AND operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO current_list FROM saas.price_lists
  WHERE store_id=p_store_id AND id=p_price_list_id FOR UPDATE;
  IF FOUND THEN
    IF p_expected_version IS NULL OR current_list.version<>p_expected_version THEN
      RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
    END IF;
    IF current_list.status<>'draft' THEN
      RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
    END IF;
    IF current_list.version=9007199254740991 THEN
      RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
    END IF;
    IF p_now<current_list.updated_at THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
  ELSIF p_expected_version IS NOT NULL THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;

  BEGIN
    IF current_list.id IS NULL THEN
      INSERT INTO saas.price_lists(
        id,store_id,name,status,version,created_at,updated_at
      ) VALUES(
        p_price_list_id,p_store_id,p_name,'draft',1,p_now,p_now
      );
    ELSE
      UPDATE saas.price_lists SET
        name=p_name,version=version+1,updated_at=p_now
      WHERE store_id=p_store_id AND id=p_price_list_id;
      DELETE FROM saas.price_list_rules
      WHERE store_id=p_store_id AND price_list_id=p_price_list_id;
      DELETE FROM saas.price_list_items
      WHERE store_id=p_store_id AND price_list_id=p_price_list_id;
    END IF;
    INSERT INTO saas.price_list_items(
      store_id,price_list_id,variant_id,price_cents,created_at
    )
    SELECT p_store_id,p_price_list_id,
      (requested.value->>'variantId')::uuid,
      (requested.value->>'priceCents')::bigint,p_now
    FROM pg_catalog.jsonb_array_elements(p_items) requested(value);
    FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rules) LOOP
      INSERT INTO saas.price_list_rules(
        id,store_id,price_list_id,channel,customer_tag_id,
        starts_at,ends_at,priority,created_at
      ) VALUES(
        pg_catalog.gen_random_uuid(),p_store_id,p_price_list_id,entry->>'channel',
        CASE WHEN entry ? 'customerTagId'
          THEN (entry->>'customerTagId')::uuid ELSE NULL END,
        CASE WHEN entry ? 'startsAt'
          THEN (entry->>'startsAt')::timestamptz ELSE p_now END,
        CASE WHEN entry ? 'endsAt'
          THEN (entry->>'endsAt')::timestamptz ELSE NULL END,
        (entry->>'priority')::integer,p_now
      );
    END LOOP;
    projection:=saas.pricing_projection(p_store_id,p_price_list_id);
    INSERT INTO saas.price_list_operations(
      operation_id,store_id,price_list_id,operation_kind,
      payload_fingerprint,result_payload,committed_at
    ) VALUES(
      p_operation_id,p_store_id,p_price_list_id,'save',
      p_fingerprint,projection,p_now
    );
  EXCEPTION
    WHEN unique_violation OR check_violation OR foreign_key_violation
      OR invalid_text_representation OR numeric_value_out_of_range
      OR datetime_field_overflow THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'saved',projection;
END
$f$;

CREATE FUNCTION saas.pricing_activate(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_price_list_id uuid,
  p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.price_list_operations%ROWTYPE;
  current_list saas.price_lists%ROWTYPE;
  requested_count integer;
  locked_count integer;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','pricing.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_price_list_id IS NULL
     OR p_expected_version IS NULL
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'saas.pricing.operation:'||p_operation_id::text,0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  SELECT * INTO operation FROM saas.price_list_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id=p_store_id
       AND operation.operation_kind='activate'
       AND operation.price_list_id=p_price_list_id
       AND operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO current_list FROM saas.price_lists
  WHERE store_id=p_store_id AND id=p_price_list_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;
  IF current_list.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF current_list.status<>'draft' THEN
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
  END IF;
  IF current_list.version=9007199254740991 THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF p_now<current_list.updated_at THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM 1 FROM saas.price_lists list
  WHERE list.store_id=p_store_id AND list.status='active'
    AND EXISTS(
      SELECT 1
      FROM saas.price_list_items candidate_item
      JOIN saas.price_list_items active_item
        ON active_item.store_id=candidate_item.store_id
       AND active_item.variant_id=candidate_item.variant_id
       AND active_item.price_list_id=list.id
      JOIN saas.price_list_rules candidate_rule
        ON candidate_rule.store_id=candidate_item.store_id
       AND candidate_rule.price_list_id=candidate_item.price_list_id
      JOIN saas.price_list_rules active_rule
        ON active_rule.store_id=active_item.store_id
       AND active_rule.price_list_id=active_item.price_list_id
       AND active_rule.channel=candidate_rule.channel
       AND active_rule.customer_tag_id IS NOT DISTINCT FROM
         candidate_rule.customer_tag_id
       AND pg_catalog.tstzrange(
         active_rule.starts_at,active_rule.ends_at,'[)'
       ) && pg_catalog.tstzrange(
         candidate_rule.starts_at,candidate_rule.ends_at,'[)'
       )
      WHERE candidate_item.store_id=p_store_id
        AND candidate_item.price_list_id=p_price_list_id
    )
  ORDER BY list.id FOR UPDATE;

  SELECT pg_catalog.count(*)::integer INTO requested_count
  FROM saas.price_list_items
  WHERE store_id=p_store_id AND price_list_id=p_price_list_id;
  PERFORM 1 FROM saas.product_variants variant
  JOIN saas.products product
    ON product.store_id=variant.store_id
   AND product.id=variant.product_id
   AND product.status='active'
  WHERE variant.store_id=p_store_id
    AND variant.id IN(
      SELECT item.variant_id FROM saas.price_list_items item
      WHERE item.store_id=p_store_id AND item.price_list_id=p_price_list_id
    )
    AND variant.status='active'
  ORDER BY variant.id FOR UPDATE OF variant;
  GET DIAGNOSTICS locked_count=ROW_COUNT;
  IF requested_count=0 OR locked_count<>requested_count
     OR NOT EXISTS(
       SELECT 1 FROM saas.price_list_rules
       WHERE store_id=p_store_id AND price_list_id=p_price_list_id
     )
     OR EXISTS(
       SELECT 1 FROM saas.price_list_rules rule
       LEFT JOIN saas.customer_tags tag
         ON tag.store_id=rule.store_id AND tag.id=rule.customer_tag_id
       WHERE rule.store_id=p_store_id
         AND rule.price_list_id=p_price_list_id
         AND rule.customer_tag_id IS NOT NULL
         AND (tag.id IS NULL OR tag.archived_at IS NOT NULL)
     ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  IF EXISTS(
    SELECT 1 FROM saas.price_list_rules first_rule
    JOIN saas.price_list_rules second_rule
      ON second_rule.store_id=first_rule.store_id
     AND second_rule.price_list_id=first_rule.price_list_id
     AND second_rule.id>first_rule.id
     AND second_rule.channel=first_rule.channel
     AND second_rule.customer_tag_id IS NOT DISTINCT FROM
       first_rule.customer_tag_id
     AND second_rule.priority=first_rule.priority
     AND pg_catalog.tstzrange(
       second_rule.starts_at,second_rule.ends_at,'[)'
     ) && pg_catalog.tstzrange(
       first_rule.starts_at,first_rule.ends_at,'[)'
     )
    WHERE first_rule.store_id=p_store_id
      AND first_rule.price_list_id=p_price_list_id
  ) OR EXISTS(
    SELECT 1
    FROM saas.price_list_items candidate_item
    JOIN saas.price_list_items active_item
      ON active_item.store_id=candidate_item.store_id
     AND active_item.variant_id=candidate_item.variant_id
    JOIN saas.price_lists active_list
      ON active_list.store_id=active_item.store_id
     AND active_list.id=active_item.price_list_id
     AND active_list.status='active'
    JOIN saas.price_list_rules candidate_rule
      ON candidate_rule.store_id=candidate_item.store_id
     AND candidate_rule.price_list_id=candidate_item.price_list_id
    JOIN saas.price_list_rules active_rule
      ON active_rule.store_id=active_item.store_id
     AND active_rule.price_list_id=active_item.price_list_id
     AND active_rule.channel=candidate_rule.channel
     AND active_rule.customer_tag_id IS NOT DISTINCT FROM
       candidate_rule.customer_tag_id
     AND active_rule.priority=candidate_rule.priority
     AND pg_catalog.tstzrange(
       active_rule.starts_at,active_rule.ends_at,'[)'
     ) && pg_catalog.tstzrange(
       candidate_rule.starts_at,candidate_rule.ends_at,'[)'
     )
    WHERE candidate_item.store_id=p_store_id
      AND candidate_item.price_list_id=p_price_list_id
  ) THEN
    RETURN QUERY SELECT 'pricing_conflict',NULL::jsonb; RETURN;
  END IF;

  UPDATE saas.price_lists SET
    status='active',activated_at=p_now,version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_price_list_id;
  projection:=saas.pricing_projection(p_store_id,p_price_list_id);
  INSERT INTO saas.price_list_operations(
    operation_id,store_id,price_list_id,operation_kind,
    payload_fingerprint,result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,p_price_list_id,'activate',
    p_fingerprint,projection,p_now
  );
  RETURN QUERY SELECT 'activated',projection;
END
$f$;

CREATE FUNCTION saas.pricing_archive(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_price_list_id uuid,
  p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.price_list_operations%ROWTYPE;
  current_list saas.price_lists%ROWTYPE;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','pricing.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_price_list_id IS NULL
     OR p_expected_version IS NULL
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'saas.pricing.operation:'||p_operation_id::text,0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  SELECT * INTO operation FROM saas.price_list_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id=p_store_id
       AND operation.operation_kind='archive'
       AND operation.price_list_id=p_price_list_id
       AND operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;
  SELECT * INTO current_list FROM saas.price_lists
  WHERE store_id=p_store_id AND id=p_price_list_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;
  IF current_list.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF current_list.status NOT IN('draft','active') THEN
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
  END IF;
  IF current_list.version=9007199254740991 THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF p_now<current_list.updated_at THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.price_lists SET
    status='archived',archived_at=p_now,version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_price_list_id;
  projection:=saas.pricing_projection(p_store_id,p_price_list_id);
  INSERT INTO saas.price_list_operations(
    operation_id,store_id,price_list_id,operation_kind,
    payload_fingerprint,result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,p_price_list_id,'archive',
    p_fingerprint,projection,p_now
  );
  RETURN QUERY SELECT 'archived',projection;
END
$f$;

CREATE FUNCTION saas.pricing_recover_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; operation saas.price_list_operations%ROWTYPE;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','pricing.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_fingerprint IS NULL
     OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO operation FROM saas.price_list_operations
  WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'operation_not_found',NULL::jsonb; RETURN;
  END IF;
  IF operation.payload_fingerprint<>p_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
END
$f$;

CREATE FUNCTION saas.resolve_effective_variant_price(
  p_store_id uuid,
  p_variant_id uuid,
  p_channel text,
  p_now timestamptz,
  p_customer_email text DEFAULT NULL
) RETURNS TABLE(
  outcome text,price_cents bigint,source_kind text,price_list_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  selected_customer uuid;
  selected_price bigint;
  selected_list uuid;
  base_price bigint;
BEGIN
  IF p_store_id IS NULL OR p_variant_id IS NULL
     OR p_channel IS NULL OR p_channel NOT IN('storefront','quick_order')
     OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
     OR (p_channel='storefront' AND p_customer_email IS NOT NULL)
     OR (p_customer_email IS NOT NULL AND (
       p_customer_email<>pg_catalog.btrim(p_customer_email)
       OR pg_catalog.char_length(p_customer_email) NOT BETWEEN 3 AND 320
       OR p_customer_email~'[[:cntrl:][:space:]]'
       OR p_customer_email!~'^[^@]+@[^@]+\.[^@]+$'
     )) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::bigint,NULL::text,NULL::uuid;
    RETURN;
  END IF;
  IF p_channel='quick_order' AND p_customer_email IS NOT NULL THEN
    SELECT customer.id INTO selected_customer
    FROM saas.customers customer
    WHERE customer.store_id=p_store_id
      AND customer.email=pg_catalog.lower(p_customer_email)
      AND customer.status='active';
  END IF;
  SELECT item.price_cents,list.id
  INTO selected_price,selected_list
  FROM saas.price_lists list
  JOIN saas.price_list_items item
    ON item.store_id=list.store_id AND item.price_list_id=list.id
  JOIN saas.price_list_rules rule
    ON rule.store_id=list.store_id AND rule.price_list_id=list.id
  WHERE list.store_id=p_store_id
    AND list.status='active'
    AND item.variant_id=p_variant_id
    AND rule.channel=p_channel
    AND rule.starts_at<=p_now
    AND (rule.ends_at IS NULL OR p_now<rule.ends_at)
    AND (
      rule.customer_tag_id IS NULL
      OR (
        p_channel='quick_order'
        AND selected_customer IS NOT NULL
        AND EXISTS(
          SELECT 1
          FROM saas.customer_tag_assignments assignment
          JOIN saas.customer_tags tag
            ON tag.store_id=assignment.store_id
           AND tag.id=assignment.tag_id
           AND tag.archived_at IS NULL
          WHERE assignment.store_id=p_store_id
            AND assignment.customer_id=selected_customer
            AND assignment.tag_id=rule.customer_tag_id
        )
      )
    )
    AND EXISTS(
      SELECT 1 FROM saas.product_variants variant
      JOIN saas.products product
        ON product.store_id=variant.store_id
       AND product.id=variant.product_id
       AND product.status='active'
      WHERE variant.store_id=p_store_id
        AND variant.id=p_variant_id
        AND variant.status='active'
    )
  ORDER BY rule.priority DESC,rule.starts_at DESC,list.id
  LIMIT 1;
  IF selected_list IS NOT NULL THEN
    RETURN QUERY SELECT 'found',selected_price,'price_list',selected_list;
    RETURN;
  END IF;
  SELECT variant.price_cents INTO base_price
  FROM saas.product_variants variant
  JOIN saas.products product
    ON product.store_id=variant.store_id
   AND product.id=variant.product_id
   AND product.status='active'
  WHERE variant.store_id=p_store_id
    AND variant.id=p_variant_id
    AND variant.status='active';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found',NULL::bigint,NULL::text,NULL::uuid;
  ELSIF base_price NOT BETWEEN 0 AND 8000000000 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::bigint,NULL::text,NULL::uuid;
  ELSE
    RETURN QUERY SELECT 'found',base_price,'base',NULL::uuid;
  END IF;
END
$f$;

-- Public list reads resolve every active variant with server-owned storefront context.
CREATE OR REPLACE FUNCTION saas.public_list_products(
  p_store_id uuid,p_hostname text,p_now timestamptz,p_limit integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 48 THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN
    RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY
  SELECT 'found'::text,COALESCE(pg_catalog.jsonb_agg(
    item.payload ORDER BY item.created_at DESC,item.id DESC
  ),'[]'::jsonb)
  FROM (
    SELECT product.id,product.created_at,(
      WITH resolved_variants AS (
        SELECT variant.*,resolved.price_cents AS effective_price
        FROM saas.product_variants variant
        CROSS JOIN LATERAL saas.resolve_effective_variant_price(
          p_store_id,variant.id,'storefront',p_now,NULL
        ) resolved
        WHERE variant.store_id=p_store_id
          AND variant.product_id=product.id
          AND variant.status='active'
          AND resolved.outcome='found'
      ), selected_price AS (
        SELECT * FROM resolved_variants
        ORDER BY effective_price,created_at,id LIMIT 1
      ), variants AS (
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(
          pg_catalog.jsonb_build_object(
            'id',variant.id,'title',variant.title,'sku',variant.sku,
            'priceCents',variant.effective_price,
            'compareAtCents',variant.compare_at_cents,
            'stockTracking',variant.stock_tracking,
            'stockQuantity',variant.stock_quantity,
            'available',(NOT variant.stock_tracking OR variant.stock_quantity>0),
            'attributes',variant.attributes
          )
        ) ORDER BY variant.created_at,variant.id) payload
        FROM resolved_variants variant
      ), media AS (
        SELECT COALESCE(pg_catalog.jsonb_agg(
          saas.public_media_projection(media.id)
          ORDER BY media.sort_order,media.id
        ),'[]'::jsonb) payload
        FROM saas.product_media media
        WHERE media.store_id=p_store_id
          AND media.product_id=product.id AND media.status='active'
      )
      SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id',product.id,'slug',product.slug,'title',product.title,
        'description',product.description,'currency',product.currency,
        'status','active','priceCents',selected_price.effective_price,
        'compareAtCents',selected_price.compare_at_cents,
        'available',EXISTS(
          SELECT 1 FROM resolved_variants available
          WHERE NOT available.stock_tracking OR available.stock_quantity>0
        ),
        'variants',variants.payload,'media',media.payload
      ))
      FROM selected_price CROSS JOIN variants CROSS JOIN media
    ) payload
    FROM saas.products product
    WHERE product.store_id=p_store_id AND product.status='active'
    ORDER BY product.created_at DESC,product.id DESC
    LIMIT p_limit
  ) item
  WHERE item.payload IS NOT NULL;
END
$function$;

CREATE OR REPLACE FUNCTION saas.public_get_product_by_slug(
  p_store_id uuid,p_hostname text,p_now timestamptz,p_slug text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE projection jsonb;
BEGIN
  IF p_slug IS NULL OR p_slug<>pg_catalog.lower(p_slug)
     OR pg_catalog.char_length(p_slug) NOT BETWEEN 3 AND 100
     OR p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN
    RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT (
    WITH resolved_variants AS (
      SELECT variant.*,resolved.price_cents AS effective_price
      FROM saas.product_variants variant
      CROSS JOIN LATERAL saas.resolve_effective_variant_price(
        p_store_id,variant.id,'storefront',p_now,NULL
      ) resolved
      WHERE variant.store_id=p_store_id
        AND variant.product_id=product.id
        AND variant.status='active'
        AND resolved.outcome='found'
    ), selected_price AS (
      SELECT * FROM resolved_variants
      ORDER BY effective_price,created_at,id LIMIT 1
    ), variants AS (
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
          'id',variant.id,'title',variant.title,'sku',variant.sku,
          'priceCents',variant.effective_price,
          'compareAtCents',variant.compare_at_cents,
          'stockTracking',variant.stock_tracking,
          'stockQuantity',variant.stock_quantity,
          'available',(NOT variant.stock_tracking OR variant.stock_quantity>0),
          'attributes',variant.attributes
        )
      ) ORDER BY variant.created_at,variant.id) payload
      FROM resolved_variants variant
    ), media AS (
      SELECT COALESCE(pg_catalog.jsonb_agg(
        saas.public_media_projection(media.id)
        ORDER BY media.sort_order,media.id
      ),'[]'::jsonb) payload
      FROM saas.product_media media
      WHERE media.store_id=p_store_id
        AND media.product_id=product.id AND media.status='active'
    )
    SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'id',product.id,'slug',product.slug,'title',product.title,
      'description',product.description,'currency',product.currency,
      'status','active','priceCents',selected_price.effective_price,
      'compareAtCents',selected_price.compare_at_cents,
      'available',EXISTS(
        SELECT 1 FROM resolved_variants available
        WHERE NOT available.stock_tracking OR available.stock_quantity>0
      ),
      'variants',variants.payload,'media',media.payload
    ))
    FROM selected_price CROSS JOIN variants CROSS JOIN media
  ) INTO projection
  FROM saas.products product
  WHERE product.store_id=p_store_id
    AND product.slug=p_slug AND product.status='active';
  RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'not_found' ELSE 'found' END,
    projection;
END
$function$;

DO $quick_reader_patch$
DECLARE
  create_target regprocedure:=
    'saas.quick_links_create_025(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)'::regprocedure;
  duplicate_target regprocedure:=
    'saas.quick_links_duplicate_025(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid,uuid[],text,text,jsonb,uuid,text)'::regprocedure;
  definition text;
  patched text;
  old_fragment text;
  new_fragment text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(create_target) INTO definition;
  old_fragment:=$old$
    SELECT product.id,product.title,variant.title,variant.sku,variant.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants AS variant
    JOIN saas.products AS product
      ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE variant.store_id=p_store_id AND variant.id=p_variant_ids[item_position]
      AND variant.status='active' AND product.status='active';$old$;
  new_fragment:=$new$
    SELECT product.id,product.title,variant.title,variant.sku,resolved.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants AS variant
    JOIN saas.products AS product
      ON product.store_id=variant.store_id AND product.id=variant.product_id
    CROSS JOIN LATERAL saas.resolve_effective_variant_price(
      p_store_id,variant.id,'quick_order',p_now,p_customer_email
    ) AS resolved
    WHERE variant.store_id=p_store_id AND variant.id=p_variant_ids[item_position]
      AND variant.status='active' AND product.status='active'
      AND resolved.outcome='found';$new$;
  IF (
    pg_catalog.length(definition)-pg_catalog.length(
      pg_catalog.replace(definition,old_fragment,'')
    )
  )/pg_catalog.length(old_fragment)<>1 THEN
    RAISE EXCEPTION 'PRICE_LIST_READER_PATCH_DRIFT';
  END IF;
  patched:=pg_catalog.replace(definition,old_fragment,new_fragment);
  EXECUTE patched;

  SELECT pg_catalog.pg_get_functiondef(duplicate_target) INTO definition;
  old_fragment:=$old$
    SELECT product.id,product.title,variant.title,variant.sku,variant.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants AS variant
    JOIN saas.products AS product ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE variant.store_id=p_store_id AND variant.id=source_item.variant_id
      AND product.id=source_item.product_id AND variant.status='active' AND product.status='active';$old$;
  new_fragment:=$new$
    SELECT product.id,product.title,variant.title,variant.sku,resolved.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants AS variant
    JOIN saas.products AS product ON product.store_id=variant.store_id AND product.id=variant.product_id
    CROSS JOIN LATERAL saas.resolve_effective_variant_price(
      p_store_id,variant.id,'quick_order',p_now,source_link.customer_email
    ) AS resolved
    WHERE variant.store_id=p_store_id AND variant.id=source_item.variant_id
      AND product.id=source_item.product_id AND variant.status='active' AND product.status='active'
      AND resolved.outcome='found';$new$;
  IF (
    pg_catalog.length(definition)-pg_catalog.length(
      pg_catalog.replace(definition,old_fragment,'')
    )
  )/pg_catalog.length(old_fragment)<>1 THEN
    RAISE EXCEPTION 'PRICE_LIST_READER_PATCH_DRIFT';
  END IF;
  patched:=pg_catalog.replace(definition,old_fragment,new_fragment);
  EXECUTE patched;
END
$quick_reader_patch$;

CREATE OR REPLACE FUNCTION saas.quick_links_create(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_link_id uuid,p_item_ids uuid[],p_variant_ids uuid[],p_quantities bigint[],
  p_provider_config_id uuid,p_customer_name text,p_customer_email text,
  p_customer_phone text,p_shipping_address jsonb,p_billing_address jsonb,
  p_customer_note text,p_internal_label text,p_shipping_cents bigint,
  p_discount_cents bigint,p_expiry_hours bigint,p_token_digest text,
  p_token_key_id text,p_sealed_token jsonb,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  IF saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.stores store
    WHERE store.id=p_store_id AND store.status='active' AND store.currency='TRY'
  ) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  -- The live reader names the resolver without changing migration-027's
  -- validation/replay ordering; the delegated 025 body below persists its result.
  PERFORM resolved.outcome
  FROM pg_catalog.unnest(p_variant_ids) requested(variant_id)
  CROSS JOIN LATERAL saas.resolve_effective_variant_price(
    p_store_id,requested.variant_id,'quick_order',p_now,p_customer_email
  ) resolved;
  RETURN QUERY SELECT delegated.outcome,delegated.result_payload
  FROM saas.quick_links_create_025(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,p_link_id,p_item_ids,p_variant_ids,p_quantities,
    p_provider_config_id,p_customer_name,p_customer_email,p_customer_phone,
    p_shipping_address,p_billing_address,p_customer_note,p_internal_label,
    p_shipping_cents,p_discount_cents,p_expiry_hours,p_token_digest,
    p_token_key_id,p_sealed_token,p_operation_id,p_fingerprint
  ) delegated;
END
$function$;

CREATE OR REPLACE FUNCTION saas.quick_links_duplicate(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_source_link_id uuid,p_link_id uuid,p_item_ids uuid[],p_token_digest text,
  p_token_key_id text,p_sealed_token jsonb,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  IF saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.quick_order_links link
    WHERE link.store_id=p_store_id
      AND link.id=p_source_link_id AND link.currency='TRY'
  ) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  -- Preserve the public wrapper's existing result ordering; the delegated body
  -- re-resolves each source item before writing its immutable duplicate snapshot.
  PERFORM resolved.outcome
  FROM saas.quick_order_link_items item
  JOIN saas.quick_order_links link
    ON link.store_id=item.store_id AND link.id=item.quick_order_link_id
  CROSS JOIN LATERAL saas.resolve_effective_variant_price(
    p_store_id,item.variant_id,'quick_order',p_now,link.customer_email
  ) resolved
  WHERE item.store_id=p_store_id
    AND item.quick_order_link_id=p_source_link_id;
  RETURN QUERY SELECT delegated.outcome,delegated.result_payload
  FROM saas.quick_links_duplicate_025(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,p_source_link_id,p_link_id,p_item_ids,p_token_digest,
    p_token_key_id,p_sealed_token,p_operation_id,p_fingerprint
  ) delegated;
END
$function$;

CREATE OR REPLACE FUNCTION saas.abandoned_carts_capture(
  p_hostname text,p_cart_id uuid,p_credential_digest text,p_now timestamptz,
  p_customer jsonb,p_items jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  selected_store uuid;
  selected_currency text;
  selected_cart saas.abandoned_carts%ROWTYPE;
  subtotal bigint;
  selected_outcome text;
  requested_count integer;
  resolved_count integer;
BEGIN
  selected_store:=saas.abandoned_cart_capture_store(p_hostname,p_now);
  IF selected_store IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN;
  END IF;
  IF p_cart_id IS NULL OR p_credential_digest!~'^[a-f0-9]{64}$'
     OR NOT saas.abandoned_cart_capture_customer_valid(p_customer)
     OR NOT saas.abandoned_cart_capture_items_valid(selected_store,p_items) THEN
    RETURN QUERY SELECT CASE
      WHEN saas.abandoned_cart_capture_items_valid(selected_store,p_items)
      THEN 'invalid_input' ELSE 'catalog_item_unavailable' END,NULL::jsonb;
    RETURN;
  END IF;
  requested_count:=pg_catalog.jsonb_array_length(p_items);
  SELECT pg_catalog.count(*)::integer,
    pg_catalog.sum(resolved.price_cents*(entry.value->>'quantity')::bigint)
  INTO resolved_count,subtotal
  FROM pg_catalog.jsonb_array_elements(p_items) entry(value)
  JOIN saas.product_variants variant
    ON variant.id=(entry.value->>'variantId')::uuid
   AND variant.store_id=selected_store
  CROSS JOIN LATERAL saas.resolve_effective_variant_price(
    selected_store,variant.id,'storefront',p_now,NULL
  ) resolved
  WHERE resolved.outcome='found';
  IF resolved_count<>requested_count OR subtotal NOT BETWEEN 0 AND 9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT store.currency INTO selected_currency
  FROM saas.stores store WHERE store.id=selected_store;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      selected_store::text||':'||p_credential_digest,0
    )
  );
  SELECT * INTO selected_cart FROM saas.abandoned_carts
  WHERE store_id=selected_store AND public_cart_digest=p_credential_digest
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO saas.abandoned_carts(
      id,store_id,public_cart_digest,status,customer_name,customer_email,
      customer_phone,currency,subtotal_cents,discount_cents,total_cents,
      checkout_started_at,last_activity_at,version,created_at,updated_at
    ) VALUES(
      p_cart_id,selected_store,p_credential_digest,'active',
      p_customer->>'name',p_customer->>'email',p_customer->>'phone',
      selected_currency,subtotal,0,subtotal,p_now,p_now,1,p_now,p_now
    );
    selected_outcome:='captured';
  ELSIF selected_cart.status='active' THEN
    UPDATE saas.abandoned_carts SET
      customer_name=p_customer->>'name',customer_email=p_customer->>'email',
      customer_phone=p_customer->>'phone',subtotal_cents=subtotal,
      discount_cents=0,total_cents=subtotal,last_activity_at=p_now,
      updated_at=p_now,version=version+1
    WHERE store_id=selected_store AND id=selected_cart.id;
    p_cart_id:=selected_cart.id; selected_outcome:='captured';
  ELSIF selected_cart.status='abandoned' THEN
    UPDATE saas.abandoned_carts SET
      status='recovered',recovered_at=p_now,
      customer_name=p_customer->>'name',customer_email=p_customer->>'email',
      customer_phone=p_customer->>'phone',subtotal_cents=subtotal,
      discount_cents=0,total_cents=subtotal,last_activity_at=p_now,
      updated_at=p_now,version=version+1
    WHERE store_id=selected_store AND id=selected_cart.id;
    p_cart_id:=selected_cart.id; selected_outcome:='recovered';
  ELSE
    RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN;
  END IF;
  DELETE FROM saas.abandoned_cart_items
  WHERE store_id=selected_store AND cart_id=p_cart_id;
  INSERT INTO saas.abandoned_cart_items(
    id,store_id,cart_id,product_id,variant_id,position,product_name,
    variant_name,sku,image_url,unit_price_cents,quantity,discount_cents,
    line_total_cents,created_at
  )
  SELECT pg_catalog.gen_random_uuid(),selected_store,p_cart_id,
    product.id,variant.id,entry.ordinality-1,product.title,variant.title,
    variant.sku,(
      SELECT media.public_url FROM saas.product_media media
      WHERE media.store_id=selected_store AND media.product_id=product.id
        AND media.status='active'
        AND (media.variant_id=variant.id OR media.variant_id IS NULL)
      ORDER BY (media.variant_id=variant.id) DESC NULLS LAST,
        media.sort_order,media.id LIMIT 1
    ),resolved.price_cents,(entry.value->>'quantity')::integer,0,
    resolved.price_cents*(entry.value->>'quantity')::integer,p_now
  FROM pg_catalog.jsonb_array_elements(p_items)
    WITH ORDINALITY entry(value,ordinality)
  JOIN saas.products product
    ON product.id=(entry.value->>'productId')::uuid
   AND product.store_id=selected_store
  JOIN saas.product_variants variant
    ON variant.id=(entry.value->>'variantId')::uuid
   AND variant.product_id=product.id AND variant.store_id=selected_store
  CROSS JOIN LATERAL saas.resolve_effective_variant_price(
    selected_store,variant.id,'storefront',p_now,NULL
  ) resolved
  WHERE resolved.outcome='found'
  ORDER BY entry.ordinality;
  RETURN QUERY SELECT selected_outcome,
    saas.abandoned_cart_capture_projection(selected_store,p_cart_id);
END
$function$;

REVOKE ALL ON FUNCTION
  saas.guard_price_list_operation_mutation(),
  saas.pricing_json_timestamp(timestamptz),
  saas.pricing_items_valid(uuid,jsonb),
  saas.pricing_rules_valid(uuid,jsonb,timestamptz),
  saas.pricing_projection(uuid,uuid),
  saas.pricing_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.pricing_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.pricing_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb,jsonb),
  saas.pricing_activate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.pricing_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.pricing_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),
  saas.resolve_effective_variant_price(uuid,uuid,text,timestamptz,text)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

GRANT EXECUTE ON FUNCTION
  saas.pricing_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.pricing_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.pricing_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb,jsonb),
  saas.pricing_activate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.pricing_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.pricing_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
TO celebix_saas_app;

GRANT EXECUTE ON FUNCTION
  saas.resolve_effective_variant_price(uuid,uuid,text,timestamptz,text)
TO celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;

REVOKE ALL ON FUNCTION
  saas.public_list_products(uuid,text,timestamptz,integer),
  saas.public_get_product_by_slug(uuid,text,timestamptz,text)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION
  saas.public_list_products(uuid,text,timestamptz,integer),
  saas.public_get_product_by_slug(uuid,text,timestamptz,text)
TO celebix_saas_host_resolver;

REVOKE ALL ON FUNCTION
  saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text),
  saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text)
FROM PUBLIC,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION
  saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text),
  saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text)
TO celebix_saas_app;

REVOKE ALL ON FUNCTION
  saas.abandoned_carts_capture(text,uuid,text,timestamptz,jsonb,jsonb)
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION
  saas.abandoned_carts_capture(text,uuid,text,timestamptz,jsonb,jsonb)
TO celebix_saas_workflow;

COMMIT;
