-- Native tenant marketplace persistence. Provider calls occur outside transactions.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.trendyol.release266',0));

CREATE TABLE saas.trendyol_connections(
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id),seller_id text NOT NULL CHECK(seller_id~'^[0-9]{1,30}$'),
 credential jsonb NOT NULL,pricing jsonb NOT NULL,webhook_hash text NOT NULL CHECK(webhook_hash~'^[a-f0-9]{64}$'),
 version bigint NOT NULL CHECK(version>0),config_version bigint NOT NULL DEFAULT 1,generation bigint NOT NULL DEFAULT 1,
 connected boolean NOT NULL DEFAULT true,last_orders_at timestamptz,last_error_code text,
 next_orders_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL
);
CREATE INDEX trendyol_connections_orders_due ON saas.trendyol_connections(next_orders_at)WHERE connected;
CREATE INDEX trendyol_connections_due ON saas.trendyol_connections(next_orders_at,store_id)WHERE connected;
CREATE TABLE saas.trendyol_listings(
 store_id uuid NOT NULL REFERENCES saas.stores(id),variant_id uuid NOT NULL,product_id uuid NOT NULL,
 mapping jsonb NOT NULL,version bigint NOT NULL DEFAULT 1,status text NOT NULL CHECK(status IN('queued','submitted','active','failed','excluded')),
 issue text,last_payload_fingerprint text,provider_submitted boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL,PRIMARY KEY(store_id,variant_id)
);
CREATE INDEX trendyol_listings_queued ON saas.trendyol_listings(store_id,variant_id)WHERE status='queued';
CREATE UNIQUE INDEX trendyol_listing_barcode ON saas.trendyol_listings(store_id,(mapping->>'barcode'));
CREATE TABLE saas.trendyol_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES saas.stores(id),kind text NOT NULL CHECK(kind IN('orders','order','catalog','batch','setup')),
 connection_version bigint NOT NULL,generation bigint NOT NULL,payload jsonb NOT NULL DEFAULT '{}',
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','leased','completed','failed','cancelled')),
 lease_id uuid,lease_until timestamptz,wake_revision bigint NOT NULL DEFAULT 0,lease_wake_revision bigint NOT NULL DEFAULT 0,attempts integer NOT NULL DEFAULT 0,next_at timestamptz NOT NULL,
 issue text,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX trendyol_jobs_coalesced ON saas.trendyol_jobs(store_id,kind)WHERE state IN('queued','leased')AND kind IN('orders','catalog','setup');
CREATE UNIQUE INDEX trendyol_jobs_order_coalesced ON saas.trendyol_jobs(store_id,(payload->>'orderNumber'))WHERE state IN('queued','leased')AND kind='order';
CREATE INDEX trendyol_jobs_due ON saas.trendyol_jobs(next_at,id)WHERE state IN('queued','leased');
CREATE TABLE saas.trendyol_operations(operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),membership_id uuid NOT NULL,action text NOT NULL,fingerprint text NOT NULL,result_payload jsonb NOT NULL,created_at timestamptz NOT NULL);
CREATE TABLE saas.trendyol_orders(
 store_id uuid NOT NULL REFERENCES saas.stores(id),seller_id text NOT NULL,external_order_id text NOT NULL,order_number text NOT NULL,
 order_id uuid,state text NOT NULL DEFAULT 'action_required',issue text,modified_at timestamptz,
 snapshot jsonb NOT NULL DEFAULT '[]',applied_fingerprint text,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,seller_id,external_order_id),UNIQUE(store_id,seller_id,order_number),UNIQUE(order_id)
);
CREATE TABLE saas.trendyol_packages(
 store_id uuid NOT NULL,seller_id text NOT NULL,external_order_id text NOT NULL,package_id text NOT NULL,
 modified_at timestamptz NOT NULL,fingerprint text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,seller_id,package_id),FOREIGN KEY(store_id,seller_id,external_order_id)REFERENCES saas.trendyol_orders(store_id,seller_id,external_order_id)
);
CREATE TABLE saas.trendyol_import_receipts(
 store_id uuid NOT NULL,seller_id text NOT NULL,external_order_id text NOT NULL,fingerprint text NOT NULL,
 snapshot jsonb NOT NULL,result_payload jsonb NOT NULL,created_at timestamptz NOT NULL,PRIMARY KEY(store_id,seller_id,external_order_id,fingerprint)
);
CREATE TABLE saas.trendyol_stock_commitments(
 store_id uuid NOT NULL,seller_id text NOT NULL,external_order_id text NOT NULL,variant_id uuid NOT NULL,location_id uuid NOT NULL,
 quantity bigint NOT NULL CHECK(quantity>=0),PRIMARY KEY(store_id,seller_id,external_order_id,variant_id,location_id)
);
CREATE TABLE saas.trendyol_writer_context(backend_pid integer NOT NULL,transaction_id bigint NOT NULL,order_id uuid NOT NULL,PRIMARY KEY(backend_pid,transaction_id,order_id));
CREATE TABLE saas.trendyol266_backup(signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,owner_id oid NOT NULL,acl aclitem[],config text[]);
CREATE TABLE saas.trendyol_catalog_dirty(store_id uuid PRIMARY KEY,cursor_variant uuid,due_at timestamptz NOT NULL);
CREATE INDEX trendyol_catalog_dirty_due ON saas.trendyol_catalog_dirty(due_at,store_id);
CREATE TABLE saas.trendyol_price_boundaries(store_id uuid NOT NULL,boundary_key text NOT NULL,due_at timestamptz NOT NULL,processed boolean NOT NULL DEFAULT false,PRIMARY KEY(store_id,boundary_key));
CREATE INDEX trendyol_price_boundaries_due ON saas.trendyol_price_boundaries(due_at)WHERE NOT processed;

DO $private$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['trendyol_connections','trendyol_listings','trendyol_jobs','trendyol_operations','trendyol_orders','trendyol_packages','trendyol_import_receipts','trendyol_stock_commitments','trendyol_writer_context','trendyol266_backup','trendyol_catalog_dirty','trendyol_price_boundaries']LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY trendyol_owner ON saas.%I TO celebix_saas_owner USING(true)WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_identity,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability',t);
 END LOOP;
END $private$;
CREATE TRIGGER trendyol_operations_immutable BEFORE UPDATE OR DELETE ON saas.trendyol_operations FOR EACH ROW EXECUTE FUNCTION saas.accounting_immutable();
CREATE TRIGGER trendyol_import_receipts_immutable BEFORE UPDATE OR DELETE ON saas.trendyol_import_receipts FOR EACH ROW EXECUTE FUNCTION saas.accounting_immutable();

CREATE FUNCTION saas.trendyol_enabled(p_store uuid,p_now timestamptz)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT p_now IS NOT NULL AND isfinite(p_now)AND EXISTS(SELECT 1 FROM saas.stores st JOIN saas.subscriptions s ON s.store_id=st.id JOIN saas.plans p ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version JOIN saas.plan_features f ON f.plan_id=p.id AND f.feature_key='marketplaces' AND f.enabled WHERE st.id=p_store AND st.status='active'AND st.currency='TRY'AND s.status='active'AND s.valid_from<=p_now AND(s.valid_until IS NULL OR s.valid_until>p_now)AND p.status='active'AND p.valid_from<=p_now AND(p.valid_until IS NULL OR p.valid_until>p_now))
$f$;
CREATE FUNCTION saas.trendyol_pricing_valid(p jsonb)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE k text;BEGIN
 IF jsonb_typeof(p)IS DISTINCT FROM 'object'OR NOT(p?&ARRAY['commissionBps','commissionVatIncluded','commissionVatBps','averageShippingCents','otherFeeCents','productVatBps','withholdingBps','coverWithholding','rounding'])OR(SELECT count(*)FROM jsonb_object_keys(p))<>9 THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['commissionBps','commissionVatBps','averageShippingCents','otherFeeCents','productVatBps','withholdingBps']LOOP IF jsonb_typeof(p->k)IS DISTINCT FROM 'number'OR p->>k!~'^[0-9]+$'OR(p->>k)::numeric>(CASE WHEN k IN('averageShippingCents','otherFeeCents')THEN 999999999999 ELSE 10000 END)THEN RETURN false;END IF;END LOOP;
 RETURN jsonb_typeof(p->'commissionVatIncluded')='boolean'AND jsonb_typeof(p->'coverWithholding')='boolean'AND p->>'rounding'IN('cent','lira','ninety')AND(p->>'commissionBps')::integer<10000;
EXCEPTION WHEN OTHERS THEN RETURN false;END $f$;
CREATE FUNCTION saas.trendyol_default_pricing()RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT '{"commissionBps":0,"commissionVatIncluded":true,"commissionVatBps":2000,"averageShippingCents":0,"otherFeeCents":0,"productVatBps":2000,"withholdingBps":100,"coverWithholding":false,"rounding":"cent"}'::jsonb
$f$;
CREATE FUNCTION saas.trendyol_enqueue(p_store uuid,p_kind text,p_payload jsonb,p_now timestamptz)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE c saas.trendyol_connections;BEGIN
 SELECT * INTO c FROM saas.trendyol_connections WHERE store_id=p_store AND connected;IF NOT FOUND THEN RETURN;END IF;
 IF p_kind IN('orders','catalog','setup')AND EXISTS(SELECT 1 FROM saas.trendyol_jobs WHERE store_id=p_store AND kind=p_kind AND state IN('queued','leased'))THEN IF p_kind='orders'THEN UPDATE saas.trendyol_jobs SET wake_revision=wake_revision+1 WHERE store_id=p_store AND kind='orders'AND state='leased';END IF;RETURN;END IF;
 IF p_kind='order'AND EXISTS(SELECT 1 FROM saas.trendyol_jobs WHERE store_id=p_store AND kind='order'AND state IN('queued','leased')AND payload->>'orderNumber'=p_payload->>'orderNumber')THEN UPDATE saas.trendyol_jobs SET wake_revision=wake_revision+1 WHERE store_id=p_store AND kind='order'AND state='leased'AND payload->>'orderNumber'=p_payload->>'orderNumber';RETURN;END IF;
 INSERT INTO saas.trendyol_jobs(store_id,kind,connection_version,generation,payload,next_at,created_at,updated_at)VALUES(p_store,p_kind,c.version,c.generation,coalesce(p_payload,'{}'),p_now,p_now,p_now);
END $f$;
CREATE FUNCTION saas.trendyol_product(p_store uuid,p_variant uuid,p_now timestamptz)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE v saas.product_variants;p saas.products;l saas.trendyol_listings;price record;BEGIN
 SELECT * INTO v FROM saas.product_variants WHERE store_id=p_store AND id=p_variant;SELECT * INTO p FROM saas.products WHERE store_id=p_store AND id=v.product_id;
 IF v.id IS NULL OR p.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO l FROM saas.trendyol_listings WHERE store_id=p_store AND variant_id=p_variant;
 SELECT * INTO price FROM saas.resolve_effective_variant_price(p_store,p_variant,'storefront',p_now,NULL);
 RETURN jsonb_build_object('productId',v.product_id,'variantId',v.id,'title',p.title||CASE WHEN v.title<>'Default'THEN ' / '||v.title ELSE ''END,'sku',v.sku,'barcode',v.barcode,'webPriceCents',CASE WHEN price.outcome='found'AND price.price_cents>0 THEN price.price_cents ELSE NULL END,'quantity',CASE WHEN v.stock_tracking AND v.status='active'AND p.status='active'THEN greatest(v.stock_quantity-saas.in_store_held_quantity(p_store,p_variant,NULL,NULL),0)ELSE 0 END,'mapping',l.mapping,'status',CASE WHEN l.mapping->>'enabled'='false'THEN 'excluded'ELSE coalesce(l.status,'not_configured')END,'issue',coalesce(l.issue,CASE WHEN l.variant_id IS NOT NULL AND NOT v.stock_tracking THEN 'stock_tracking_required'END),'updatedAt',saas.orders_json_timestamp(coalesce(l.updated_at,v.updated_at)));
END $f$;

CREATE FUNCTION saas.trendyol_dirty_store(p_store uuid,p_now timestamptz)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM saas.trendyol_connections WHERE store_id=p_store AND connected)THEN RETURN;END IF;
 INSERT INTO saas.trendyol_catalog_dirty VALUES(p_store,NULL,p_now)ON CONFLICT(store_id)DO UPDATE SET cursor_variant=NULL,due_at=least(saas.trendyol_catalog_dirty.due_at,excluded.due_at);
END $f$;
CREATE FUNCTION saas.trendyol_price_changed()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE body jsonb;sid uuid;moment timestamptz:=clock_timestamp();BEGIN
 body:=CASE WHEN TG_OP='DELETE'THEN to_jsonb(OLD)ELSE to_jsonb(NEW)END;sid:=(body->>'store_id')::uuid;PERFORM saas.trendyol_dirty_store(sid,moment);
 IF TG_TABLE_NAME='price_list_rules'THEN
  DELETE FROM saas.trendyol_price_boundaries WHERE store_id=sid AND boundary_key IN('rule:'||(body->>'id')||':start','rule:'||(body->>'id')||':end');
  IF TG_OP<>'DELETE'AND body->>'channel'='storefront'AND body->>'customer_tag_id'IS NULL THEN
   INSERT INTO saas.trendyol_price_boundaries VALUES(sid,'rule:'||(body->>'id')||':start',(body->>'starts_at')::timestamptz,(body->>'starts_at')::timestamptz<=moment);
   IF body->>'ends_at'IS NOT NULL THEN INSERT INTO saas.trendyol_price_boundaries VALUES(sid,'rule:'||(body->>'id')||':end',(body->>'ends_at')::timestamptz,(body->>'ends_at')::timestamptz<=moment);END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME IN('checkout_payment_attempts','quick_order_hosted_payment_bridges','storefront_hosted_checkout_sessions')AND TG_OP<>'DELETE'AND body->>'hold_expires_at'IS NOT NULL AND EXISTS(SELECT 1 FROM saas.trendyol_connections WHERE store_id=sid AND connected)THEN
  INSERT INTO saas.trendyol_price_boundaries VALUES(sid,'hold:'||TG_TABLE_NAME||':'||coalesce(body->>'id',body->>'attempt_id',body->>'payment_attempt_id'),(body->>'hold_expires_at')::timestamptz,(body->>'hold_expires_at')::timestamptz<=moment)ON CONFLICT(store_id,boundary_key)DO UPDATE SET due_at=excluded.due_at,processed=excluded.processed;
 END IF;RETURN NULL;
END $f$;
DO $triggers$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['price_lists','price_list_items','price_list_rules','pricing_reference_state','pricing_variant_policy_state','product_media','variant_media_links','variant_media_galleries','product_variant_gallery_state','catalog_variant_commerce_profiles','checkout_inventory_reservations','in_store_inventory_reservations','checkout_payment_attempts','quick_order_hosted_payment_bridges','storefront_hosted_checkout_sessions']LOOP
  EXECUTE format('CREATE TRIGGER trendyol_price_changed AFTER INSERT OR UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.trendyol_price_changed()',t);
 END LOOP;
END $triggers$;
INSERT INTO saas.trendyol_price_boundaries(store_id,boundary_key,due_at,processed)
 SELECT store_id,'rule:'||id||':start',starts_at,starts_at<=clock_timestamp()FROM saas.price_list_rules WHERE channel='storefront'AND customer_tag_id IS NULL
 UNION ALL SELECT store_id,'rule:'||id||':end',ends_at,ends_at<=clock_timestamp()FROM saas.price_list_rules WHERE channel='storefront'AND customer_tag_id IS NULL AND ends_at IS NOT NULL;

CREATE FUNCTION saas.trendyol_command(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_action text,p_input jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;c saas.trendyol_connections;op saas.trendyol_operations;operation uuid;result jsonb;items jsonb;v saas.product_variants;lim integer;cur uuid;last_id uuid;more boolean;listing_mapping jsonb;previous saas.trendyol_listings;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now)OR jsonb_typeof(p_input)IS DISTINCT FROM 'object'OR pg_column_size(p_input)>65536 OR p_action NOT IN('overview','products','connect','settings','map','sync','disconnect','credential','order_issues','receipt')THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'marketplaces',CASE WHEN p_action IN('overview','products','order_issues')THEN 'integrations.read'ELSE 'integrations.manage'END);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.trendyol_enabled(p_store_id,p_now)THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.trendyol.store:'||p_store_id,0));
 SELECT * INTO c FROM saas.trendyol_connections WHERE store_id=p_store_id FOR UPDATE;
 PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR SHARE;PERFORM 1 FROM saas.memberships WHERE id=p_membership_id AND store_id=p_store_id FOR SHARE;PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store_id FOR SHARE;
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'marketplaces',CASE WHEN p_action IN('overview','products','order_issues')THEN 'integrations.read'ELSE 'integrations.manage'END);IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_action='receipt'THEN
  IF p_input->>'targetAction'NOT IN('connect','settings','map','sync','disconnect')OR coalesce(p_input->>'fingerprint','')!~'^[a-f0-9]{64}$'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  SELECT * INTO op FROM saas.trendyol_operations WHERE operation_id=(p_input->>'operationId')::uuid;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found','{}'::jsonb;ELSIF op.store_id<>p_store_id OR op.membership_id<>p_membership_id OR op.action<>p_input->>'targetAction'OR op.fingerprint<>p_input->>'fingerprint'THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'found',op.result_payload||jsonb_build_object('replayed',true);END IF;RETURN;
 ELSIF p_action='overview'THEN
  RETURN QUERY SELECT 'found',jsonb_build_object('connection',jsonb_build_object('connected',coalesce(c.connected,false),'sellerId',c.seller_id,'status',CASE WHEN c.connected THEN CASE WHEN c.last_error_code IS NULL THEN 'connected'ELSE 'needs_attention'END ELSE 'disconnected'END,'version',coalesce(c.version,0),'settingsVersion',coalesce(c.config_version,0),'lastOrdersAt',CASE WHEN c.last_orders_at IS NULL THEN NULL ELSE saas.orders_json_timestamp(c.last_orders_at)END,'lastErrorCode',c.last_error_code),'pricing',coalesce(c.pricing,saas.trendyol_default_pricing()),'counts',(SELECT jsonb_build_object('mapped',count(*),'pending',count(*)FILTER(WHERE status IN('queued','submitted')),'failed',count(*)FILTER(WHERE status='failed')+(SELECT count(*)FROM saas.trendyol_orders WHERE store_id=p_store_id AND state='action_required'))FROM saas.trendyol_listings WHERE store_id=p_store_id),'webhookUrl',NULL);RETURN;
 ELSIF p_action='order_issues'THEN RETURN QUERY SELECT 'found',jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('orderId',order_id,'externalOrderId',external_order_id,'orderNumber',order_number,'state',state,'issue',issue))FROM(SELECT * FROM saas.trendyol_orders WHERE store_id=p_store_id ORDER BY updated_at DESC LIMIT 50)x),'[]'));RETURN;
 ELSIF p_action='credential'THEN IF NOT coalesce(c.connected,false)THEN RETURN QUERY SELECT 'not_connected',NULL::jsonb;RETURN;END IF;RETURN QUERY SELECT 'found',jsonb_build_object('credential',c.credential,'sellerId',c.seller_id,'credentialVersion',c.version,'connectionVersion',c.version,'generation',c.generation);RETURN;
 ELSIF p_action='products'THEN
  lim:=coalesce((p_input->>'limit')::integer,25);cur:=(p_input->>'cursor')::uuid;IF lim NOT BETWEEN 1 AND 50 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  WITH selected AS MATERIALIZED(SELECT id FROM saas.product_variants WHERE store_id=p_store_id AND status<>'archived'AND(cur IS NULL OR id>cur)ORDER BY id LIMIT lim+1),page AS(SELECT id FROM selected ORDER BY id LIMIT lim)SELECT coalesce(jsonb_agg(saas.trendyol_product(p_store_id,id,p_now)ORDER BY id),'[]'),(SELECT count(*)>lim FROM selected),(SELECT id FROM page ORDER BY id DESC LIMIT 1)INTO items,more,last_id FROM page;
  RETURN QUERY SELECT 'found',jsonb_build_object('items',items,'nextCursor',CASE WHEN more THEN last_id::text ELSE NULL END);RETURN;
 END IF;
 operation:=(p_input->>'operationId')::uuid;IF operation IS NULL OR coalesce(p_input->>'fingerprint','')!~'^[a-f0-9]{64}$'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.trendyol.operation:'||operation,0));
 SELECT * INTO op FROM saas.trendyol_operations WHERE operation_id=operation;
 IF FOUND THEN IF op.store_id<>p_store_id OR op.membership_id<>p_membership_id OR op.action<>p_action OR op.fingerprint<>p_input->>'fingerprint'THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'saved',op.result_payload||jsonb_build_object('replayed',true);END IF;RETURN;END IF;
 IF p_action IN('connect','settings','disconnect')AND(CASE WHEN p_action='settings'THEN coalesce(c.config_version,0)ELSE coalesce(c.version,0)END)IS DISTINCT FROM(p_input->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF p_action='connect'THEN
  IF coalesce(p_input->>'sellerId','')!~'^[1-9][0-9]{0,19}$'OR coalesce(p_input->>'webhookHash','')!~'^[a-f0-9]{64}$'OR saas.trendyol_pricing_valid(p_input->'pricing')IS NOT TRUE OR saas.merchant_provider_sealed_envelope_valid(p_input->'credential',p_input->'credential'->>'keyId')IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF c.seller_id IS NOT NULL AND c.seller_id<>p_input->>'sellerId'AND(EXISTS(SELECT 1 FROM saas.trendyol_orders WHERE store_id=p_store_id)OR EXISTS(SELECT 1 FROM saas.trendyol_listings WHERE store_id=p_store_id))THEN RETURN QUERY SELECT 'seller_change_blocked',NULL::jsonb;RETURN;END IF;
  UPDATE saas.trendyol_listings SET issue='provider_outcome_unknown'WHERE store_id=p_store_id AND variant_id IN(SELECT(x->>'variantId')::uuid FROM saas.trendyol_jobs q CROSS JOIN LATERAL jsonb_array_elements(coalesce(q.payload->'items','[]'))x WHERE q.store_id=p_store_id AND q.kind='catalog'AND q.state='leased'AND q.payload->>'dispatchStarted'='true');
  UPDATE saas.trendyol_jobs SET state='cancelled',lease_id=NULL,lease_until=NULL WHERE store_id=p_store_id AND state IN('queued','leased');
  UPDATE saas.trendyol_listings SET status='queued',provider_submitted=CASE WHEN status='submitted'THEN false ELSE provider_submitted END,version=version+1,updated_at=p_now WHERE store_id=p_store_id;
  INSERT INTO saas.trendyol_connections(store_id,seller_id,credential,pricing,webhook_hash,version,generation,created_at,updated_at)VALUES(p_store_id,p_input->>'sellerId',p_input->'credential',p_input->'pricing',p_input->>'webhookHash',1,1,p_now,p_now)ON CONFLICT(store_id)DO UPDATE SET seller_id=excluded.seller_id,credential=excluded.credential,pricing=excluded.pricing,webhook_hash=excluded.webhook_hash,version=saas.trendyol_connections.version+1,generation=saas.trendyol_connections.generation+1,config_version=saas.trendyol_connections.config_version+1,connected=true,last_error_code=NULL,next_orders_at=p_now,updated_at=p_now;
  PERFORM saas.trendyol_enqueue(p_store_id,'orders','{}',p_now);PERFORM saas.trendyol_enqueue(p_store_id,'catalog','{}',p_now);PERFORM saas.trendyol_enqueue(p_store_id,'setup','{}',p_now);
 ELSE
  IF NOT coalesce(c.connected,false)THEN RETURN QUERY SELECT 'not_connected',NULL::jsonb;RETURN;END IF;
  IF p_action='settings'THEN
   IF saas.trendyol_pricing_valid(p_input->'pricing')IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   UPDATE saas.trendyol_connections SET pricing=p_input->'pricing',config_version=config_version+1,updated_at=p_now WHERE store_id=p_store_id;
   UPDATE saas.trendyol_listings SET status=CASE WHEN(mapping->>'enabled')::boolean OR provider_submitted THEN 'queued'ELSE 'excluded'END,version=version+1,updated_at=p_now WHERE store_id=p_store_id;PERFORM saas.trendyol_enqueue(p_store_id,'catalog','{}',p_now);
  ELSIF p_action='map'THEN
   SELECT * INTO v FROM saas.product_variants WHERE store_id=p_store_id AND id=(p_input->>'variantId')::uuid AND status<>'archived';
   IF NOT FOUND OR coalesce(p_input->>'barcode','')!~'^[A-Za-z0-9._-]{1,100}$'OR jsonb_typeof(p_input->'enabled')IS DISTINCT FROM 'boolean'OR p_input->>'mode'NOT IN('existing','create')OR jsonb_typeof(p_input->'attributes')IS DISTINCT FROM 'array'OR jsonb_array_length(p_input->'attributes')>100 OR(p_input->>'vatRate')::numeric NOT BETWEEN 0 AND 100 OR(p_input->>'dimensionalWeight')::numeric NOT BETWEEN 0 AND 100000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   IF p_input->>'mode'='create'AND((p_input->>'categoryId')::bigint IS NULL OR(p_input->>'brandId')::bigint IS NULL)THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   SELECT * INTO previous FROM saas.trendyol_listings WHERE store_id=p_store_id AND variant_id=v.id FOR UPDATE;
   IF previous.mapping->>'barcode'IS DISTINCT FROM p_input->>'barcode'AND((previous.provider_submitted AND(previous.mapping->>'enabled'='true'OR previous.status IN('queued','submitted')))OR EXISTS(SELECT 1 FROM saas.trendyol_jobs q CROSS JOIN LATERAL jsonb_array_elements(coalesce(q.payload->'items','[]'))x WHERE q.store_id=p_store_id AND q.kind='catalog'AND q.state='leased'AND q.payload->>'dispatchStarted'='true'AND x->>'variantId'=v.id::text))THEN RETURN QUERY SELECT 'mapping_required',NULL::jsonb;RETURN;END IF;
   listing_mapping:=p_input-ARRAY['operationId','fingerprint'];
   INSERT INTO saas.trendyol_listings(store_id,variant_id,product_id,mapping,status,updated_at)VALUES(p_store_id,v.id,v.product_id,listing_mapping,CASE WHEN(p_input->>'enabled')::boolean THEN 'queued'ELSE 'excluded'END,p_now)ON CONFLICT(store_id,variant_id)DO UPDATE SET mapping=excluded.mapping,status=CASE WHEN excluded.mapping->>'enabled'='false'AND saas.trendyol_listings.provider_submitted THEN 'queued'ELSE excluded.status END,provider_submitted=CASE WHEN saas.trendyol_listings.mapping->>'barcode'IS DISTINCT FROM excluded.mapping->>'barcode'THEN false ELSE saas.trendyol_listings.provider_submitted END,last_payload_fingerprint=CASE WHEN saas.trendyol_listings.mapping->>'barcode'IS DISTINCT FROM excluded.mapping->>'barcode'THEN NULL ELSE saas.trendyol_listings.last_payload_fingerprint END,version=saas.trendyol_listings.version+1,issue=NULL,updated_at=p_now;
   PERFORM saas.trendyol_enqueue(p_store_id,'catalog','{}',p_now);PERFORM saas.trendyol_enqueue(p_store_id,'orders','{}',p_now);
  ELSIF p_action='sync'THEN UPDATE saas.trendyol_listings SET status='queued',version=version+1,updated_at=p_now WHERE store_id=p_store_id AND((mapping->>'enabled')::boolean OR provider_submitted);PERFORM saas.trendyol_enqueue(p_store_id,'catalog','{}',p_now);PERFORM saas.trendyol_enqueue(p_store_id,'orders','{}',p_now);
  ELSIF p_action='disconnect'THEN UPDATE saas.trendyol_connections SET connected=false,generation=generation+1,updated_at=p_now WHERE store_id=p_store_id;UPDATE saas.trendyol_jobs SET state='cancelled',lease_id=NULL,lease_until=NULL WHERE store_id=p_store_id AND state IN('queued','leased');
  END IF;
 END IF;
 IF p_action IN('map','sync','connect')THEN
  SELECT * INTO c FROM saas.trendyol_connections WHERE store_id=p_store_id;
  UPDATE saas.trendyol_jobs q SET state='queued',connection_version=c.version,generation=c.generation,next_at=p_now,lease_id=NULL,lease_until=NULL,issue=NULL,updated_at=p_now WHERE q.id IN(SELECT DISTINCT ON(f.payload->>'orderNumber')f.id FROM saas.trendyol_jobs f WHERE f.store_id=p_store_id AND f.kind='order'AND f.state='failed'AND NOT EXISTS(SELECT 1 FROM saas.trendyol_jobs active WHERE active.store_id=f.store_id AND active.kind='order'AND active.state IN('queued','leased')AND active.payload->>'orderNumber'=f.payload->>'orderNumber')ORDER BY f.payload->>'orderNumber',f.created_at DESC LIMIT 200);
  FOR result IN SELECT jsonb_build_object('orderNumber',order_number)FROM saas.trendyol_orders WHERE store_id=p_store_id AND state='action_required'AND issue<>'order_deleted'ORDER BY updated_at LIMIT 200 LOOP PERFORM saas.trendyol_enqueue(p_store_id,'order',result,p_now);END LOOP;END IF;
 result:=jsonb_build_object('saved',true,'replayed',false);INSERT INTO saas.trendyol_operations VALUES(operation,p_store_id,p_membership_id,p_action,p_input->>'fingerprint',result,p_now);RETURN QUERY SELECT 'saved',result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR unique_violation THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $f$;

CREATE FUNCTION saas.trendyol_job(p_id uuid,p_now timestamptz)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE j saas.trendyol_jobs;c saas.trendyol_connections;BEGIN
 SELECT * INTO j FROM saas.trendyol_jobs WHERE id=p_id;SELECT * INTO c FROM saas.trendyol_connections WHERE store_id=j.store_id;
 IF j.state<>'leased'OR j.lease_until<=p_now OR NOT c.connected OR c.version<>j.connection_version OR c.generation<>j.generation OR NOT saas.trendyol_enabled(j.store_id,p_now)THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('id',j.id,'storeId',j.store_id,'sellerId',c.seller_id,'connectionVersion',j.connection_version,'credentialVersion',c.version,'generation',j.generation,'leaseId',j.lease_id,'kind',j.kind,'payload',j.payload,'credential',c.credential,'pricing',c.pricing);
END $f$;

CREATE FUNCTION saas.trendyol_catalog_changed()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE changed integer;sid uuid;BEGIN
 sid:=NEW.store_id;
 IF TG_TABLE_NAME='product_variants'THEN
  UPDATE saas.trendyol_listings SET status='queued',version=version+1,updated_at=clock_timestamp()WHERE store_id=sid AND variant_id=NEW.id AND(mapping->>'enabled')::boolean AND issue IS DISTINCT FROM 'provider_outcome_unknown';
 ELSE
  UPDATE saas.trendyol_listings SET status='queued',version=version+1,updated_at=clock_timestamp()WHERE store_id=sid AND product_id=NEW.id AND(mapping->>'enabled')::boolean AND issue IS DISTINCT FROM 'provider_outcome_unknown';
 END IF;
 GET DIAGNOSTICS changed=ROW_COUNT;IF changed>0 THEN PERFORM saas.trendyol_enqueue(sid,'catalog','{}',clock_timestamp());END IF;RETURN NEW;
END $f$;
CREATE TRIGGER trendyol_variant_changed AFTER UPDATE OF price_cents,stock_quantity,status,sku,barcode,title,attributes ON saas.product_variants FOR EACH ROW EXECUTE FUNCTION saas.trendyol_catalog_changed();
CREATE TRIGGER trendyol_product_changed AFTER UPDATE OF title,description,status ON saas.products FOR EACH ROW EXECUTE FUNCTION saas.trendyol_catalog_changed();

-- A private transaction capability allows importer writes; arbitrary GUCs cannot bypass it.
CREATE FUNCTION saas.trendyol_order_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE oid uuid;sid uuid;BEGIN
 IF TG_TABLE_NAME='orders'THEN oid:=OLD.id;ELSIF TG_OP='DELETE'THEN oid:=OLD.order_id;ELSE oid:=NEW.order_id;END IF;sid:=coalesce(NEW.store_id,OLD.store_id);
 IF EXISTS(SELECT 1 FROM saas.trendyol_orders WHERE store_id=sid AND order_id=oid)AND NOT EXISTS(SELECT 1 FROM saas.trendyol_writer_context WHERE backend_pid=pg_backend_pid()AND transaction_id=txid_current()AND order_id=oid)THEN
  IF TG_OP='DELETE'AND saas.permanent_order_deletion_context(sid,oid)THEN RETURN OLD;END IF;
  IF TG_TABLE_NAME='orders'AND TG_OP='UPDATE'AND to_jsonb(NEW)-ARRAY['version','updated_at'] = to_jsonb(OLD)-ARRAY['version','updated_at']THEN RETURN NEW;END IF;
  RAISE EXCEPTION 'TRENDYOL_PROVIDER_MANAGED';
 END IF;
 IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;
END $f$;
CREATE TRIGGER trendyol_order_guard BEFORE UPDATE OR DELETE ON saas.orders FOR EACH ROW EXECUTE FUNCTION saas.trendyol_order_guard();
CREATE TRIGGER trendyol_order_item_guard BEFORE INSERT OR UPDATE OR DELETE ON saas.order_items FOR EACH ROW EXECUTE FUNCTION saas.trendyol_order_guard();

-- Preserve exact reviewed predecessor definitions and metadata for safe rollback.
DO $patch$DECLARE sig text;definition text;changed text;BEGIN
 FOREACH sig IN ARRAY ARRAY['saas.orders_edit_block_reason(uuid,uuid)','saas.order_events_enqueue_email()']LOOP
  SELECT pg_get_functiondef(p.oid)INTO STRICT definition FROM pg_proc p WHERE p.oid=sig::regprocedure;
  IF encode(sha256(convert_to(definition,'UTF8')),'hex')IS DISTINCT FROM(CASE WHEN sig='saas.orders_edit_block_reason(uuid,uuid)'THEN '89725ecd1f433c54f4b4223d6a6b2228632f4fda2e5c872c40a62444af095f9a'ELSE '6b86cba4bd16fa6d6ebf173c9771be1c4eee74c36e78b7ee92ef944b5849d13b'END)OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=sig::regprocedure AND proowner='celebix_saas_owner'::regrole AND proconfig=ARRAY['search_path=pg_catalog, saas']::text[])THEN RAISE EXCEPTION 'TRENDYOL266_PREDECESSOR_DRIFT';END IF;
  INSERT INTO saas.trendyol266_backup SELECT sig,definition,encode(sha256(convert_to(definition,'UTF8')),'hex'),NULL,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=sig::regprocedure;
  IF sig='saas.orders_edit_block_reason(uuid,uuid)'THEN
   IF position('BEGIN'IN definition)=0 OR position('SELECT * INTO o FROM saas.orders'IN definition)=0 THEN RAISE EXCEPTION 'TRENDYOL266_PREDECESSOR_DRIFT';END IF;
   changed:=replace(definition,'SELECT * INTO o FROM saas.orders','IF EXISTS(SELECT 1 FROM saas.trendyol_orders WHERE store_id=p_store AND order_id=p_order)THEN RETURN ''provider_managed'';END IF; SELECT * INTO o FROM saas.orders');
  ELSE
   IF position('IF NOT FOUND OR order_row.source=''manual_import'''IN definition)=0 THEN RAISE EXCEPTION 'TRENDYOL266_PREDECESSOR_DRIFT';END IF;
   changed:=replace(definition,'IF NOT FOUND OR order_row.source=''manual_import''','IF NOT FOUND OR EXISTS(SELECT 1 FROM saas.trendyol_orders WHERE store_id=NEW.store_id AND order_id=NEW.order_id)OR order_row.source=''manual_import''');
  END IF;
  EXECUTE changed;UPDATE saas.trendyol266_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(sig::regprocedure),'UTF8')),'hex')WHERE trendyol266_backup.signature=sig;
 END LOOP;
END $patch$;

CREATE FUNCTION saas.trendyol_import(p_store uuid,p_seller text,p_packages jsonb,p_complete boolean,p_now timestamptz)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
#variable_conflict use_column
<<ingest>>
DECLARE ext text;number text;fingerprint text;binding saas.trendyol_orders;snapshot jsonb;package jsonb;line jsonb;rows jsonb:='[]';row jsonb;desired jsonb:='{}';cancelled_by_variant jsonb:='{}';v saas.product_variants;variant uuid;matches integer;quantity bigint;cancelled bigint:=0;wanted bigint;committed bigint;delta bigint;remaining bigint;take bigint;b record;old_marker text;oid uuid;itemid uuid;position integer:=0;sub bigint:=0;discount bigint:=0;shipping bigint:=0;total bigint:=0;status_value text;issue_value text;result jsonb;latest timestamptz;ordered timestamptz;existing_order boolean;active_count integer:=0;units jsonb:='[]';unit jsonb;line_keys jsonb:='{}';has_units boolean;receipt saas.trendyol_import_receipts;new_state text;native_unit bigint;native_discount bigint;address_value jsonb;tracking_value jsonb;
BEGIN
 IF p_complete IS NOT TRUE OR jsonb_typeof(p_packages)IS DISTINCT FROM 'array'OR jsonb_array_length(p_packages)NOT BETWEEN 1 AND 100 OR pg_column_size(p_packages)>1048576 THEN RETURN jsonb_build_object('orderId',NULL,'state','action_required','issue','complete_order_required');END IF;
 ext:=p_packages->0->>'externalOrderId';number:=p_packages->0->>'orderNumber';
 IF coalesce(ext,'')=''OR length(ext)>200 OR coalesce(number,'')=''OR length(number)>200 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_packages)x WHERE x->>'externalOrderId'IS DISTINCT FROM ext OR x->>'orderNumber'IS DISTINCT FROM number OR x->>'currency'IS DISTINCT FROM 'TRY')THEN RETURN jsonb_build_object('orderId',NULL,'state','action_required','issue','invalid_order');END IF;
 fingerprint:=encode(sha256(convert_to(p_packages::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||p_store,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||p_store,0));
 SELECT * INTO binding FROM saas.trendyol_orders WHERE store_id=p_store AND seller_id=p_seller AND external_order_id=ext FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO saas.trendyol_orders(store_id,seller_id,external_order_id,order_number,created_at,updated_at)VALUES(p_store,p_seller,ext,number,p_now,p_now)RETURNING * INTO binding;
 END IF;
 SELECT * INTO receipt FROM saas.trendyol_import_receipts WHERE store_id=p_store AND seller_id=p_seller AND external_order_id=ext AND trendyol_import_receipts.fingerprint=ingest.fingerprint;
 IF FOUND AND binding.applied_fingerprint=fingerprint THEN RETURN receipt.result_payload||jsonb_build_object('state','unchanged');END IF;
 IF binding.order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store AND id=binding.order_id)THEN UPDATE saas.trendyol_orders SET state='action_required',issue='order_deleted',snapshot=p_packages,updated_at=p_now WHERE store_id=p_store AND seller_id=p_seller AND external_order_id=ext;RETURN jsonb_build_object('orderId',binding.order_id,'state','action_required','issue','order_deleted');END IF;
 FOR package IN SELECT value FROM jsonb_array_elements(p_packages)LOOP
  IF coalesce(package->>'packageId','')=''OR jsonb_typeof(package->'lines')IS DISTINCT FROM 'array'OR jsonb_array_length(package->'lines')>100 THEN issue_value:='invalid_package';EXIT;END IF;
  IF(SELECT count(*)FROM jsonb_array_elements(p_packages)x WHERE x->>'packageId'=package->>'packageId')<>1 THEN issue_value:='package_identity_conflict';EXIT;END IF;
  latest:=greatest(latest,(package->>'modifiedAt')::timestamptz);ordered:=least(ordered,(package->>'orderedAt')::timestamptz);
  IF EXISTS(SELECT 1 FROM saas.trendyol_packages pp WHERE pp.store_id=p_store AND pp.seller_id=p_seller AND pp.package_id=package->>'packageId'AND pp.external_order_id<>ext)THEN issue_value:='package_identity_conflict';EXIT;END IF;
  IF EXISTS(SELECT 1 FROM saas.trendyol_packages pp WHERE pp.store_id=p_store AND pp.seller_id=p_seller AND pp.package_id=package->>'packageId'AND pp.modified_at>(package->>'modifiedAt')::timestamptz)THEN RETURN jsonb_build_object('orderId',binding.order_id,'state','ignored_stale','issue',NULL);END IF;
  INSERT INTO saas.trendyol_packages VALUES(p_store,p_seller,ext,package->>'packageId',(package->>'modifiedAt')::timestamptz,encode(sha256(convert_to(package::text,'UTF8')),'hex'),package,p_now)ON CONFLICT(store_id,seller_id,package_id)DO UPDATE SET modified_at=excluded.modified_at,fingerprint=excluded.fingerprint,payload=excluded.payload;
  IF lower(package->>'status')IN('awaiting','verified')THEN issue_value:='payment_pending';EXIT;END IF;
  IF lower(package->>'status')='unpacked'THEN CONTINUE;END IF;
  active_count:=active_count+1;shipping:=shipping+coalesce((package->>'shippingCents')::bigint,0);
  FOR line IN SELECT value FROM jsonb_array_elements(package->'lines')LOOP
   quantity:=(line->>'quantity')::bigint;
   IF quantity NOT BETWEEN 1 AND 9999 OR(line->>'unitPriceCents')::bigint<0 OR(line->>'discountCents')::bigint<0 OR abs((line->>'totalCents')::bigint-(line->>'unitPriceCents')::bigint*quantity)>(CASE WHEN jsonb_array_length(coalesce(line->'unitIds','[]'))=quantity THEN quantity ELSE 0 END) OR coalesce(line->>'lineId','')=''THEN issue_value:='invalid_line';EXIT;END IF;
   SELECT count(*),min(candidate.id::text)::uuid INTO matches,variant FROM(SELECT DISTINCT pv.id FROM saas.product_variants pv LEFT JOIN saas.trendyol_listings l ON l.store_id=pv.store_id AND l.variant_id=pv.id WHERE pv.store_id=p_store AND pv.status='active'AND((coalesce(line->>'barcode','')<>''AND(pv.barcode=line->>'barcode'OR l.mapping->>'barcode'=line->>'barcode'))OR(coalesce(line->>'barcode','')=''AND coalesce(line->>'sku','')<>''AND pv.sku=line->>'sku')))candidate;
   IF matches<>1 THEN issue_value:='mapping_required';EXIT;END IF;
   SELECT * INTO v FROM saas.product_variants WHERE store_id=p_store AND id=variant;
   IF lower(package->>'status')IN('cancelled','canceled')OR(lower(package->>'status')NOT IN('returned','undelivered')AND lower(line->>'status')IN('cancelled','canceled'))THEN cancelled:=cancelled+quantity;cancelled_by_variant:=jsonb_set(cancelled_by_variant,ARRAY[variant::text],to_jsonb(coalesce((cancelled_by_variant->>variant::text)::bigint,0)+quantity));CONTINUE;END IF;
   has_units:=jsonb_typeof(line->'unitIds')='array'AND jsonb_array_length(line->'unitIds')=quantity;
   IF line_keys?(line->>'lineId')AND NOT has_units THEN issue_value:='ambiguous_split';EXIT;END IF;
   IF line_keys?(line->>'lineId')AND line_keys->> (line->>'lineId')<>'units'THEN issue_value:='ambiguous_split';EXIT;END IF;
   line_keys:=line_keys||jsonb_build_object(line->>'lineId',CASE WHEN has_units THEN 'units'ELSE 'no_units'END);
   IF has_units THEN FOR unit IN SELECT value FROM jsonb_array_elements(line->'unitIds')LOOP IF units@>jsonb_build_array(unit)THEN issue_value:='ambiguous_split';EXIT;END IF;units:=units||jsonb_build_array(unit);END LOOP;END IF;
   native_unit:=ceil(((line->>'totalCents')::numeric+(line->>'discountCents')::numeric)/quantity)::bigint;native_discount:=native_unit*quantity-(line->>'totalCents')::bigint;
   rows:=rows||jsonb_build_array(line||jsonb_build_object('unitPriceCents',native_unit,'discountCents',native_discount,'variantId',variant,'productId',v.product_id,'packageId',package->>'packageId'));
   IF v.stock_tracking THEN desired:=jsonb_set(desired,ARRAY[variant::text],to_jsonb(coalesce((desired->>variant::text)::bigint,0)+quantity));END IF;
   sub:=sub+native_unit*quantity;discount:=discount+native_discount;
  END LOOP;
  EXIT WHEN issue_value IS NOT NULL;
 END LOOP;
 IF latest IS NULL OR ordered IS NULL OR NOT isfinite(latest)OR NOT isfinite(ordered)THEN issue_value:='invalid_timestamp';END IF;
 IF active_count=0 AND issue_value IS NULL THEN issue_value:='unpacked_requires_reconciliation';END IF;
 IF jsonb_array_length(rows)>100 THEN issue_value:='line_limit';END IF;
 -- Persist every failed import as evidence outside the native mutation savepoint.
 IF issue_value IS NULL THEN
  BEGIN
   IF binding.applied_fingerprint IS NOT NULL AND fingerprint=binding.applied_fingerprint THEN RETURN jsonb_build_object('orderId',binding.order_id,'state','unchanged','issue',NULL);END IF;
   oid:=coalesce(binding.order_id,saas.inventory_deterministic_uuid('trendyol-native-order',p_store::text||':'||p_seller||':'||ext));existing_order:=binding.order_id IS NOT NULL;
   INSERT INTO saas.trendyol_writer_context VALUES(pg_backend_pid(),txid_current(),oid)ON CONFLICT DO NOTHING;
   UPDATE saas.trendyol_orders SET order_id=oid WHERE store_id=p_store AND seller_id=p_seller AND external_order_id=ext;
   PERFORM 1 FROM saas.product_variants WHERE store_id=p_store AND(id IN(SELECT key::uuid FROM jsonb_each(desired))OR id IN(SELECT variant_id FROM saas.trendyol_stock_commitments WHERE store_id=p_store AND seller_id=p_seller AND external_order_id=ext))ORDER BY id FOR UPDATE;
   FOR variant IN SELECT key::uuid FROM jsonb_each(desired)UNION SELECT variant_id FROM saas.trendyol_stock_commitments WHERE store_id=p_store AND seller_id=p_seller AND external_order_id=ext LOOP
    wanted:=coalesce((desired->>variant::text)::bigint,0);SELECT coalesce(sum(quantity),0)INTO committed FROM saas.trendyol_stock_commitments WHERE store_id=p_store AND seller_id=p_seller AND external_order_id=ext AND variant_id=variant;delta:=wanted-committed;
    IF delta<0 AND coalesce((cancelled_by_variant->>variant::text)::bigint,0)< -delta THEN RAISE EXCEPTION 'trendyol_ambiguous_quantity_reduction';END IF;
    IF delta>0 AND(SELECT stock_quantity-saas.in_store_held_quantity(p_store,variant,NULL,NULL)<delta FROM saas.product_variants WHERE store_id=p_store AND id=variant)THEN RAISE EXCEPTION 'trendyol_stock_conflict';END IF;
    remaining:=abs(delta);
    IF delta>0 THEN
     FOR b IN SELECT balance.*,loc.is_default FROM saas.inventory_balances balance JOIN saas.inventory_locations loc ON loc.store_id=balance.store_id AND loc.id=balance.location_id WHERE balance.store_id=p_store AND balance.variant_id=variant AND loc.status='active'ORDER BY loc.is_default DESC,balance.location_id FOR UPDATE OF balance LOOP
      EXIT WHEN remaining=0;take:=least(remaining,greatest(b.quantity-saas.in_store_held_quantity(p_store,variant,b.location_id,NULL),0));IF take=0 THEN CONTINUE;END IF;
      UPDATE saas.inventory_balances SET quantity=quantity-take,version=version+1,updated_at=greatest(updated_at,p_now)WHERE store_id=p_store AND variant_id=variant AND location_id=b.location_id;
      INSERT INTO saas.trendyol_stock_commitments VALUES(p_store,p_seller,ext,variant,b.location_id,take)ON CONFLICT(store_id,seller_id,external_order_id,variant_id,location_id)DO UPDATE SET quantity=saas.trendyol_stock_commitments.quantity+take;
      INSERT INTO saas.inventory_movements(id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,source_kind,source_id,occurred_at,created_at)VALUES(saas.inventory_deterministic_uuid('trendyol-stock-out',fingerprint||':'||variant||':'||b.location_id),p_store,b.location_id,variant,'checkout_sale','out',-take,'checkout_sale',oid,p_now,p_now);remaining:=remaining-take;
     END LOOP;
    ELSIF delta<0 THEN
     FOR b IN SELECT * FROM saas.trendyol_stock_commitments WHERE store_id=p_store AND seller_id=p_seller AND external_order_id=ext AND variant_id=variant AND quantity>0 ORDER BY location_id FOR UPDATE LOOP
      EXIT WHEN remaining=0;take:=least(remaining,b.quantity);
      UPDATE saas.inventory_balances SET quantity=quantity+take,version=version+1,updated_at=greatest(updated_at,p_now)WHERE store_id=p_store AND variant_id=variant AND location_id=b.location_id;
      UPDATE saas.trendyol_stock_commitments SET quantity=quantity-take WHERE store_id=p_store AND seller_id=p_seller AND external_order_id=ext AND variant_id=variant AND location_id=b.location_id;
      INSERT INTO saas.inventory_movements(id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,source_kind,source_id,occurred_at,created_at)VALUES(saas.inventory_deterministic_uuid('trendyol-stock-in',fingerprint||':'||variant||':'||b.location_id),p_store,b.location_id,variant,'catalog_adjustment','in',take,'catalog_adjustment',oid,p_now,p_now);remaining:=remaining-take;
     END LOOP;
    END IF;
    IF remaining<>0 THEN RAISE EXCEPTION 'trendyol_stock_conflict';END IF;
    old_marker:=current_setting('saas.inventory.source_marker',true);PERFORM set_config('saas.inventory.source_marker','inventory_managed',true);
    UPDATE saas.product_variants SET stock_quantity=saas.inventory_active_balance_total(p_store,variant),version=version+1,updated_at=greatest(updated_at,p_now)WHERE store_id=p_store AND id=variant;
    PERFORM set_config('saas.inventory.source_marker',coalesce(old_marker,''),true);
   END LOOP;
   status_value:=CASE WHEN jsonb_array_length(rows)=0 AND cancelled>0 THEN 'cancelled'WHEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_packages)x WHERE lower(x->>'status')NOT IN('delivered','returned','cancelled','canceled','unpacked'))THEN 'delivered'WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(p_packages)x WHERE lower(x->>'status')IN('shipped','intransit','delivered','returned'))THEN 'shipped'WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(p_packages)x WHERE lower(x->>'status')IN('picking','invoiced'))THEN 'preparing'ELSE 'confirmed'END;
   total:=sub+shipping-discount;
   address_value:=jsonb_strip_nulls(jsonb_build_object('recipientName',coalesce(nullif(p_packages->0->'shippingAddress'->>'recipientName',''),nullif(p_packages->0->'customer'->>'name',''),'Trendyol müşterisi'),'line1',coalesce(p_packages->0->'shippingAddress'->>'line1',p_packages->0->'shippingAddress'->>'address1',p_packages->0->'shippingAddress'->>'fullAddress'),'line2',coalesce(p_packages->0->'shippingAddress'->>'line2',p_packages->0->'shippingAddress'->>'address2'),'city',p_packages->0->'shippingAddress'->>'city','district',p_packages->0->'shippingAddress'->>'district','country',coalesce(p_packages->0->'shippingAddress'->>'country',p_packages->0->'shippingAddress'->>'countryCode','TR'),'postalCode',p_packages->0->'shippingAddress'->>'postalCode'));
   IF saas.orders_address_valid(address_value)IS NOT TRUE THEN RAISE EXCEPTION 'trendyol_address_required';END IF;
   SELECT jsonb_strip_nulls(jsonb_build_object('carrier',x->'tracking'->>'carrier','trackingNumber',x->'tracking'->>'code','trackingUrl',x->'tracking'->>'url'))INTO tracking_value FROM jsonb_array_elements(p_packages)x WHERE coalesce(x->'tracking'->>'carrier','')<>''AND coalesce(x->'tracking'->>'code','')<>''AND lower(x->>'status')<>'unpacked'ORDER BY x->>'packageId'LIMIT 1;
   IF NOT existing_order THEN
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at,paid_at,tracking)VALUES(oid,p_store,'TY-'||substr(replace(oid::text,'-',''),1,24),'marketplace',coalesce(nullif(p_packages->0->'customer'->>'name',''),'Trendyol müşterisi'),coalesce(p_packages->0->'customer'->>'email',''),p_packages->0->'customer'->>'phone','TRY',sub,shipping,discount,total,status_value,'completed',address_value,1,ordered,greatest(ordered,p_now),ordered,tracking_value);
   ELSE
    UPDATE saas.orders SET subtotal_cents=sub,shipping_cents=shipping,discount_cents=discount,total_cents=total,status=status_value,shipping_address=address_value,tracking=coalesce(tracking_value,tracking),version=version+1,updated_at=greatest(updated_at,p_now)WHERE store_id=p_store AND id=oid;
   END IF;
   DELETE FROM saas.order_items WHERE store_id=p_store AND order_id=oid;
   FOR row IN SELECT value FROM jsonb_array_elements(rows)LOOP
    itemid:=saas.inventory_deterministic_uuid('trendyol-order-item',oid::text||':'||(row->>'packageId')||':'||(row->>'lineId'));
    INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)VALUES(itemid,p_store,oid,(row->>'productId')::uuid,(row->>'variantId')::uuid,position,row->>'title',row->>'sku',(row->>'unitPriceCents')::bigint,(row->>'quantity')::integer,(row->>'discountCents')::bigint,(row->>'totalCents')::bigint,p_now);position:=position+1;
   END LOOP;
   IF NOT existing_order THEN INSERT INTO saas.order_events(id,store_id,order_id,event_type,message,payload,created_at)VALUES(saas.inventory_deterministic_uuid('trendyol-created',oid::text),p_store,oid,'order_created','Trendyol siparişi alındı',jsonb_build_object('provider','trendyol','externalOrderNumber',number),p_now);END IF;
   DELETE FROM saas.trendyol_writer_context WHERE backend_pid=pg_backend_pid()AND transaction_id=txid_current()AND order_id=oid;
   new_state:=CASE WHEN existing_order THEN 'updated'ELSE 'imported'END;result:=jsonb_build_object('orderId',oid,'state',new_state,'issue',NULL);
   UPDATE saas.trendyol_orders SET state='imported',issue=NULL,modified_at=latest,snapshot=p_packages,applied_fingerprint=fingerprint,updated_at=p_now WHERE store_id=p_store AND seller_id=p_seller AND external_order_id=ext;
   UPDATE saas.trendyol_connections SET last_error_code=(SELECT issue FROM saas.trendyol_orders WHERE store_id=p_store AND state='action_required'ORDER BY updated_at DESC LIMIT 1)WHERE store_id=p_store;
   INSERT INTO saas.trendyol_import_receipts VALUES(p_store,p_seller,ext,fingerprint,p_packages,result,p_now)ON CONFLICT DO NOTHING;RETURN result;
  EXCEPTION WHEN SQLSTATE 'P0246'THEN issue_value:='quota_blocked';WHEN OTHERS THEN issue_value:=CASE WHEN SQLERRM='trendyol_ambiguous_quantity_reduction'THEN 'ambiguous_split'WHEN SQLERRM LIKE '%stock%'OR SQLERRM LIKE '%INVENTORY%'THEN 'stock_conflict'ELSE 'import_conflict'END;
  END;
 END IF;
 UPDATE saas.trendyol_orders SET state='action_required',issue=issue_value,snapshot=p_packages,modified_at=latest,updated_at=p_now WHERE store_id=p_store AND seller_id=p_seller AND external_order_id=ext;
 UPDATE saas.trendyol_connections SET last_error_code=issue_value WHERE store_id=p_store;
 RETURN jsonb_build_object('orderId',binding.order_id,'state','action_required','issue',issue_value);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN RETURN jsonb_build_object('orderId',NULL,'state','action_required','issue','invalid_order');END $f$;

CREATE FUNCTION saas.trendyol_batch_items(p_payload jsonb,p_result jsonb)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(jsonb_agg(original||received),'[]')FROM jsonb_array_elements(coalesce(p_payload->'items','[]'))original JOIN jsonb_array_elements(coalesce(p_result->'items','[]'))received ON received->>'variantId'=original->>'variantId'WHERE received->>'status'='submitted'AND(NOT received?'mappingVersion'OR received->>'mappingVersion'=original->>'mappingVersion')
$f$;

CREATE FUNCTION saas.trendyol_workflow(p_action text,p_input jsonb,p_now timestamptz)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE j saas.trendyol_jobs;c saas.trendyol_connections;items jsonb:='[]';job jsonb;entry record;lim integer;result jsonb;next_time timestamptz;row jsonb;variant uuid;version_value bigint;last_variant uuid;seen integer;claimed_ids uuid[]:='{}';
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now)OR jsonb_typeof(p_input)IS DISTINCT FROM 'object'OR pg_column_size(p_input)>1200000 OR p_action NOT IN('claim','read','complete','defer','import','webhook','dispatch')THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_action='webhook'THEN
  SELECT * INTO c FROM saas.trendyol_connections WHERE store_id=(p_input->>'storeId')::uuid FOR UPDATE;
  IF NOT FOUND OR NOT c.connected OR c.webhook_hash IS DISTINCT FROM p_input->>'webhookHash'OR NOT saas.trendyol_enabled(c.store_id,p_now)THEN RETURN QUERY SELECT 'denied',NULL::jsonb;RETURN;END IF;
  PERFORM saas.trendyol_enqueue(c.store_id,'orders','{}',p_now);RETURN QUERY SELECT 'accepted',jsonb_build_object('accepted',true);RETURN;
 ELSIF p_action='claim'THEN
  FOR entry IN SELECT * FROM saas.trendyol_jobs WHERE state='leased'AND kind='catalog'AND lease_until<=p_now AND payload->>'dispatchStarted'='true'FOR UPDATE SKIP LOCKED LOOP
   UPDATE saas.trendyol_jobs SET state='failed',issue='provider_outcome_unknown',lease_id=NULL,lease_until=NULL,updated_at=p_now WHERE id=entry.id;
   UPDATE saas.trendyol_listings SET status='failed',issue='provider_outcome_unknown',updated_at=p_now WHERE store_id=entry.store_id AND variant_id IN(SELECT(x->>'variantId')::uuid FROM jsonb_array_elements(coalesce(entry.payload->'items','[]'))x);
   UPDATE saas.trendyol_connections SET last_error_code='provider_outcome_unknown'WHERE store_id=entry.store_id;
  END LOOP;
  lim:=coalesce((p_input->>'limit')::integer,2);IF lim NOT BETWEEN 1 AND 2 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.trendyol.claim',0));
  FOR c IN SELECT * FROM saas.trendyol_connections WHERE connected AND next_orders_at<=p_now ORDER BY next_orders_at LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
   IF saas.trendyol_enabled(c.store_id,p_now)THEN PERFORM saas.trendyol_enqueue(c.store_id,'orders','{}',p_now);PERFORM saas.trendyol_dirty_store(c.store_id,p_now);UPDATE saas.trendyol_connections SET next_orders_at=p_now+interval '10 minutes'WHERE store_id=c.store_id;END IF;
  END LOOP;
  FOR entry IN SELECT * FROM saas.trendyol_price_boundaries WHERE NOT processed AND due_at<=p_now ORDER BY due_at LIMIT 5 FOR UPDATE SKIP LOCKED LOOP PERFORM saas.trendyol_dirty_store(entry.store_id,p_now);UPDATE saas.trendyol_price_boundaries SET processed=true WHERE store_id=entry.store_id AND boundary_key=entry.boundary_key;END LOOP;
  FOR entry IN SELECT * FROM saas.trendyol_catalog_dirty WHERE due_at<=p_now ORDER BY due_at LIMIT 5 FOR UPDATE SKIP LOCKED LOOP
   WITH page AS MATERIALIZED(SELECT variant_id FROM saas.trendyol_listings WHERE store_id=entry.store_id AND(entry.cursor_variant IS NULL OR variant_id>entry.cursor_variant)AND(mapping->>'enabled')::boolean AND issue IS DISTINCT FROM 'provider_outcome_unknown'ORDER BY variant_id LIMIT 100),changed AS(UPDATE saas.trendyol_listings l SET status='queued',version=version+1,updated_at=p_now FROM page WHERE l.store_id=entry.store_id AND l.variant_id=page.variant_id RETURNING l.variant_id)SELECT max(variant_id::text)::uuid,count(*)INTO last_variant,seen FROM page;
   IF seen<100 THEN DELETE FROM saas.trendyol_catalog_dirty WHERE store_id=entry.store_id;ELSE UPDATE saas.trendyol_catalog_dirty SET cursor_variant=last_variant WHERE store_id=entry.store_id;END IF;
   PERFORM saas.trendyol_enqueue(entry.store_id,'catalog','{}',p_now);
  END LOOP;
  lim:=least(lim,greatest(2-(SELECT count(*)::integer FROM saas.trendyol_jobs WHERE state='leased'AND lease_until>p_now),0));
  FOR j IN SELECT q.* FROM saas.trendyol_jobs q JOIN saas.trendyol_connections conn ON conn.store_id=q.store_id AND conn.connected AND conn.version=q.connection_version AND conn.generation=q.generation WHERE(q.state='queued'OR(q.state='leased'AND q.lease_until<=p_now))AND q.next_at<=p_now AND saas.trendyol_enabled(q.store_id,p_now)ORDER BY q.next_at,CASE q.kind WHEN 'orders'THEN 0 WHEN 'catalog'THEN 1 WHEN 'setup'THEN 2 ELSE 3 END,q.id LIMIT lim FOR UPDATE OF q SKIP LOCKED LOOP
   IF j.kind='catalog'THEN
    SELECT coalesce(jsonb_agg(saas.trendyol_product(j.store_id,l.variant_id,p_now)||jsonb_build_object('mappingVersion',l.version,'lastPayloadFingerprint',l.last_payload_fingerprint,'providerSubmitted',l.provider_submitted,'description',p.description,'images',coalesce((SELECT jsonb_agg(public_url ORDER BY sort_order,id)FROM saas.product_media WHERE store_id=l.store_id AND product_id=l.product_id AND status='active'),'[]'))),'[]')INTO items FROM(SELECT * FROM saas.trendyol_listings WHERE store_id=j.store_id AND status='queued'ORDER BY variant_id LIMIT 50)l JOIN saas.products p ON p.store_id=l.store_id AND p.id=l.product_id;
    j.payload:=jsonb_build_object('items',items);
   ELSIF j.kind='orders'AND j.payload='{}'::jsonb THEN SELECT * INTO c FROM saas.trendyol_connections WHERE store_id=j.store_id;j.payload:=jsonb_build_object('start',saas.orders_json_timestamp(coalesce(c.last_orders_at-interval '5 minutes',p_now-interval '1 day')),'end',saas.orders_json_timestamp(least(p_now,coalesce(c.last_orders_at-interval '5 minutes',p_now-interval '1 day')+interval '14 days')),'cursor',NULL,'catchup',coalesce(c.last_orders_at-interval '5 minutes',p_now-interval '1 day')+interval '14 days'<p_now);END IF;
   UPDATE saas.trendyol_jobs SET payload=j.payload,state='leased',lease_id=gen_random_uuid(),lease_until=p_now+interval '120 seconds',lease_wake_revision=wake_revision,attempts=attempts+1,updated_at=p_now WHERE id=j.id;claimed_ids:=array_append(claimed_ids,j.id);
  END LOOP;
  SELECT coalesce(jsonb_agg(saas.trendyol_job(id,p_now)ORDER BY id),'[]')INTO items FROM saas.trendyol_jobs WHERE id=ANY(claimed_ids);
  RETURN QUERY SELECT 'claimed',jsonb_build_object('jobs',items);RETURN;
 END IF;
 SELECT * INTO j FROM saas.trendyol_jobs WHERE id=(p_input->>'jobId')::uuid;
 IF NOT FOUND THEN RETURN QUERY SELECT 'stale',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.trendyol.store:'||j.store_id,0));
 SELECT * INTO c FROM saas.trendyol_connections WHERE store_id=j.store_id FOR UPDATE;
 SELECT * INTO j FROM saas.trendyol_jobs WHERE id=j.id FOR UPDATE;
 IF j.state<>'leased'OR j.lease_id IS DISTINCT FROM(p_input->>'leaseId')::uuid OR j.generation IS DISTINCT FROM(p_input->>'generation')::bigint OR j.connection_version IS DISTINCT FROM(p_input->>'connectionVersion')::bigint OR j.lease_until<=p_now OR c.connected IS NOT TRUE OR c.version<>j.connection_version OR c.generation<>j.generation OR NOT saas.trendyol_enabled(j.store_id,p_now)THEN RETURN QUERY SELECT 'stale',NULL::jsonb;RETURN;END IF;
 IF p_action IN('read','dispatch')AND j.kind='catalog'AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(j.payload->'items','[]'))x LEFT JOIN saas.trendyol_listings l ON l.store_id=j.store_id AND l.variant_id=(x->>'variantId')::uuid WHERE l.version IS DISTINCT FROM(x->>'mappingVersion')::bigint)THEN
  IF j.payload->>'dispatchStarted'='true'THEN
   UPDATE saas.trendyol_jobs SET state='failed',issue='provider_outcome_unknown',lease_id=NULL,lease_until=NULL,updated_at=p_now WHERE id=j.id;
   UPDATE saas.trendyol_listings SET status='failed',issue='provider_outcome_unknown',updated_at=p_now WHERE store_id=j.store_id AND variant_id IN(SELECT(x->>'variantId')::uuid FROM jsonb_array_elements(coalesce(j.payload->'items','[]'))x);
  ELSE UPDATE saas.trendyol_jobs SET state='queued',lease_id=NULL,lease_until=NULL,next_at=p_now,updated_at=p_now WHERE id=j.id;END IF;
  RETURN QUERY SELECT 'stale',NULL::jsonb;RETURN;
 END IF;
 IF p_action='dispatch'THEN IF j.kind<>'catalog'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;UPDATE saas.trendyol_jobs SET payload=payload||jsonb_build_object('dispatchStarted',true),updated_at=p_now WHERE id=j.id;RETURN QUERY SELECT 'saved',jsonb_build_object('saved',true);RETURN;
 ELSIF p_action='read'THEN
  RETURN QUERY SELECT 'found',jsonb_build_object('job',saas.trendyol_job(j.id,p_now));RETURN;
 ELSIF p_action='import'THEN IF j.kind NOT IN('orders','order')THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;IF j.kind='order'AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_input->'packages')x WHERE x->>'orderNumber'IS DISTINCT FROM j.payload->>'orderNumber')THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;result:=saas.trendyol_import(j.store_id,c.seller_id,p_input->'packages',(p_input->>'completeOrder')::boolean,p_now);RETURN QUERY SELECT result->>'state',result;RETURN;
 ELSIF p_action='defer'THEN
  UPDATE saas.trendyol_jobs SET state=CASE WHEN p_input->>'code'IN('provider_outcome_unknown','provider_rejected','provider_denied','invalid_input','needs_reconnect','order_evidence_invalid')THEN 'failed'ELSE 'queued'END,payload=CASE WHEN p_input->>'code'='provider_outcome_unknown'THEN payload ELSE payload-'dispatchStarted'END,lease_id=NULL,lease_until=NULL,next_at=p_now+make_interval(secs=>greatest(5,least(coalesce((p_input->>'retryAfterSeconds')::integer,60),3600))),issue=CASE WHEN p_input->>'code'~'^[a-z0-9_]{1,80}$'THEN p_input->>'code'ELSE 'provider_error'END,updated_at=p_now WHERE id=j.id;
  UPDATE saas.trendyol_connections SET last_error_code=CASE WHEN p_input->>'code'IN('provider_outcome_unknown','provider_rejected','provider_denied','invalid_input','needs_reconnect','order_evidence_invalid','provider_timeout','provider_unavailable','provider_limit')THEN p_input->>'code'ELSE 'provider_error'END WHERE store_id=j.store_id;IF p_input->>'code'IN('provider_outcome_unknown','provider_rejected','provider_denied','invalid_input','needs_reconnect','order_evidence_invalid')THEN UPDATE saas.trendyol_listings SET status='failed',issue=p_input->>'code',updated_at=p_now WHERE store_id=j.store_id AND variant_id IN(SELECT(x->>'variantId')::uuid FROM jsonb_array_elements(coalesce(j.payload->'items','[]'))x);END IF;
 ELSE
  IF j.kind IN('catalog','batch')THEN
   FOR row IN SELECT value FROM jsonb_array_elements(coalesce(p_input->'items','[]'))LOOP
    variant:=(row->>'variantId')::uuid;IF row->>'status'NOT IN('submitted','active','failed')THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
    SELECT (x->>'mappingVersion')::bigint INTO version_value FROM jsonb_array_elements(coalesce(j.payload->'items','[]'))x WHERE x->>'variantId'=variant::text LIMIT 1;
    UPDATE saas.trendyol_listings SET status=CASE WHEN row->>'requeue'='true'THEN 'queued'ELSE row->>'status'END,last_payload_fingerprint=CASE WHEN row->>'status'='active'AND row->>'fingerprint'~'^[a-f0-9]{64}$'THEN row->>'fingerprint'ELSE last_payload_fingerprint END,provider_submitted=provider_submitted OR(row->>'status'IN('submitted','active')),issue=CASE WHEN row->>'status'='failed'THEN CASE WHEN row->>'issue'IN('provider_outcome_unknown','mapping_required','stock_tracking_required','provider_rejected')THEN row->>'issue'ELSE 'provider_rejected'END ELSE NULL END,updated_at=p_now WHERE store_id=j.store_id AND variant_id=variant AND version_value IS NOT NULL AND version=version_value;
   END LOOP;
   IF j.kind='catalog'AND jsonb_array_length(saas.trendyol_batch_items(j.payload,p_input))>0 THEN PERFORM saas.trendyol_enqueue(j.store_id,'batch',jsonb_build_object('batchId',nullif(p_input->>'batchId',''),'batchComplete',coalesce(p_input->>'batchId','')='','items',saas.trendyol_batch_items(j.payload,p_input),'outcomes',coalesce(p_input->'items','[]')),p_now+CASE WHEN coalesce(p_input->>'batchId','')=''THEN interval '5 minutes'ELSE interval '10 seconds'END);END IF;
  END IF;
  IF j.kind='orders'THEN
   IF jsonb_typeof(coalesce(p_input->'orderNumbers','[]'))<>'array'OR jsonb_array_length(coalesce(p_input->'orderNumbers','[]'))>200 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   FOR row IN SELECT value FROM jsonb_array_elements(coalesce(p_input->'orderNumbers','[]'))LOOP IF jsonb_typeof(row)<>'string'OR length(row#>>'{}')NOT BETWEEN 1 AND 200 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;PERFORM saas.trendyol_enqueue(j.store_id,'order',jsonb_build_object('orderNumber',row#>>'{}'),p_now);END LOOP;
  END IF;
  IF j.kind='batch'AND p_input->>'pending'='true'THEN UPDATE saas.trendyol_jobs SET state='queued',payload=payload||jsonb_build_object('batchComplete',coalesce((payload->>'batchComplete')::boolean,false)OR coalesce(p_input->>'batchComplete'='true',false),'outcomes',coalesce(p_input->'items','[]')),next_at=p_now+interval '5 minutes',lease_id=NULL,lease_until=NULL,updated_at=p_now WHERE id=j.id;
  ELSIF j.kind='orders'AND coalesce(p_input->>'cursor','')<>''THEN UPDATE saas.trendyol_jobs SET state='queued',payload=jsonb_set(payload,'{cursor}',p_input->'cursor'),next_at=p_now+interval '5 seconds',lease_id=NULL,lease_until=NULL,updated_at=p_now WHERE id=j.id;
  ELSIF j.kind IN('orders','order')AND j.wake_revision>j.lease_wake_revision THEN
   UPDATE saas.trendyol_jobs SET state='queued',payload=CASE WHEN j.kind='orders'THEN '{}'::jsonb ELSE payload END,next_at=p_now+interval '5 seconds',lease_id=NULL,lease_until=NULL,updated_at=p_now WHERE id=j.id;
   IF j.kind='orders'THEN UPDATE saas.trendyol_connections SET last_orders_at=coalesce((p_input->>'nextStart')::timestamptz,(j.payload->>'end')::timestamptz,p_now)WHERE store_id=j.store_id;END IF;
  ELSE
   UPDATE saas.trendyol_jobs SET state='completed',lease_id=NULL,lease_until=NULL,updated_at=p_now WHERE id=j.id;
   IF j.kind='orders'THEN UPDATE saas.trendyol_connections SET last_orders_at=coalesce((p_input->>'nextStart')::timestamptz,(j.payload->>'end')::timestamptz,p_now),next_orders_at=CASE WHEN j.payload->>'catchup'='true'THEN p_now+interval '5 seconds'ELSE p_now+interval '10 minutes'END WHERE store_id=j.store_id;END IF;
   IF j.kind IN('catalog','batch')AND EXISTS(SELECT 1 FROM saas.trendyol_listings WHERE store_id=j.store_id AND status='queued')THEN PERFORM saas.trendyol_enqueue(j.store_id,'catalog','{}',p_now+interval '5 seconds');END IF;
  END IF;
  IF j.kind='batch'AND EXISTS(SELECT 1 FROM saas.trendyol_listings WHERE store_id=j.store_id AND status='queued')THEN PERFORM saas.trendyol_enqueue(j.store_id,'catalog','{}',p_now+interval '5 seconds');END IF;
 END IF;
 RETURN QUERY SELECT CASE WHEN p_action='defer'THEN CASE WHEN p_input->>'code'IN('provider_outcome_unknown','provider_rejected','provider_denied','invalid_input','needs_reconnect','order_evidence_invalid')THEN 'failed'ELSE 'deferred'END ELSE 'completed'END,jsonb_build_object('saved',true);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;END $f$;

DO $acl$DECLARE r record;BEGIN
 FOR r IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'trendyol_%'LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability',r.signature);END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION saas.trendyol_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.trendyol_workflow(text,jsonb,timestamptz)TO celebix_saas_workflow;
COMMIT;
