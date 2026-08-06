BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $function$
BEGIN
  IF pg_catalog.to_regclass('saas.shipping_provider_profiles') IS NULL
    OR pg_catalog.to_regclass('saas.orders') IS NULL
    OR pg_catalog.to_regclass('saas.order_items') IS NULL
    OR pg_catalog.to_regprocedure('saas.shipping_provider_preflight()') IS NULL
  THEN RAISE EXCEPTION 'SHIPPING_FULFILLMENT_RUNTIME_SOURCE_INVALID'; END IF;
END
$function$;

CREATE FUNCTION saas.shipping_package_batch_valid(p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas
AS $function$
DECLARE entry jsonb; key_count integer; selected text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value)<>'array' OR pg_catalog.jsonb_array_length(p_value) NOT BETWEEN 1 AND 20
    OR pg_catalog.pg_column_size(p_value)>32768 THEN RETURN false; END IF;
  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_value) LOOP
    IF pg_catalog.jsonb_typeof(entry)<>'object' THEN RETURN false; END IF;
    SELECT pg_catalog.count(*) INTO key_count FROM pg_catalog.jsonb_object_keys(entry);
    IF key_count<>4 OR NOT(entry ?& ARRAY['heightCm','widthCm','depthCm','weightKg']) THEN RETURN false; END IF;
    FOREACH selected IN ARRAY ARRAY['heightCm','widthCm','depthCm','weightKg'] LOOP
      IF pg_catalog.jsonb_typeof(entry->selected)<>'number'
        OR entry->>selected!~'^(?:[1-9][0-9]{0,3})(?:[.][0-9]{1,3})?$|^0[.][0-9]{1,3}$'
        OR (entry->>selected)::numeric<=0 OR (entry->>selected)::numeric>10000
      THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END
$function$;

CREATE FUNCTION saas.shipping_quote_option_batch_valid(p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas
AS $function$
DECLARE entry jsonb; key_count integer; seen_ids text[]:=ARRAY[]::text[];
BEGIN
  IF pg_catalog.jsonb_typeof(p_value)<>'array' OR pg_catalog.jsonb_array_length(p_value) NOT BETWEEN 1 AND 100
    OR pg_catalog.pg_column_size(p_value)>131072 THEN RETURN false; END IF;
  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_value) LOOP
    IF pg_catalog.jsonb_typeof(entry)<>'object' THEN RETURN false; END IF;
    SELECT pg_catalog.count(*) INTO key_count FROM pg_catalog.jsonb_object_keys(entry);
    IF key_count<>8 OR NOT(entry ?& ARRAY['id','handlerResourceId','handlerCode','handlerName','desiKg','priceCents','codFeeCents','digest'])
      OR entry->>'id'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR entry->>'handlerResourceId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR entry->>'handlerCode'!~'^[A-Za-z0-9_-]{1,64}$'
      OR pg_catalog.octet_length(entry->>'handlerName') NOT BETWEEN 1 AND 160
      OR entry->>'handlerName'<>pg_catalog.btrim(entry->>'handlerName') OR entry->>'handlerName'~'[[:cntrl:]]'
      OR pg_catalog.jsonb_typeof(entry->'desiKg')<>'number' OR (entry->>'desiKg')::numeric<0 OR (entry->>'desiKg')::numeric>10000
      OR entry->>'priceCents'!~'^(?:0|[1-9][0-9]{0,15})$'
      OR (pg_catalog.jsonb_typeof(entry->'codFeeCents')<>'null' AND entry->>'codFeeCents'!~'^(?:0|[1-9][0-9]{0,15})$')
      OR entry->>'digest'!~'^[a-f0-9]{64}$' OR entry->>'id'=ANY(seen_ids)
    THEN RETURN false; END IF;
    seen_ids:=pg_catalog.array_append(seen_ids,entry->>'id');
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END
$function$;

CREATE TABLE saas.shipping_quote_sessions (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  credential_version bigint NOT NULL CHECK(credential_version>0),
  order_version bigint NOT NULL CHECK(order_version>0),
  quote_credential_digest char(64) NOT NULL CHECK(quote_credential_digest~'^[a-f0-9]{64}$'),
  status text NOT NULL CHECK(status IN('queued','quoted','failed','expired','consumed')),
  currency text NOT NULL CHECK(currency='TRY'),
  packages jsonb NOT NULL CHECK(saas.shipping_package_batch_valid(packages)),
  expires_at timestamptz NOT NULL,
  safe_code text CHECK(safe_code IS NULL OR safe_code~'^[a-z][a-z0-9_]{1,63}$'),
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK(updated_at>=created_at AND expires_at>created_at),
  CONSTRAINT shipping_quote_sessions_store_id_key UNIQUE(store_id,id),
  CONSTRAINT shipping_quote_sessions_credential_key UNIQUE(store_id,quote_credential_digest),
  CONSTRAINT shipping_quote_sessions_order_fk FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT shipping_quote_sessions_profile_fk FOREIGN KEY(store_id,profile_id) REFERENCES saas.shipping_provider_profiles(store_id,id) ON DELETE RESTRICT
);
CREATE INDEX shipping_quote_sessions_order_idx ON saas.shipping_quote_sessions(store_id,order_id,created_at DESC,id DESC);

CREATE TABLE saas.shipping_quote_options (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  handler_resource_id uuid NOT NULL,
  handler_code text NOT NULL CHECK(handler_code~'^[A-Za-z0-9_-]{1,64}$'),
  handler_name text NOT NULL CHECK(pg_catalog.octet_length(handler_name) BETWEEN 1 AND 160 AND handler_name=pg_catalog.btrim(handler_name) AND handler_name!~'[[:cntrl:]]'),
  desi_kg numeric(10,3) NOT NULL CHECK(desi_kg>=0 AND desi_kg<=10000),
  price_cents bigint NOT NULL CHECK(price_cents>=0),
  cod_fee_cents bigint CHECK(cod_fee_cents>=0),
  currency text NOT NULL CHECK(currency='TRY'),
  canonical_digest char(64) NOT NULL CHECK(canonical_digest~'^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  CONSTRAINT shipping_quote_options_store_id_key UNIQUE(store_id,id),
  CONSTRAINT shipping_quote_options_quote_fk FOREIGN KEY(store_id,quote_id) REFERENCES saas.shipping_quote_sessions(store_id,id) ON DELETE CASCADE,
  CONSTRAINT shipping_quote_options_handler_fk FOREIGN KEY(store_id,handler_resource_id) REFERENCES saas.shipping_provider_resources(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT shipping_quote_options_digest_key UNIQUE(store_id,quote_id,canonical_digest)
);

CREATE TABLE saas.shipping_shipments (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  option_id uuid NOT NULL,
  credential_version bigint NOT NULL CHECK(credential_version>0),
  direction text NOT NULL CHECK(direction='outgoing'),
  status text NOT NULL CHECK(status IN('creating','ready','shipped','out_for_delivery','delivered','delayed','returning','returned','lost','cancelled','provider_outcome_unknown','attention_required')),
  provider_shipment_id text,
  barcode text,
  tracking_number text,
  tracking_url text,
  carrier text,
  price_cents bigint CHECK(price_cents>=0),
  cod_amount_cents bigint NOT NULL DEFAULT 0 CHECK(cod_amount_cents>=0),
  currency text NOT NULL CHECK(currency='TRY'),
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK(updated_at>=created_at),
  CONSTRAINT shipping_shipments_store_id_key UNIQUE(store_id,id),
  CONSTRAINT shipping_shipments_order_fk FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT shipping_shipments_profile_fk FOREIGN KEY(store_id,profile_id) REFERENCES saas.shipping_provider_profiles(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT shipping_shipments_quote_fk FOREIGN KEY(store_id,quote_id) REFERENCES saas.shipping_quote_sessions(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT shipping_shipments_option_fk FOREIGN KEY(store_id,option_id) REFERENCES saas.shipping_quote_options(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT shipping_shipments_provider_check CHECK(
    (status IN('creating','provider_outcome_unknown','attention_required','cancelled') OR provider_shipment_id IS NOT NULL)
    AND (provider_shipment_id IS NULL OR (pg_catalog.octet_length(provider_shipment_id) BETWEEN 1 AND 200 AND provider_shipment_id=pg_catalog.btrim(provider_shipment_id) AND provider_shipment_id!~'[[:cntrl:]]'))
    AND (barcode IS NULL OR (pg_catalog.octet_length(barcode) BETWEEN 1 AND 200 AND barcode=pg_catalog.btrim(barcode) AND barcode!~'[[:cntrl:]]'))
    AND (tracking_number IS NULL OR (pg_catalog.octet_length(tracking_number) BETWEEN 1 AND 200 AND tracking_number=pg_catalog.btrim(tracking_number) AND tracking_number!~'[[:cntrl:]]'))
    AND (carrier IS NULL OR (pg_catalog.octet_length(carrier) BETWEEN 1 AND 160 AND carrier=pg_catalog.btrim(carrier) AND carrier!~'[[:cntrl:]]'))
  )
);
CREATE UNIQUE INDEX shipping_shipments_provider_key ON saas.shipping_shipments(store_id,profile_id,provider_shipment_id) WHERE provider_shipment_id IS NOT NULL;
CREATE INDEX shipping_shipments_order_idx ON saas.shipping_shipments(store_id,order_id,created_at DESC,id DESC);

ALTER TABLE saas.order_items ADD CONSTRAINT order_items_store_order_id_key UNIQUE(store_id,order_id,id);

CREATE TABLE saas.shipping_shipment_items (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  quantity integer NOT NULL CONSTRAINT shipping_shipment_items_quantity_check CHECK(quantity BETWEEN 1 AND 9999),
  created_at timestamptz NOT NULL,
  CONSTRAINT shipping_shipment_items_store_id_key UNIQUE(store_id,id),
  CONSTRAINT shipping_shipment_items_shipment_item_key UNIQUE(store_id,shipment_id,order_item_id),
  CONSTRAINT shipping_shipment_items_shipment_fk FOREIGN KEY(store_id,shipment_id) REFERENCES saas.shipping_shipments(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT shipping_shipment_items_order_fk FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT shipping_shipment_items_order_item_fk FOREIGN KEY(store_id,order_id,order_item_id) REFERENCES saas.order_items(store_id,order_id,id) ON DELETE RESTRICT
);

CREATE TABLE saas.shipping_fulfillment_jobs (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  credential_version bigint NOT NULL CHECK(credential_version>0),
  job_kind text NOT NULL CHECK(job_kind IN('quote','create_shipment')),
  quote_id uuid NOT NULL,
  shipment_id uuid,
  status text NOT NULL CHECK(status IN('queued','leased','succeeded','failed','superseded','provider_outcome_unknown')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 10),
  next_run_at timestamptz NOT NULL,
  lease_id uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  fence_token bigint NOT NULL DEFAULT 0 CHECK(fence_token>=0),
  safe_code text CHECK(safe_code IS NULL OR safe_code~'^[a-z][a-z0-9_]{1,63}$'),
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK(updated_at>=created_at),
  CONSTRAINT shipping_fulfillment_jobs_store_id_key UNIQUE(store_id,id),
  CONSTRAINT shipping_fulfillment_jobs_profile_fk FOREIGN KEY(store_id,profile_id) REFERENCES saas.shipping_provider_profiles(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT shipping_fulfillment_jobs_quote_fk FOREIGN KEY(store_id,quote_id) REFERENCES saas.shipping_quote_sessions(store_id,id) ON DELETE CASCADE,
  CONSTRAINT shipping_fulfillment_jobs_shipment_fk FOREIGN KEY(store_id,shipment_id) REFERENCES saas.shipping_shipments(store_id,id) ON DELETE CASCADE,
  CONSTRAINT shipping_fulfillment_jobs_kind_check CHECK((job_kind='quote' AND shipment_id IS NULL) OR (job_kind='create_shipment' AND shipment_id IS NOT NULL)),
  CONSTRAINT shipping_fulfillment_jobs_lease_check CHECK(
    (status='leased' AND lease_id IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL
      AND pg_catalog.octet_length(lease_owner) BETWEEN 1 AND 128 AND lease_owner=pg_catalog.btrim(lease_owner) AND lease_owner!~'[[:cntrl:]]')
    OR (status<>'leased' AND lease_id IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
  )
);
CREATE UNIQUE INDEX shipping_fulfillment_jobs_one_open ON saas.shipping_fulfillment_jobs(store_id,job_kind,quote_id) WHERE status IN('queued','leased');
CREATE INDEX shipping_fulfillment_jobs_claim_idx ON saas.shipping_fulfillment_jobs(next_run_at,id) WHERE status='queued';

CREATE TABLE saas.shipping_shipment_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN('creating','ready','shipped','out_for_delivery','delivered','delayed','returning','returned','lost','cancelled','provider_outcome_unknown','attention_required')),
  safe_code text CHECK(safe_code IS NULL OR safe_code~'^[a-z][a-z0-9_]{1,63}$'),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT shipping_shipment_events_store_id_key UNIQUE(store_id,id),
  CONSTRAINT shipping_shipment_events_shipment_fk FOREIGN KEY(store_id,shipment_id) REFERENCES saas.shipping_shipments(store_id,id) ON DELETE RESTRICT
);

CREATE TABLE saas.shipping_fulfillment_operations (
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  operation_kind text NOT NULL CHECK(operation_kind IN('begin_quote','begin_shipment')),
  payload_fingerprint char(64) NOT NULL CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=65536),
  committed_at timestamptz NOT NULL,
  CONSTRAINT shipping_fulfillment_operations_store_operation_key UNIQUE(store_id,operation_id),
  CONSTRAINT shipping_fulfillment_operations_order_fk FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT
);

CREATE FUNCTION saas.shipping_fulfillment_guard_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $function$
BEGIN RAISE EXCEPTION 'SHIPPING_FULFILLMENT_IMMUTABLE'; END
$function$;
CREATE TRIGGER shipping_shipment_events_immutable BEFORE UPDATE OR DELETE ON saas.shipping_shipment_events FOR EACH ROW EXECUTE FUNCTION saas.shipping_fulfillment_guard_immutable();
CREATE TRIGGER shipping_fulfillment_operations_immutable BEFORE UPDATE OR DELETE ON saas.shipping_fulfillment_operations FOR EACH ROW EXECUTE FUNCTION saas.shipping_fulfillment_guard_immutable();

ALTER TABLE saas.shipping_quote_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_quote_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_quote_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_quote_options FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_shipments FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_shipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_shipment_items FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_fulfillment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_fulfillment_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_shipment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_shipment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_fulfillment_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_fulfillment_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE saas.shipping_quote_sessions,saas.shipping_quote_options,saas.shipping_shipments,
  saas.shipping_shipment_items,saas.shipping_fulfillment_jobs,saas.shipping_shipment_events,saas.shipping_fulfillment_operations
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
  celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE FUNCTION saas.shipping_quote_projection(p_store_id uuid,p_quote_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'quoteId',quote_row.id,'status',quote_row.status,'expiresAt',saas.shipping_timestamp(quote_row.expires_at),
    'currency',quote_row.currency,'packages',quote_row.packages,'version',quote_row.version,
    'options',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'id',option_row.id,'handlerCode',option_row.handler_code,'handlerName',option_row.handler_name,
      'desiKg',option_row.desi_kg::double precision,'priceCents',option_row.price_cents,
      'codFeeCents',option_row.cod_fee_cents,'currency',option_row.currency
    )) ORDER BY option_row.price_cents,option_row.handler_name,option_row.id)
    FROM saas.shipping_quote_options option_row WHERE option_row.store_id=quote_row.store_id AND option_row.quote_id=quote_row.id),'[]'::jsonb)
  ) FROM saas.shipping_quote_sessions quote_row WHERE quote_row.store_id=p_store_id AND quote_row.id=p_quote_id
$function$;

CREATE FUNCTION saas.shipping_shipment_projection(p_store_id uuid,p_shipment_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',shipment.id,'providerCode',profile.provider_code,'direction',shipment.direction,'status',shipment.status,
    'carrier',shipment.carrier,'barcode',shipment.barcode,'trackingNumber',shipment.tracking_number,
    'trackingUrl',shipment.tracking_url,'priceCents',shipment.price_cents,'codAmountCents',shipment.cod_amount_cents,
    'currency',shipment.currency,'version',shipment.version,'createdAt',saas.shipping_timestamp(shipment.created_at),
    'updatedAt',saas.shipping_timestamp(shipment.updated_at),'label',pg_catalog.jsonb_build_object('available',false),
    'items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'orderItemId',item.order_item_id,'productName',order_item.product_name,'quantity',item.quantity
    ) ORDER BY order_item.position,item.id) FROM saas.shipping_shipment_items item
      JOIN saas.order_items order_item ON order_item.store_id=item.store_id AND order_item.order_id=item.order_id AND order_item.id=item.order_item_id
      WHERE item.store_id=shipment.store_id AND item.shipment_id=shipment.id),'[]'::jsonb),
    'events',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',event.id,'status',event.status,'occurredAt',saas.shipping_timestamp(event.occurred_at)
    ) ORDER BY event.occurred_at,event.id) FROM saas.shipping_shipment_events event
      WHERE event.store_id=shipment.store_id AND event.shipment_id=shipment.id),'[]'::jsonb)
  )) FROM saas.shipping_shipments shipment
  JOIN saas.shipping_provider_profiles profile ON profile.store_id=shipment.store_id AND profile.id=shipment.profile_id
  WHERE shipment.store_id=p_store_id AND shipment.id=p_shipment_id
$function$;

CREATE FUNCTION saas.shipping_quote_begin(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_order_id uuid,p_expected_order_version bigint,p_packages jsonb,p_operation_id uuid,p_payload_fingerprint text,
  p_quote_id uuid,p_job_id uuid,p_quote_credential_digest text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; order_row saas.orders%ROWTYPE; profile saas.shipping_provider_profiles%ROWTYPE;
  operation saas.shipping_fulfillment_operations%ROWTYPE; payload jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations','shipping.manage');
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.fulfill'); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_order_id IS NULL OR p_expected_order_version<1 OR NOT saas.shipping_package_batch_valid(p_packages)
    OR p_operation_id IS NULL OR p_payload_fingerprint!~'^[a-f0-9]{64}$' OR p_quote_id IS NULL OR p_job_id IS NULL
    OR p_quote_credential_digest!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO operation FROM saas.shipping_fulfillment_operations value WHERE value.operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_payload_fingerprint OR operation.operation_kind<>'begin_quote'
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF;
    RETURN;
  END IF;
  SELECT value.* INTO order_row FROM saas.orders value WHERE value.store_id=p_store_id AND value.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found',NULL::jsonb; RETURN; END IF;
  IF order_row.version<>p_expected_order_version THEN RETURN QUERY SELECT 'order_version_mismatch',NULL::jsonb; RETURN; END IF;
  IF order_row.status NOT IN('pending','confirmed','preparing') THEN RETURN QUERY SELECT 'order_not_fulfillable',NULL::jsonb; RETURN; END IF;
  IF order_row.currency<>'TRY' THEN RETURN QUERY SELECT 'currency_unsupported',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO profile FROM saas.shipping_provider_profiles value
  WHERE value.store_id=p_store_id AND value.provider_code='basit_kargo' AND value.status='active' FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'provider_not_ready',NULL::jsonb; RETURN; END IF;
  UPDATE saas.shipping_quote_sessions SET status='expired',version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND order_id=p_order_id AND status IN('queued','quoted') AND expires_at<=p_now;
  UPDATE saas.shipping_fulfillment_jobs SET status='superseded',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,
    safe_code='quote_expired',version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND quote_id IN(SELECT id FROM saas.shipping_quote_sessions WHERE store_id=p_store_id AND order_id=p_order_id AND status='expired')
      AND status IN('queued','leased');
  INSERT INTO saas.shipping_quote_sessions(
    id,store_id,order_id,profile_id,credential_version,order_version,quote_credential_digest,status,currency,packages,expires_at,version,created_at,updated_at
  ) VALUES(p_quote_id,p_store_id,p_order_id,profile.id,profile.credential_version,order_row.version,p_quote_credential_digest,'queued','TRY',p_packages,
    p_now+pg_catalog.make_interval(mins=>10),1,p_now,p_now);
  INSERT INTO saas.shipping_fulfillment_jobs(
    id,store_id,profile_id,credential_version,job_kind,quote_id,status,attempt_count,next_run_at,fence_token,version,created_at,updated_at
  ) VALUES(p_job_id,p_store_id,profile.id,profile.credential_version,'quote',p_quote_id,'queued',0,p_now,0,1,p_now,p_now);
  payload:=pg_catalog.jsonb_build_object('jobId',p_job_id,'quote',saas.shipping_quote_projection(p_store_id,p_quote_id));
  INSERT INTO saas.shipping_fulfillment_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,p_order_id,'begin_quote',p_payload_fingerprint,payload,p_now);
  RETURN QUERY SELECT 'queued',payload;
END
$function$;

CREATE FUNCTION saas.shipping_quote_current(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_quote_credential_digest text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; quote_row saas.shipping_quote_sessions%ROWTYPE;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations','shipping.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_quote_credential_digest!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO quote_row FROM saas.shipping_quote_sessions value
    WHERE value.store_id=p_store_id AND value.quote_credential_digest=p_quote_credential_digest FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF quote_row.status IN('queued','quoted') AND quote_row.expires_at<=p_now THEN
    UPDATE saas.shipping_quote_sessions SET status='expired',version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=quote_row.id RETURNING * INTO quote_row;
    UPDATE saas.shipping_fulfillment_jobs SET status='superseded',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,safe_code='quote_expired',version=version+1,updated_at=p_now
      WHERE store_id=p_store_id AND quote_id=quote_row.id AND status IN('queued','leased');
  END IF;
  RETURN QUERY SELECT 'found',saas.shipping_quote_projection(p_store_id,quote_row.id);
END
$function$;

CREATE FUNCTION saas.shipping_shipment_begin(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_order_id uuid,p_expected_order_version bigint,p_quote_credential_digest text,p_option_id uuid,
  p_operation_id uuid,p_payload_fingerprint text,p_shipment_id uuid,p_job_id uuid,p_event_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; order_row saas.orders%ROWTYPE; quote_row saas.shipping_quote_sessions%ROWTYPE;
  option_row saas.shipping_quote_options%ROWTYPE; profile saas.shipping_provider_profiles%ROWTYPE;
  operation saas.shipping_fulfillment_operations%ROWTYPE; payload jsonb; inserted_count integer;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations','shipping.manage');
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.fulfill'); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_order_id IS NULL OR p_expected_order_version<1 OR p_quote_credential_digest!~'^[a-f0-9]{64}$' OR p_option_id IS NULL
    OR p_operation_id IS NULL OR p_payload_fingerprint!~'^[a-f0-9]{64}$' OR p_shipment_id IS NULL OR p_job_id IS NULL OR p_event_id IS NULL
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO operation FROM saas.shipping_fulfillment_operations value WHERE value.operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_payload_fingerprint OR operation.operation_kind<>'begin_shipment'
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF;
    RETURN;
  END IF;
  SELECT value.* INTO order_row FROM saas.orders value WHERE value.store_id=p_store_id AND value.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found',NULL::jsonb; RETURN; END IF;
  IF order_row.version<>p_expected_order_version THEN RETURN QUERY SELECT 'order_version_mismatch',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO quote_row FROM saas.shipping_quote_sessions value
    WHERE value.store_id=p_store_id AND value.quote_credential_digest=p_quote_credential_digest FOR UPDATE;
  IF NOT FOUND OR quote_row.order_id<>p_order_id THEN RETURN QUERY SELECT 'quote_not_found',NULL::jsonb; RETURN; END IF;
  IF quote_row.expires_at<=p_now THEN
    UPDATE saas.shipping_quote_sessions SET status='expired',version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=quote_row.id;
    RETURN QUERY SELECT 'quote_expired',NULL::jsonb; RETURN;
  END IF;
  IF quote_row.status<>'quoted' THEN RETURN QUERY SELECT 'quote_not_ready',NULL::jsonb; RETURN; END IF;
  IF quote_row.order_version<>order_row.version THEN RETURN QUERY SELECT 'order_version_mismatch',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO option_row FROM saas.shipping_quote_options value
    WHERE value.store_id=p_store_id AND value.quote_id=quote_row.id AND value.id=p_option_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'option_invalid',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO profile FROM saas.shipping_provider_profiles value
    WHERE value.store_id=p_store_id AND value.id=quote_row.profile_id AND value.status='active'
      AND value.credential_version=quote_row.credential_version FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'provider_not_ready',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.shipping_shipments value WHERE value.store_id=p_store_id AND value.order_id=p_order_id AND value.direction='outgoing' AND value.status<>'cancelled')
  THEN RETURN QUERY SELECT 'shipment_exists',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.shipping_shipments(
    id,store_id,order_id,profile_id,quote_id,option_id,credential_version,direction,status,price_cents,cod_amount_cents,currency,version,created_at,updated_at
  ) VALUES(p_shipment_id,p_store_id,p_order_id,profile.id,quote_row.id,option_row.id,profile.credential_version,'outgoing','creating',option_row.price_cents,0,'TRY',1,p_now,p_now);
  INSERT INTO saas.shipping_shipment_items(id,store_id,shipment_id,order_id,order_item_id,quantity,created_at)
  SELECT pg_catalog.gen_random_uuid(),p_store_id,p_shipment_id,p_order_id,order_item.id,
    order_item.quantity-COALESCE((SELECT pg_catalog.sum(existing_item.quantity)::integer
      FROM saas.shipping_shipment_items existing_item JOIN saas.shipping_shipments existing_shipment
        ON existing_shipment.store_id=existing_item.store_id AND existing_shipment.id=existing_item.shipment_id
      WHERE existing_item.store_id=p_store_id AND existing_item.order_item_id=order_item.id AND existing_shipment.status<>'cancelled'),0),p_now
  FROM saas.order_items order_item WHERE order_item.store_id=p_store_id AND order_item.order_id=p_order_id
    AND order_item.quantity-COALESCE((SELECT pg_catalog.sum(existing_item.quantity)::integer
      FROM saas.shipping_shipment_items existing_item JOIN saas.shipping_shipments existing_shipment
        ON existing_shipment.store_id=existing_item.store_id AND existing_shipment.id=existing_item.shipment_id
      WHERE existing_item.store_id=p_store_id AND existing_item.order_item_id=order_item.id AND existing_shipment.status<>'cancelled'),0)>0;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  IF inserted_count<1 THEN RAISE EXCEPTION 'SHIPPING_SHIPMENT_EMPTY'; END IF;
  INSERT INTO saas.shipping_shipment_events(id,store_id,shipment_id,status,occurred_at,created_at)
    VALUES(p_event_id,p_store_id,p_shipment_id,'creating',p_now,p_now);
  INSERT INTO saas.shipping_fulfillment_jobs(
    id,store_id,profile_id,credential_version,job_kind,quote_id,shipment_id,status,attempt_count,next_run_at,fence_token,version,created_at,updated_at
  ) VALUES(p_job_id,p_store_id,profile.id,profile.credential_version,'create_shipment',quote_row.id,p_shipment_id,'queued',0,p_now,0,1,p_now,p_now);
  payload:=pg_catalog.jsonb_build_object('jobId',p_job_id,'shipment',saas.shipping_shipment_projection(p_store_id,p_shipment_id));
  INSERT INTO saas.shipping_fulfillment_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,p_order_id,'begin_shipment',p_payload_fingerprint,payload,p_now);
  RETURN QUERY SELECT 'queued',payload;
END
$function$;

CREATE FUNCTION saas.shipping_shipment_current(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_shipment_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; payload jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations','shipping.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_shipment_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  payload:=saas.shipping_shipment_projection(p_store_id,p_shipment_id);
  IF payload IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; ELSE RETURN QUERY SELECT 'found',payload; END IF;
END
$function$;

CREATE FUNCTION saas.shipping_fulfillment_recover_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_payload_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; operation saas.shipping_fulfillment_operations%ROWTYPE;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations','shipping.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_payload_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO operation FROM saas.shipping_fulfillment_operations value WHERE value.operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;
  ELSIF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_payload_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF;
END
$function$;

CREATE FUNCTION saas.shipping_fulfillment_claim(p_worker_id text,p_now timestamptz,p_lease_seconds integer,p_lease_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE selected_job saas.shipping_fulfillment_jobs%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR p_worker_id<>pg_catalog.btrim(p_worker_id) OR pg_catalog.octet_length(p_worker_id) NOT BETWEEN 1 AND 128
    OR p_worker_id~'[[:cntrl:]]' OR p_now IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 900 OR p_lease_id IS NULL
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT candidate.* INTO selected_job FROM saas.shipping_fulfillment_jobs candidate
  JOIN saas.shipping_provider_profiles profile ON profile.store_id=candidate.store_id AND profile.id=candidate.profile_id
  JOIN saas.shipping_quote_sessions quote_row ON quote_row.store_id=candidate.store_id AND quote_row.id=candidate.quote_id
  LEFT JOIN saas.shipping_shipments shipment ON shipment.store_id=candidate.store_id AND shipment.id=candidate.shipment_id
  WHERE candidate.status='queued' AND candidate.next_run_at<=p_now AND candidate.attempt_count<5
    AND profile.status='active' AND profile.credential_version=candidate.credential_version
    AND quote_row.expires_at>p_now
    AND ((candidate.job_kind='quote' AND quote_row.status='queued') OR (candidate.job_kind='create_shipment' AND shipment.status='creating'))
  ORDER BY candidate.next_run_at,candidate.id FOR UPDATE OF candidate SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'empty',NULL::jsonb; RETURN; END IF;
  UPDATE saas.shipping_fulfillment_jobs SET status='leased',attempt_count=attempt_count+1,lease_id=p_lease_id,lease_owner=p_worker_id,
    lease_expires_at=p_now+pg_catalog.make_interval(secs=>p_lease_seconds),fence_token=fence_token+1,version=version+1,updated_at=p_now
    WHERE id=selected_job.id RETURNING * INTO selected_job;
  RETURN QUERY SELECT 'claimed',pg_catalog.jsonb_build_object(
    'jobId',selected_job.id,'jobKind',selected_job.job_kind,'storeId',selected_job.store_id,'profileId',selected_job.profile_id,
    'quoteId',selected_job.quote_id,'shipmentId',selected_job.shipment_id,'credentialVersion',selected_job.credential_version,
    'leaseId',selected_job.lease_id,'fenceToken',selected_job.fence_token,'version',selected_job.version
  );
END
$function$;

CREATE FUNCTION saas.shipping_fulfillment_claim_job(p_job_id uuid,p_worker_id text,p_now timestamptz,p_lease_seconds integer,p_lease_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE selected_job saas.shipping_fulfillment_jobs%ROWTYPE;
BEGIN
  IF p_job_id IS NULL OR p_worker_id IS NULL OR p_worker_id<>pg_catalog.btrim(p_worker_id)
    OR pg_catalog.octet_length(p_worker_id) NOT BETWEEN 1 AND 128 OR p_worker_id~'[[:cntrl:]]'
    OR p_now IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 900 OR p_lease_id IS NULL
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT candidate.* INTO selected_job FROM saas.shipping_fulfillment_jobs candidate
  JOIN saas.shipping_provider_profiles profile ON profile.store_id=candidate.store_id AND profile.id=candidate.profile_id
  JOIN saas.shipping_quote_sessions quote_row ON quote_row.store_id=candidate.store_id AND quote_row.id=candidate.quote_id
  LEFT JOIN saas.shipping_shipments shipment ON shipment.store_id=candidate.store_id AND shipment.id=candidate.shipment_id
  WHERE candidate.id=p_job_id AND candidate.status='queued' AND candidate.next_run_at<=p_now AND candidate.attempt_count<5
    AND profile.status='active' AND profile.credential_version=candidate.credential_version
    AND quote_row.expires_at>p_now
    AND ((candidate.job_kind='quote' AND quote_row.status='queued') OR (candidate.job_kind='create_shipment' AND shipment.status='creating'))
  FOR UPDATE OF candidate SKIP LOCKED;
  IF NOT FOUND THEN RETURN QUERY SELECT 'empty',NULL::jsonb; RETURN; END IF;
  UPDATE saas.shipping_fulfillment_jobs SET status='leased',attempt_count=attempt_count+1,lease_id=p_lease_id,lease_owner=p_worker_id,
    lease_expires_at=p_now+pg_catalog.make_interval(secs=>p_lease_seconds),fence_token=fence_token+1,version=version+1,updated_at=p_now
    WHERE id=selected_job.id RETURNING * INTO selected_job;
  RETURN QUERY SELECT 'claimed',pg_catalog.jsonb_build_object(
    'jobId',selected_job.id,'jobKind',selected_job.job_kind,'storeId',selected_job.store_id,'profileId',selected_job.profile_id,
    'quoteId',selected_job.quote_id,'shipmentId',selected_job.shipment_id,'credentialVersion',selected_job.credential_version,
    'leaseId',selected_job.lease_id,'fenceToken',selected_job.fence_token,'version',selected_job.version
  );
END
$function$;

CREATE FUNCTION saas.shipping_fulfillment_open(p_job_id uuid,p_worker_id text,p_lease_id uuid,p_fence_token bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE job saas.shipping_fulfillment_jobs%ROWTYPE; profile saas.shipping_provider_profiles%ROWTYPE; quote_row saas.shipping_quote_sessions%ROWTYPE;
  shipment saas.shipping_shipments%ROWTYPE; order_row saas.orders%ROWTYPE; payload jsonb;
BEGIN
  SELECT value.* INTO job FROM saas.shipping_fulfillment_jobs value WHERE value.id=p_job_id;
  IF NOT FOUND OR job.status<>'leased' OR job.lease_owner<>p_worker_id OR job.lease_id<>p_lease_id OR job.fence_token<>p_fence_token OR job.lease_expires_at<=p_now
  THEN RETURN QUERY SELECT 'lease_invalid',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO profile FROM saas.shipping_provider_profiles value WHERE value.store_id=job.store_id AND value.id=job.profile_id;
  IF NOT FOUND OR profile.status<>'active' OR profile.credential_version<>job.credential_version THEN RETURN QUERY SELECT 'credential_stale',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO quote_row FROM saas.shipping_quote_sessions value WHERE value.store_id=job.store_id AND value.id=job.quote_id;
  IF NOT FOUND OR quote_row.expires_at<=p_now THEN RETURN QUERY SELECT 'quote_expired',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO order_row FROM saas.orders value WHERE value.store_id=job.store_id AND value.id=quote_row.order_id;
  IF job.job_kind='create_shipment' THEN SELECT value.* INTO shipment FROM saas.shipping_shipments value WHERE value.store_id=job.store_id AND value.id=job.shipment_id; END IF;
  payload:=pg_catalog.jsonb_build_object(
    'jobKind',job.job_kind,'providerCode',profile.provider_code,'credentialEnvelope',profile.credential_envelope,
    'credentialDigest',profile.credential_digest,'credentialKeyId',profile.credential_key_id,'credentialVersion',profile.credential_version,
    'storeId',job.store_id,'profileId',profile.id,'quoteId',quote_row.id,'shipmentId',job.shipment_id,
    'packages',quote_row.packages,'brandProviderResourceId',(SELECT provider_resource_id FROM saas.shipping_provider_resources WHERE store_id=profile.store_id AND id=profile.selected_brand_resource_id),
    'addressProviderResourceId',(SELECT provider_resource_id FROM saas.shipping_provider_resources WHERE store_id=profile.store_id AND id=profile.selected_address_resource_id),
    'order',CASE WHEN job.job_kind='quote' THEN NULL ELSE pg_catalog.jsonb_build_object(
      'orderId',order_row.id,'orderNumber',order_row.order_number,'customerName',order_row.customer_name,'customerEmail',order_row.customer_email,
      'customerPhone',order_row.customer_phone,'shippingAddress',order_row.shipping_address,'codAmountCents',shipment.cod_amount_cents,
      'handlerCode',(SELECT handler_code FROM saas.shipping_quote_options WHERE store_id=job.store_id AND id=shipment.option_id),
      'items',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('orderItemId',item.order_item_id,'productName',order_item.product_name,'sku',order_item.sku,'quantity',item.quantity) ORDER BY order_item.position)
        FROM saas.shipping_shipment_items item JOIN saas.order_items order_item ON order_item.store_id=item.store_id AND order_item.order_id=item.order_id AND order_item.id=item.order_item_id
        WHERE item.store_id=job.store_id AND item.shipment_id=shipment.id)
    ) END
  );
  RETURN QUERY SELECT 'opened',payload;
END
$function$;

CREATE FUNCTION saas.shipping_quote_complete(
  p_job_id uuid,p_worker_id text,p_lease_id uuid,p_fence_token bigint,p_now timestamptz,p_options jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE job saas.shipping_fulfillment_jobs%ROWTYPE; quote_row saas.shipping_quote_sessions%ROWTYPE; entry jsonb; resource saas.shipping_provider_resources%ROWTYPE;
BEGIN
  IF NOT saas.shipping_quote_option_batch_valid(p_options) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO job FROM saas.shipping_fulfillment_jobs value WHERE value.id=p_job_id FOR UPDATE;
  IF NOT FOUND OR job.job_kind<>'quote' OR job.status<>'leased' OR job.lease_owner<>p_worker_id OR job.lease_id<>p_lease_id OR job.fence_token<>p_fence_token OR job.lease_expires_at<=p_now
  THEN RETURN QUERY SELECT 'lease_invalid',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO quote_row FROM saas.shipping_quote_sessions value WHERE value.store_id=job.store_id AND value.id=job.quote_id FOR UPDATE;
  IF NOT FOUND OR quote_row.status<>'queued' OR quote_row.expires_at<=p_now THEN RETURN QUERY SELECT 'quote_expired',NULL::jsonb; RETURN; END IF;
  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_options) LOOP
    SELECT value.* INTO resource FROM saas.shipping_provider_resources value
      WHERE value.store_id=job.store_id AND value.profile_id=job.profile_id AND value.credential_version=job.credential_version
        AND value.id=(entry->>'handlerResourceId')::uuid AND value.resource_kind='handler' AND value.active
        AND value.provider_resource_id=entry->>'handlerCode';
    IF NOT FOUND THEN RETURN QUERY SELECT 'resource_invalid',NULL::jsonb; RETURN; END IF;
    INSERT INTO saas.shipping_quote_options(id,store_id,quote_id,handler_resource_id,handler_code,handler_name,desi_kg,price_cents,cod_fee_cents,currency,canonical_digest,created_at)
      VALUES((entry->>'id')::uuid,job.store_id,job.quote_id,resource.id,entry->>'handlerCode',entry->>'handlerName',(entry->>'desiKg')::numeric,
        (entry->>'priceCents')::bigint,CASE WHEN pg_catalog.jsonb_typeof(entry->'codFeeCents')='null' THEN NULL ELSE (entry->>'codFeeCents')::bigint END,'TRY',entry->>'digest',p_now);
  END LOOP;
  UPDATE saas.shipping_quote_sessions SET status='quoted',safe_code=NULL,version=version+1,updated_at=p_now WHERE store_id=job.store_id AND id=job.quote_id RETURNING * INTO quote_row;
  UPDATE saas.shipping_fulfillment_jobs SET status='succeeded',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,safe_code=NULL,version=version+1,updated_at=p_now WHERE id=job.id;
  RETURN QUERY SELECT 'completed',saas.shipping_quote_projection(job.store_id,job.quote_id);
END
$function$;

CREATE FUNCTION saas.shipping_fulfillment_fail(
  p_job_id uuid,p_worker_id text,p_lease_id uuid,p_fence_token bigint,p_now timestamptz,p_failure_kind text,p_safe_code text,p_retry_after_seconds integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE job saas.shipping_fulfillment_jobs%ROWTYPE; terminal boolean;
BEGIN
  IF p_failure_kind NOT IN('rejected','throttled','temporary_failure') OR p_safe_code!~'^[a-z][a-z0-9_]{1,63}$'
    OR (p_failure_kind IN('throttled','temporary_failure') AND p_retry_after_seconds NOT BETWEEN 1 AND 900)
    OR (p_failure_kind='rejected' AND p_retry_after_seconds IS NOT NULL)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO job FROM saas.shipping_fulfillment_jobs value WHERE value.id=p_job_id FOR UPDATE;
  IF NOT FOUND OR job.status<>'leased' OR job.lease_owner<>p_worker_id OR job.lease_id<>p_lease_id OR job.fence_token<>p_fence_token OR job.lease_expires_at<=p_now
  THEN RETURN QUERY SELECT 'lease_invalid',NULL::jsonb; RETURN; END IF;
  terminal:=p_failure_kind='rejected' OR job.attempt_count>=5;
  UPDATE saas.shipping_fulfillment_jobs SET status=CASE WHEN terminal THEN 'failed' ELSE 'queued' END,
    next_run_at=CASE WHEN terminal THEN next_run_at ELSE p_now+pg_catalog.make_interval(secs=>p_retry_after_seconds) END,
    lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,safe_code=p_safe_code,version=version+1,updated_at=p_now WHERE id=job.id;
  IF terminal AND job.job_kind='quote' THEN UPDATE saas.shipping_quote_sessions SET status='failed',safe_code=p_safe_code,version=version+1,updated_at=p_now WHERE store_id=job.store_id AND id=job.quote_id; END IF;
  IF terminal AND job.job_kind='create_shipment' THEN
    UPDATE saas.shipping_shipments SET status='attention_required',version=version+1,updated_at=p_now WHERE store_id=job.store_id AND id=job.shipment_id;
    INSERT INTO saas.shipping_shipment_events(id,store_id,shipment_id,status,safe_code,occurred_at,created_at)
      VALUES(pg_catalog.gen_random_uuid(),job.store_id,job.shipment_id,'attention_required',p_safe_code,p_now,p_now);
  END IF;
  RETURN QUERY SELECT CASE WHEN terminal THEN 'failed' ELSE 'requeued' END,pg_catalog.jsonb_build_object('jobId',job.id,'safeCode',p_safe_code);
END
$function$;

CREATE FUNCTION saas.shipping_shipment_complete(
  p_job_id uuid,p_worker_id text,p_lease_id uuid,p_fence_token bigint,p_now timestamptz,p_event_id uuid,
  p_provider_shipment_id text,p_barcode text,p_tracking_number text,p_tracking_url text,p_carrier text,p_price_cents bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE job saas.shipping_fulfillment_jobs%ROWTYPE; shipment saas.shipping_shipments%ROWTYPE;
BEGIN
  IF p_event_id IS NULL OR p_provider_shipment_id IS NULL OR pg_catalog.octet_length(p_provider_shipment_id) NOT BETWEEN 1 AND 200
    OR p_provider_shipment_id<>pg_catalog.btrim(p_provider_shipment_id) OR p_provider_shipment_id~'[[:cntrl:]]'
    OR p_barcode IS NULL OR pg_catalog.octet_length(p_barcode) NOT BETWEEN 1 AND 200 OR p_barcode<>pg_catalog.btrim(p_barcode) OR p_barcode~'[[:cntrl:]]'
    OR p_tracking_number IS NULL OR pg_catalog.octet_length(p_tracking_number) NOT BETWEEN 1 AND 200 OR p_tracking_number<>pg_catalog.btrim(p_tracking_number) OR p_tracking_number~'[[:cntrl:]]'
    OR p_carrier IS NULL OR pg_catalog.octet_length(p_carrier) NOT BETWEEN 1 AND 160 OR p_carrier<>pg_catalog.btrim(p_carrier) OR p_carrier~'[[:cntrl:]]'
    OR p_tracking_url IS NULL OR pg_catalog.octet_length(p_tracking_url) NOT BETWEEN 9 AND 2000
    OR p_tracking_url!~'^https://[^[:space:]]+$' OR p_price_cents<0
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO job FROM saas.shipping_fulfillment_jobs value WHERE value.id=p_job_id FOR UPDATE;
  IF NOT FOUND OR job.job_kind<>'create_shipment' OR job.status<>'leased' OR job.lease_owner<>p_worker_id OR job.lease_id<>p_lease_id OR job.fence_token<>p_fence_token OR job.lease_expires_at<=p_now
  THEN RETURN QUERY SELECT 'lease_invalid',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO shipment FROM saas.shipping_shipments value WHERE value.store_id=job.store_id AND value.id=job.shipment_id FOR UPDATE;
  IF NOT FOUND OR shipment.status<>'creating' THEN RETURN QUERY SELECT 'shipment_stale',NULL::jsonb; RETURN; END IF;
  UPDATE saas.shipping_shipments SET status='ready',provider_shipment_id=p_provider_shipment_id,barcode=p_barcode,
    tracking_number=p_tracking_number,tracking_url=p_tracking_url,carrier=p_carrier,price_cents=p_price_cents,version=version+1,updated_at=p_now
    WHERE store_id=job.store_id AND id=job.shipment_id RETURNING * INTO shipment;
  UPDATE saas.shipping_quote_sessions SET status='consumed',version=version+1,updated_at=p_now WHERE store_id=job.store_id AND id=job.quote_id;
  UPDATE saas.shipping_fulfillment_jobs SET status='succeeded',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,safe_code=NULL,version=version+1,updated_at=p_now WHERE id=job.id;
  INSERT INTO saas.shipping_shipment_events(id,store_id,shipment_id,status,occurred_at,created_at) VALUES(p_event_id,job.store_id,job.shipment_id,'ready',p_now,p_now);
  RETURN QUERY SELECT 'completed',saas.shipping_shipment_projection(job.store_id,job.shipment_id);
END
$function$;

CREATE FUNCTION saas.shipping_shipment_mark_unknown(
  p_job_id uuid,p_worker_id text,p_lease_id uuid,p_fence_token bigint,p_now timestamptz,p_event_id uuid,p_safe_code text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE job saas.shipping_fulfillment_jobs%ROWTYPE; shipment saas.shipping_shipments%ROWTYPE;
BEGIN
  IF p_event_id IS NULL OR p_safe_code!~'^[a-z][a-z0-9_]{1,63}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO job FROM saas.shipping_fulfillment_jobs value WHERE value.id=p_job_id FOR UPDATE;
  IF NOT FOUND OR job.job_kind<>'create_shipment' OR job.status<>'leased' OR job.lease_owner<>p_worker_id OR job.lease_id<>p_lease_id OR job.fence_token<>p_fence_token OR job.lease_expires_at<=p_now
  THEN RETURN QUERY SELECT 'lease_invalid',NULL::jsonb; RETURN; END IF;
  SELECT value.* INTO shipment FROM saas.shipping_shipments value WHERE value.store_id=job.store_id AND value.id=job.shipment_id FOR UPDATE;
  IF NOT FOUND OR shipment.status<>'creating' THEN RETURN QUERY SELECT 'shipment_stale',NULL::jsonb; RETURN; END IF;
  UPDATE saas.shipping_shipments SET status='provider_outcome_unknown',version=version+1,updated_at=p_now WHERE store_id=job.store_id AND id=job.shipment_id;
  UPDATE saas.shipping_fulfillment_jobs SET status='provider_outcome_unknown',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,safe_code=p_safe_code,version=version+1,updated_at=p_now WHERE id=job.id;
  INSERT INTO saas.shipping_shipment_events(id,store_id,shipment_id,status,safe_code,occurred_at,created_at)
    VALUES(p_event_id,job.store_id,job.shipment_id,'provider_outcome_unknown',p_safe_code,p_now,p_now);
  RETURN QUERY SELECT 'marked_unknown',saas.shipping_shipment_projection(job.store_id,job.shipment_id);
END
$function$;

CREATE FUNCTION saas.shipping_fulfillment_runtime_preflight()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
  SELECT saas.shipping_provider_preflight()
    AND (SELECT pg_catalog.count(*)=7 FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas' AND relation.relname IN('shipping_quote_sessions','shipping_quote_options','shipping_shipments','shipping_shipment_items','shipping_fulfillment_jobs','shipping_shipment_events','shipping_fulfillment_operations')
        AND relation.relrowsecurity AND relation.relforcerowsecurity)
    AND NOT pg_catalog.has_table_privilege('celebix_saas_app','saas.shipping_shipments','SELECT,INSERT,UPDATE,DELETE')
    AND NOT pg_catalog.has_table_privilege('celebix_saas_workflow','saas.shipping_fulfillment_jobs','SELECT,INSERT,UPDATE,DELETE')
$function$;

REVOKE ALL ON FUNCTION
  saas.shipping_package_batch_valid(jsonb),saas.shipping_quote_option_batch_valid(jsonb),
  saas.shipping_quote_projection(uuid,uuid),saas.shipping_shipment_projection(uuid,uuid),
  saas.shipping_quote_begin(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,jsonb,uuid,text,uuid,uuid,text),
  saas.shipping_quote_current(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.shipping_shipment_begin(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,uuid,uuid,text,uuid,uuid,uuid),
  saas.shipping_shipment_current(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.shipping_fulfillment_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),
  saas.shipping_fulfillment_claim(text,timestamptz,integer,uuid),
  saas.shipping_fulfillment_claim_job(uuid,text,timestamptz,integer,uuid),
  saas.shipping_fulfillment_open(uuid,text,uuid,bigint,timestamptz),
  saas.shipping_quote_complete(uuid,text,uuid,bigint,timestamptz,jsonb),
  saas.shipping_fulfillment_fail(uuid,text,uuid,bigint,timestamptz,text,text,integer),
  saas.shipping_shipment_complete(uuid,text,uuid,bigint,timestamptz,uuid,text,text,text,text,text,bigint),
  saas.shipping_shipment_mark_unknown(uuid,text,uuid,bigint,timestamptz,uuid,text),
  saas.shipping_fulfillment_runtime_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.shipping_quote_begin(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,jsonb,uuid,text,uuid,uuid,text),
  saas.shipping_quote_current(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.shipping_shipment_begin(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,uuid,uuid,text,uuid,uuid,uuid),
  saas.shipping_shipment_current(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.shipping_fulfillment_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),
  saas.shipping_fulfillment_runtime_preflight()
TO celebix_saas_app;

GRANT EXECUTE ON FUNCTION
  saas.shipping_fulfillment_claim(text,timestamptz,integer,uuid),
  saas.shipping_fulfillment_claim_job(uuid,text,timestamptz,integer,uuid),
  saas.shipping_fulfillment_open(uuid,text,uuid,bigint,timestamptz),
  saas.shipping_quote_complete(uuid,text,uuid,bigint,timestamptz,jsonb),
  saas.shipping_fulfillment_fail(uuid,text,uuid,bigint,timestamptz,text,text,integer),
  saas.shipping_shipment_complete(uuid,text,uuid,bigint,timestamptz,uuid,text,text,text,text,text,bigint),
  saas.shipping_shipment_mark_unknown(uuid,text,uuid,bigint,timestamptz,uuid,text),
  saas.shipping_fulfillment_runtime_preflight()
TO celebix_saas_workflow;

COMMIT;
