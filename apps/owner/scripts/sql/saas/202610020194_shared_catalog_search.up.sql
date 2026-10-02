-- One transactional, tenant-scoped search document for every public product.
-- The external index contains matching metadata only; live price/stock remains SQL authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.catalog_search_documents') IS NOT NULL
    OR pg_catalog.to_regclass('saas.products') IS NULL
    OR pg_catalog.to_regclass('saas.product_variants') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_search_products(text,timestamptz,text,integer,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_catalog_query_v2(text,timestamptz,text,text,text,text,integer,integer)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_catalog_collection_query(text,timestamptz,text,text,text,text,integer,integer)') IS NULL
  THEN RAISE EXCEPTION 'SHARED_CATALOG_SEARCH_PREREQUISITE_INVALID'; END IF;
END $precondition$;

-- pg_trgm is trusted on PostgreSQL 16. Existing installations keep their schema.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA saas;

CREATE FUNCTION saas.catalog_search_normalize(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $f$
  SELECT pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.translate(
      pg_catalog.normalize(p_value,'NFKD'),'IİıÇĞÖŞÜçğöşü','iiiCGOSUcgosu')),
      U&'[\0300-\036f]','','g'), '[[:space:]\u00a0]+',' ','g'))
$f$;

CREATE FUNCTION saas.catalog_search_query_tokens(p_query text)
RETURNS tsquery LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog,saas AS $f$
  SELECT pg_catalog.to_tsquery('simple'::regconfig,COALESCE(pg_catalog.string_agg(pg_catalog.quote_literal(token)||':*',' & '),''))
  FROM (SELECT DISTINCT token FROM pg_catalog.regexp_split_to_table(saas.catalog_search_normalize(p_query),'[^[:alnum:]]+') token WHERE token<>'') tokens
$f$;

CREATE TABLE saas.catalog_search_documents(
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  title_key text NOT NULL,
  search_text text NOT NULL,
  title_tokens tsvector NOT NULL,
  search_tokens tsvector NOT NULL,
  skus text[] NOT NULL,
  barcodes text[] NOT NULL,
  document jsonb NOT NULL,
  PRIMARY KEY(store_id,product_id),
  CHECK(pg_catalog.char_length(search_text)<=100000),
  CHECK(pg_catalog.jsonb_typeof(document)='object')
);
CREATE INDEX catalog_search_documents_tokens_idx ON saas.catalog_search_documents USING gin(search_tokens);
CREATE INDEX catalog_search_documents_skus_idx ON saas.catalog_search_documents USING gin(skus);
CREATE INDEX catalog_search_documents_barcodes_idx ON saas.catalog_search_documents USING gin(barcodes);

CREATE TABLE saas.catalog_search_outbox(
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  generation bigint NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 9007199254740991),
  acknowledged_generation bigint NOT NULL DEFAULT 0,
  document jsonb,
  state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','leased','synced','failed')),
  attempts smallint NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
  lease_id uuid,
  lease_generation bigint,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL,
  changed_at timestamptz NOT NULL,
  last_error text,
  PRIMARY KEY(store_id,product_id),
  CHECK(acknowledged_generation BETWEEN 0 AND generation),
  CHECK((state='leased')=(lease_id IS NOT NULL AND lease_generation IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK(last_error IS NULL OR last_error~'^[a-z][a-z0-9_]{0,63}$')
);
CREATE INDEX catalog_search_outbox_ready_idx ON saas.catalog_search_outbox(next_attempt_at,store_id,product_id) WHERE state IN('queued','failed');
CREATE INDEX catalog_search_outbox_lease_idx ON saas.catalog_search_outbox(lease_until,store_id,product_id) WHERE state='leased';
CREATE INDEX catalog_search_outbox_pending_store_idx ON saas.catalog_search_outbox(store_id) WHERE state<>'synced';

CREATE TABLE saas.catalog_search_194_backup(identity text PRIMARY KEY,definition text NOT NULL);
INSERT INTO saas.catalog_search_194_backup(identity,definition)
SELECT identity,pg_catalog.pg_get_functiondef(identity::regprocedure) FROM pg_catalog.unnest(ARRAY[
 'saas.public_catalog_query_v2(text,timestamptz,text,text,text,text,integer,integer)',
 'saas.public_catalog_collection_query(text,timestamptz,text,text,text,text,integer,integer)'
]) identity;

DO $tables$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['catalog_search_documents','catalog_search_outbox','catalog_search_194_backup'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE pg_catalog.format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE pg_catalog.format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',tab);
  END LOOP;
END $tables$;

CREATE FUNCTION saas.catalog_search_refresh(p_store_id uuid,p_product_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE product saas.products%ROWTYPE; normalized text; identifiers text[]; codes text[]; variant_text text; taxonomy_text text; payload jsonb; changed timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  -- Serialize document rebuilds for concurrent variant/assignment edits.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_store_id::text||'/'||p_product_id::text,194));
  SELECT p.* INTO product FROM saas.products p JOIN saas.stores s ON s.id=p.store_id AND s.status='active'
  WHERE p.store_id=p_store_id AND p.id=p_product_id AND p.status='active';
  IF FOUND THEN
    SELECT COALESCE(pg_catalog.array_agg(DISTINCT saas.catalog_search_normalize(v.sku)) FILTER(WHERE v.sku IS NOT NULL),'{}'::text[]),
      COALESCE(pg_catalog.array_agg(DISTINCT saas.catalog_search_normalize(v.barcode)) FILTER(WHERE v.barcode IS NOT NULL),'{}'::text[]),
      pg_catalog.string_agg(v.title||' '||COALESCE(v.sku,'')||' '||COALESCE(v.barcode,'')||' '||COALESCE((SELECT pg_catalog.string_agg(a.value,' ') FROM pg_catalog.jsonb_each_text(v.attributes) a),''),' ')
    INTO identifiers,codes,variant_text FROM saas.product_variants v WHERE v.store_id=p_store_id AND v.product_id=p_product_id AND v.status='active';
    IF variant_text IS NOT NULL THEN
      SELECT pg_catalog.string_agg(value,' ') INTO taxonomy_text FROM (
        SELECT c.name||' '||c.slug value FROM saas.catalog_product_categories a JOIN saas.catalog_categories c ON c.store_id=a.store_id AND c.id=a.category_id AND c.status='active' WHERE a.store_id=p_store_id AND a.product_id=p_product_id
        UNION ALL
        SELECT r.name||' '||r.slug FROM saas.catalog_admin_resource_products a JOIN saas.catalog_admin_resources r ON r.store_id=a.store_id AND r.id=a.resource_id AND r.status='active' AND r.resource_kind IN('brand','tag') WHERE a.store_id=p_store_id AND a.product_id=p_product_id
      ) taxonomy;
      normalized:=pg_catalog.left(saas.catalog_search_normalize(pg_catalog.left(product.title||' '||product.slug||' '||pg_catalog.regexp_replace(COALESCE(product.description,''),'<[^>]*>',' ','g')||' '||variant_text||' '||COALESCE(taxonomy_text,''),100000)),100000);
      payload:=pg_catalog.jsonb_build_object('id',p_store_id::text||'_'||p_product_id::text,'storeId',p_store_id,'productId',p_product_id,'title',product.title,'slug',product.slug,'searchText',normalized,'skus',identifiers[1:1000],'barcodes',codes[1:1000]);
      INSERT INTO saas.catalog_search_documents(store_id,product_id,title_key,search_text,title_tokens,search_tokens,skus,barcodes,document)
      VALUES(p_store_id,p_product_id,saas.catalog_search_normalize(product.title),normalized,pg_catalog.to_tsvector('simple',saas.catalog_search_normalize(product.title)),pg_catalog.to_tsvector('simple',normalized),identifiers,codes,payload)
      ON CONFLICT(store_id,product_id) DO UPDATE SET title_key=EXCLUDED.title_key,search_text=EXCLUDED.search_text,title_tokens=EXCLUDED.title_tokens,search_tokens=EXCLUDED.search_tokens,skus=EXCLUDED.skus,barcodes=EXCLUDED.barcodes,document=EXCLUDED.document;
    END IF;
  END IF;
  IF payload IS NULL THEN DELETE FROM saas.catalog_search_documents WHERE store_id=p_store_id AND product_id=p_product_id; END IF;
  -- Keep the row after acknowledgement so generations never restart after a delete/recreate.
  INSERT INTO saas.catalog_search_outbox(store_id,product_id,document,next_attempt_at,changed_at)
  VALUES(p_store_id,p_product_id,payload,changed,changed)
  ON CONFLICT(store_id,product_id) DO UPDATE SET generation=saas.catalog_search_outbox.generation+1,
    document=EXCLUDED.document,changed_at=changed,next_attempt_at=changed,
    state=CASE WHEN saas.catalog_search_outbox.state='leased' THEN 'leased' ELSE 'queued' END,
    attempts=CASE WHEN saas.catalog_search_outbox.state='leased' THEN saas.catalog_search_outbox.attempts ELSE 0 END,last_error=NULL;
END $f$;

CREATE FUNCTION saas.catalog_search_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE affected record; selected_store uuid; selected_product uuid; selected_resource uuid; old_row jsonb; new_row jsonb; new_store uuid; new_product uuid;
BEGIN
  old_row:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE pg_catalog.to_jsonb(OLD) END;
  new_row:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE pg_catalog.to_jsonb(NEW) END;
  IF TG_TABLE_NAME IN('products','product_variants','catalog_product_categories','catalog_admin_resource_products') THEN
    IF TG_OP<>'INSERT' THEN
      selected_store:=(old_row->>'store_id')::uuid; selected_product:=(old_row->>CASE WHEN TG_TABLE_NAME='products' THEN 'id' ELSE 'product_id' END)::uuid;
      PERFORM saas.catalog_search_refresh(selected_store,selected_product);
    END IF;
    new_store:=(new_row->>'store_id')::uuid;new_product:=(new_row->>CASE WHEN TG_TABLE_NAME='products' THEN 'id' ELSE 'product_id' END)::uuid;
    IF TG_OP<>'DELETE' AND (TG_OP='INSERT' OR new_store IS DISTINCT FROM selected_store OR new_product IS DISTINCT FROM selected_product) THEN
      PERFORM saas.catalog_search_refresh(new_store,new_product);
    END IF;
  ELSE
    selected_store:=(COALESCE(new_row->>CASE WHEN TG_TABLE_NAME='stores' THEN 'id' ELSE 'store_id' END,old_row->>CASE WHEN TG_TABLE_NAME='stores' THEN 'id' ELSE 'store_id' END))::uuid;
    selected_resource:=COALESCE(new_row->>'id',old_row->>'id')::uuid;
    FOR affected IN
      SELECT p.id FROM saas.products p WHERE p.store_id=selected_store AND (
        TG_TABLE_NAME='stores'
        OR TG_TABLE_NAME='catalog_categories' AND EXISTS(SELECT 1 FROM saas.catalog_product_categories a WHERE a.store_id=selected_store AND a.product_id=p.id AND a.category_id=selected_resource)
        OR TG_TABLE_NAME='catalog_admin_resources' AND EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products a WHERE a.store_id=selected_store AND a.product_id=p.id AND a.resource_id=selected_resource)) ORDER BY p.id
    LOOP PERFORM saas.catalog_search_refresh(selected_store,affected.id); END LOOP;
  END IF;
  RETURN NULL;
END $f$;

CREATE TRIGGER catalog_search_products_changed AFTER INSERT OR DELETE OR UPDATE OF title,slug,description,status ON saas.products FOR EACH ROW EXECUTE FUNCTION saas.catalog_search_changed();
CREATE TRIGGER catalog_search_variants_changed AFTER INSERT OR DELETE OR UPDATE OF title,sku,barcode,attributes,status ON saas.product_variants FOR EACH ROW EXECUTE FUNCTION saas.catalog_search_changed();
CREATE TRIGGER catalog_search_categories_assigned AFTER INSERT OR UPDATE OR DELETE ON saas.catalog_product_categories FOR EACH ROW EXECUTE FUNCTION saas.catalog_search_changed();
CREATE TRIGGER catalog_search_resources_assigned AFTER INSERT OR UPDATE OR DELETE ON saas.catalog_admin_resource_products FOR EACH ROW EXECUTE FUNCTION saas.catalog_search_changed();
CREATE TRIGGER catalog_search_categories_changed AFTER DELETE OR UPDATE OF name,slug,status ON saas.catalog_categories FOR EACH ROW EXECUTE FUNCTION saas.catalog_search_changed();
CREATE TRIGGER catalog_search_resources_changed AFTER DELETE OR UPDATE OF name,slug,status,resource_kind ON saas.catalog_admin_resources FOR EACH ROW EXECUTE FUNCTION saas.catalog_search_changed();
CREATE TRIGGER catalog_search_stores_changed AFTER UPDATE OF status ON saas.stores FOR EACH ROW EXECUTE FUNCTION saas.catalog_search_changed();

-- Qualify extension operators/functions/opclasses using its catalog namespace.
DO $matching$ DECLARE extension_schema text;definition text; BEGIN
  SELECT n.nspname INTO extension_schema FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_trgm';
  IF extension_schema IS NULL THEN RAISE EXCEPTION 'SHARED_CATALOG_SEARCH_TRIGRAM_UNAVAILABLE'; END IF;
  EXECUTE pg_catalog.format('CREATE INDEX catalog_search_documents_trgm_idx ON saas.catalog_search_documents USING gin(search_text %I.gin_trgm_ops)',extension_schema);
  definition:=$definition$
CREATE FUNCTION saas.catalog_search_candidates(p_store_id uuid,p_query text)
RETURNS TABLE(product_id uuid,rank integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas SET pg_trgm.word_similarity_threshold='0.30' AS $body$
  WITH query AS (SELECT saas.catalog_search_normalize(p_query) normalized,saas.catalog_search_query_tokens(p_query) tokens)
  SELECT d.product_id,CASE WHEN d.barcodes @> ARRAY[q.normalized] THEN 6000 WHEN d.skus @> ARRAY[q.normalized] THEN 5000
    WHEN d.title_key=q.normalized THEN 4000 WHEN d.title_tokens @@ q.tokens THEN 3000
    WHEN d.search_tokens @@ q.tokens THEN 2000 ELSE 1000+pg_catalog.floor(__TRGM__.word_similarity(q.normalized,d.search_text)*900)::integer END
  FROM saas.catalog_search_documents d CROSS JOIN query q
  WHERE d.store_id=p_store_id AND q.normalized<>'' AND (
    d.search_tokens @@ q.tokens OR d.skus @> ARRAY[q.normalized] OR d.barcodes @> ARRAY[q.normalized]
    OR (pg_catalog.char_length(q.normalized)>=4 AND q.normalized !~ '[[:space:]]' AND d.search_text OPERATOR(__TRGM__.%>) q.normalized))
$body$;
  $definition$;
  EXECUTE pg_catalog.replace(definition,'__TRGM__',pg_catalog.quote_ident(extension_schema));
END $matching$;

ALTER FUNCTION saas.public_search_products(text,timestamptz,text,integer,text) RENAME TO public_search_products_before_catalog_search;
REVOKE ALL ON FUNCTION saas.public_search_products_before_catalog_search(text,timestamptz,text,integer,text) FROM PUBLIC,celebix_saas_host_resolver;
CREATE FUNCTION saas.public_search_products(p_hostname text,p_now timestamptz,p_query text,p_limit integer,p_cursor text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; cursor_rank integer; cursor_available boolean; cursor_time timestamptz; cursor_id uuid; items jsonb; next_cursor text; item_count integer;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true
    OR p_query IS NULL OR p_query<>pg_catalog.btrim(p_query) OR pg_catalog.octet_length(p_query)>100 OR p_query~'[[:cntrl:]]'
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 48 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF p_cursor IS NOT NULL AND p_cursor~'^(true|false)\|' THEN
    RETURN QUERY SELECT * FROM saas.public_search_products_before_catalog_search(p_hostname,p_now,p_query,p_limit,p_cursor); RETURN;
  END IF;
  IF p_cursor IS NOT NULL THEN
    IF p_cursor!~'^s2\|[0-9]{1,5}\|(true|false)\|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
    BEGIN
      cursor_rank:=pg_catalog.split_part(p_cursor,'|',2)::integer;cursor_available:=pg_catalog.split_part(p_cursor,'|',3)::boolean;
      cursor_time:=pg_catalog.split_part(p_cursor,'|',4)::timestamptz;cursor_id:=pg_catalog.split_part(p_cursor,'|',5)::uuid;
      IF saas.store_policy_timestamp(cursor_time)<>pg_catalog.split_part(p_cursor,'|',4) THEN RAISE EXCEPTION 'INVALID_CURSOR_TIME';END IF;
    EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END;
  END IF;
  selected_store:=saas.store_policy_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  WITH matched AS MATERIALIZED (
    -- Cursor timestamps have milliseconds; use that same key for ordering and
    -- comparisons so products created within one millisecond cannot be skipped.
    SELECT p.id,pg_catalog.date_trunc('milliseconds',p.created_at) created_at,c.rank FROM saas.catalog_search_candidates(selected_store,p_query) c JOIN saas.products p ON p.store_id=selected_store AND p.id=c.product_id AND p.status='active'
  ), eligible AS MATERIALIZED (
    SELECT m.*,v.available FROM matched m CROSS JOIN LATERAL (
      SELECT pg_catalog.bool_or(NOT v.stock_tracking OR v.stock_quantity>0) available
      FROM saas.product_variants v CROSS JOIN LATERAL saas.resolve_effective_variant_price(selected_store,v.id,'storefront',p_now,NULL) price
      WHERE v.store_id=selected_store AND v.product_id=m.id AND v.status='active' AND price.outcome='found'
    ) v WHERE v.available IS NOT NULL
  ), shortlist AS MATERIALIZED (
    SELECT * FROM eligible e WHERE p_cursor IS NULL OR (e.rank,e.available,e.created_at,e.id)<(cursor_rank,cursor_available,cursor_time,cursor_id)
    ORDER BY e.rank DESC,e.available DESC,e.created_at DESC,e.id DESC LIMIT p_limit+1
  ), page AS MATERIALIZED (
    SELECT * FROM shortlist ORDER BY rank DESC,available DESC,created_at DESC,id DESC LIMIT p_limit
  )
  SELECT COALESCE((SELECT pg_catalog.jsonb_agg(saas.public_effective_product_projection(selected_store,p.id,p_now) ORDER BY p.rank DESC,p.available DESC,p.created_at DESC,p.id DESC) FROM page p),'[]'::jsonb),
    (SELECT pg_catalog.count(*)::integer FROM shortlist),
    (SELECT 's2|'||p.rank::text||'|'||p.available::text||'|'||saas.store_policy_timestamp(p.created_at)||'|'||p.id::text FROM page p ORDER BY p.rank DESC,p.available DESC,p.created_at DESC,p.id DESC OFFSET p_limit-1 LIMIT 1)
  INTO items,item_count,next_cursor;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('items',items,'nextCursor',CASE WHEN item_count>p_limit THEN next_cursor END));
END $f$;

-- Preserve existing category membership, filter, ordering and pagination SQL.
DO $catalog$ DECLARE row record; definition text; marker text; replacement text; BEGIN
  FOR row IN SELECT * FROM saas.catalog_search_194_backup ORDER BY identity LOOP
    IF row.identity LIKE 'saas.public_catalog_query_v2%' THEN
      marker:='p_query='''' OR pg_catalog.strpos(pg_catalog.lower(product.title),pg_catalog.lower(p_query))>0';
      replacement:='p_query='''' OR product.id IN (SELECT matched.product_id FROM saas.catalog_search_candidates(saas.store_policy_public_store(p_hostname,p_now),p_query) matched)';
    ELSE
      marker:='p_query='''' OR strpos(lower(p.title),lower(p_query))>0';
      replacement:='p_query='''' OR p.id IN (SELECT matched.product_id FROM saas.catalog_search_candidates(saas.store_policy_public_store(p_hostname,p_now),p_query) matched)';
    END IF;
    IF pg_catalog.strpos(row.definition,marker)=0 THEN RAISE EXCEPTION 'SHARED_CATALOG_SEARCH_MATCHING_SEAM_CHANGED:%',row.identity;END IF;
    definition:=pg_catalog.replace(row.definition,marker,replacement);EXECUTE definition;
  END LOOP;
END $catalog$;

CREATE FUNCTION saas.public_catalog_search_scope(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  selected_store:=saas.store_policy_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('storeId',selected_store,'pending',EXISTS(SELECT 1 FROM saas.catalog_search_outbox o WHERE o.store_id=selected_store AND o.state<>'synced'));
END $f$;

CREATE FUNCTION saas.catalog_search_claim(p_now timestamptz,p_limit integer,p_lease uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE payload jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_lease IS NULL THEN RETURN QUERY SELECT 'invalid_input','{}'::jsonb;RETURN;END IF;
  -- Bound rapid retries, then keep trying after a cooldown so a recovered service
  -- automatically drains failed generations without an operator/tenant action.
  UPDATE saas.catalog_search_outbox SET state='failed',lease_id=NULL,lease_generation=NULL,lease_until=NULL,last_error='lease_expired',next_attempt_at=p_now+interval '5 minutes'
  WHERE state='leased' AND lease_until<=p_now AND attempts>=8;
  WITH ready AS MATERIALIZED (
    SELECT o.store_id,o.product_id FROM saas.catalog_search_outbox o
    WHERE (o.state IN('queued','failed') AND o.next_attempt_at<=p_now OR o.state='leased' AND o.lease_until<=p_now) AND (o.attempts<8 OR o.state='failed')
    ORDER BY o.next_attempt_at,o.store_id,o.product_id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE saas.catalog_search_outbox o SET state='leased',lease_id=p_lease,lease_generation=o.generation,lease_until=p_now+interval '60 seconds',attempts=CASE WHEN o.state='failed' THEN 1 ELSE o.attempts+1 END
    FROM ready r WHERE o.store_id=r.store_id AND o.product_id=r.product_id
    RETURNING o.store_id,o.product_id,o.generation,o.document
  ) SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('storeId',c.store_id,'productId',c.product_id,'generation',c.generation,'document',c.document) ORDER BY c.store_id,c.product_id),'[]'::jsonb) INTO payload FROM claimed c;
  RETURN QUERY SELECT 'claimed',payload;
END $f$;

CREATE FUNCTION saas.catalog_search_ack(p_lease uuid,p_store_id uuid,p_product_id uuid,p_generation bigint,p_now timestamptz,p_error text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE current_job saas.catalog_search_outbox%ROWTYPE;
BEGIN
  IF p_lease IS NULL OR p_store_id IS NULL OR p_product_id IS NULL OR p_generation IS NULL OR p_generation NOT BETWEEN 1 AND 9007199254740991
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR (p_error IS NOT NULL AND p_error!~'^[a-z][a-z0-9_]{0,63}$') THEN RETURN QUERY SELECT 'invalid_input','{}'::jsonb;RETURN;END IF;
  SELECT * INTO current_job FROM saas.catalog_search_outbox o WHERE o.store_id=p_store_id AND o.product_id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'stale','{}'::jsonb;RETURN;END IF;
  IF p_generation<current_job.generation THEN
    -- A delayed engine task can finish after a newer task. Re-index the latest
    -- generation even when it was already acknowledged, healing the late write.
    IF current_job.state<>'leased' OR current_job.lease_id=p_lease AND current_job.lease_generation=p_generation THEN
      UPDATE saas.catalog_search_outbox SET state='queued',attempts=0,next_attempt_at=p_now,lease_id=NULL,lease_generation=NULL,lease_until=NULL,last_error=NULL
      WHERE store_id=p_store_id AND product_id=p_product_id;
    END IF;
    RETURN QUERY SELECT 'stale','{}'::jsonb;RETURN;
  END IF;
  IF current_job.state<>'leased' OR current_job.lease_id IS DISTINCT FROM p_lease OR current_job.lease_generation IS DISTINCT FROM p_generation OR current_job.lease_until<=p_now THEN RETURN QUERY SELECT 'stale','{}'::jsonb;RETURN;END IF;
  IF p_error IS NULL THEN
    UPDATE saas.catalog_search_outbox SET state='synced',acknowledged_generation=p_generation,attempts=0,lease_id=NULL,lease_generation=NULL,lease_until=NULL,last_error=NULL WHERE store_id=p_store_id AND product_id=p_product_id;
    RETURN QUERY SELECT 'acknowledged','{}'::jsonb;
  ELSE
    UPDATE saas.catalog_search_outbox SET state=CASE WHEN attempts>=8 THEN 'failed' ELSE 'queued' END,
      next_attempt_at=p_now+pg_catalog.make_interval(secs=>CASE WHEN attempts>=8 THEN 300 ELSE LEAST(300,pg_catalog.power(2,attempts)::integer) END),lease_id=NULL,lease_generation=NULL,lease_until=NULL,last_error=p_error
    WHERE store_id=p_store_id AND product_id=p_product_id;
    RETURN QUERY SELECT 'retry','{}'::jsonb;
  END IF;
END $f$;

CREATE FUNCTION saas.catalog_search_requeue_all(p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE queued_count bigint;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN RETURN QUERY SELECT 'invalid_input','{}'::jsonb;RETURN;END IF;
  -- The persistent outbox is the current document snapshot, including tombstones
  -- for IDs no longer present in products. Never erase a worker's active lease.
  UPDATE saas.catalog_search_outbox SET generation=generation+1,
    state=CASE WHEN state='leased' THEN 'leased' ELSE 'queued' END,
    attempts=CASE WHEN state='leased' THEN attempts ELSE 0 END,
    next_attempt_at=p_now,changed_at=p_now,last_error=NULL;
  GET DIAGNOSTICS queued_count=ROW_COUNT;
  IF queued_count>9007199254740991 THEN RAISE EXCEPTION 'SHARED_CATALOG_SEARCH_RESYNC_COUNT_INVALID';END IF;
  RETURN QUERY SELECT 'requeued',pg_catalog.jsonb_build_object('queued',queued_count);
END $f$;

REVOKE ALL ON FUNCTION saas.catalog_search_normalize(text),saas.catalog_search_query_tokens(text),saas.catalog_search_refresh(uuid,uuid),saas.catalog_search_changed(),saas.catalog_search_candidates(uuid,text),saas.public_search_products(text,timestamptz,text,integer,text),saas.public_catalog_search_scope(text,timestamptz),saas.catalog_search_claim(timestamptz,integer,uuid),saas.catalog_search_ack(uuid,uuid,uuid,bigint,timestamptz,text),saas.catalog_search_requeue_all(timestamptz)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_search_products(text,timestamptz,text,integer,text),saas.public_catalog_search_scope(text,timestamptz) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.catalog_search_claim(timestamptz,integer,uuid),saas.catalog_search_ack(uuid,uuid,uuid,bigint,timestamptz,text),saas.catalog_search_requeue_all(timestamptz) TO celebix_saas_workflow;

-- Bootstrap all existing stores once; subsequent products/stores use the triggers.
DO $bootstrap$ DECLARE product record; BEGIN
  FOR product IN SELECT p.store_id,p.id FROM saas.products p ORDER BY p.store_id,p.id LOOP PERFORM saas.catalog_search_refresh(product.store_id,product.id);END LOOP;
END $bootstrap$;
COMMIT;
