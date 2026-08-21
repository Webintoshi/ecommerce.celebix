-- Shared storefront fixed-policy and hostname-authorized search authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.stores') IS NULL
     OR pg_catalog.to_regclass('saas.store_domains') IS NULL
     OR pg_catalog.to_regclass('saas.products') IS NULL
     OR pg_catalog.to_regprocedure('saas.merchant_admin_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('saas.resolve_effective_variant_price(uuid,uuid,text,timestamp with time zone,text)') IS NULL
     OR pg_catalog.to_regprocedure('saas.public_media_projection(uuid)') IS NULL
     OR pg_catalog.to_regclass('saas.store_policy_pages') IS NOT NULL
  THEN
    RAISE EXCEPTION 'STOREFRONT_POLICY_SEARCH_PREREQUISITE_INVALID';
  END IF;
END
$precondition$;

CREATE TABLE saas.store_policy_pages(
  store_id uuid NOT NULL,
  policy_key text NOT NULL,
  ordinal smallint NOT NULL,
  route text NOT NULL,
  label text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,policy_key),
  UNIQUE(store_id,ordinal),
  UNIQUE(store_id,route),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT store_policy_pages_fixed_definition_check CHECK(
    (policy_key='privacy_security' AND ordinal=1 AND route='/policies/privacy-security' AND label='Gizlilik ve Güvenlik') OR
    (policy_key='distance_sales' AND ordinal=2 AND route='/policies/distance-sales' AND label='Mesafeli Satış Sözleşmesi') OR
    (policy_key='kvkk' AND ordinal=3 AND route='/policies/kvkk' AND label='KVKK') OR
    (policy_key='payment_delivery' AND ordinal=4 AND route='/policies/payment-delivery' AND label='Ödeme & Teslimat') OR
    (policy_key='cookie_usage' AND ordinal=5 AND route='/policies/cookies' AND label='Çerez Kullanımı') OR
    (policy_key='returns_exchanges' AND ordinal=6 AND route='/policies/returns-exchanges' AND label='İade & Değişim') OR
    (policy_key='membership' AND ordinal=7 AND route='/policies/membership' AND label='Üyelik')
  ),
  CONSTRAINT store_policy_pages_body_check CHECK(
    body=pg_catalog.btrim(body)
    AND pg_catalog.octet_length(body)<=100000
    AND pg_catalog.regexp_replace(body,E'[\n\r\t]','','g')!~'[[:cntrl:]]'
    AND body!~*'<[[:space:]]*/?[[:space:]]*(script|iframe|object|embed|form|style|link|meta)([[:space:]/>])'
    AND body!~*'on[a-z]+[[:space:]]*='
    AND body!~*'(javascript|data):'
  ),
  CONSTRAINT store_policy_pages_status_check CHECK(status IN('draft','published')),
  CONSTRAINT store_policy_pages_publish_check CHECK(status='draft' OR pg_catalog.octet_length(body)>0),
  CONSTRAINT store_policy_pages_version_check CHECK(version>0),
  CONSTRAINT store_policy_pages_timestamp_check CHECK(updated_at>=created_at)
);

CREATE TABLE saas.store_policy_operations(
  operation_id uuid NOT NULL PRIMARY KEY,
  store_id uuid NOT NULL,
  policy_key text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  FOREIGN KEY(store_id,policy_key) REFERENCES saas.store_policy_pages(store_id,policy_key) ON DELETE RESTRICT,
  CONSTRAINT store_policy_operations_fingerprint_check CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  CONSTRAINT store_policy_operations_payload_check CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=131072)
);

CREATE INDEX store_policy_pages_admin_idx ON saas.store_policy_pages(store_id,ordinal);
CREATE INDEX store_policy_operations_store_idx ON saas.store_policy_operations(store_id,committed_at DESC,operation_id DESC);

ALTER TABLE saas.store_policy_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_policy_pages FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.store_policy_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_policy_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.store_policy_pages,saas.store_policy_operations
  FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.guard_store_policy_pages()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF TG_OP='DELETE'
     OR NEW.store_id IS DISTINCT FROM OLD.store_id
     OR NEW.policy_key IS DISTINCT FROM OLD.policy_key
     OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
     OR NEW.route IS DISTINCT FROM OLD.route
     OR NEW.label IS DISTINCT FROM OLD.label
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'STORE_POLICY_PAGE_IMMUTABLE';
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION saas.guard_store_policy_operations()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  RAISE EXCEPTION 'STORE_POLICY_OPERATION_IMMUTABLE';
END
$function$;

CREATE TRIGGER store_policy_pages_immutable
BEFORE UPDATE OR DELETE ON saas.store_policy_pages
FOR EACH ROW EXECUTE FUNCTION saas.guard_store_policy_pages();
CREATE TRIGGER store_policy_operations_immutable
BEFORE UPDATE OR DELETE ON saas.store_policy_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_store_policy_operations();

CREATE FUNCTION saas.seed_store_policy_pages(p_store_id uuid,p_created_at timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  INSERT INTO saas.store_policy_pages(store_id,policy_key,ordinal,route,label,created_at,updated_at)
  VALUES
    (p_store_id,'privacy_security',1,'/policies/privacy-security','Gizlilik ve Güvenlik',p_created_at,p_created_at),
    (p_store_id,'distance_sales',2,'/policies/distance-sales','Mesafeli Satış Sözleşmesi',p_created_at,p_created_at),
    (p_store_id,'kvkk',3,'/policies/kvkk','KVKK',p_created_at,p_created_at),
    (p_store_id,'payment_delivery',4,'/policies/payment-delivery','Ödeme & Teslimat',p_created_at,p_created_at),
    (p_store_id,'cookie_usage',5,'/policies/cookies','Çerez Kullanımı',p_created_at,p_created_at),
    (p_store_id,'returns_exchanges',6,'/policies/returns-exchanges','İade & Değişim',p_created_at,p_created_at),
    (p_store_id,'membership',7,'/policies/membership','Üyelik',p_created_at,p_created_at)
  ON CONFLICT(store_id,policy_key) DO NOTHING
$function$;

CREATE FUNCTION saas.create_store_policy_pages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
BEGIN
  PERFORM saas.seed_store_policy_pages(NEW.id,NEW.created_at);
  RETURN NEW;
END
$function$;

CREATE TRIGGER stores_policy_pages
AFTER INSERT ON saas.stores
FOR EACH ROW EXECUTE FUNCTION saas.create_store_policy_pages();

SELECT saas.seed_store_policy_pages(store.id,store.created_at)
FROM saas.stores store
ORDER BY store.id;

CREATE FUNCTION saas.store_policy_timestamp(p_value timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.to_char(p_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$function$;

CREATE FUNCTION saas.store_policy_key_valid(p_key text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $function$
  SELECT p_key IN('privacy_security','distance_sales','kvkk','payment_delivery','cookie_usage','returns_exchanges','membership')
$function$;

CREATE FUNCTION saas.store_policy_body_valid(p_body text,p_status text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $function$
  SELECT p_body IS NOT NULL
    AND p_status IN('draft','published')
    AND p_body=pg_catalog.btrim(p_body)
    AND pg_catalog.octet_length(p_body)<=100000
    AND (p_status='draft' OR pg_catalog.octet_length(p_body)>0)
    AND pg_catalog.regexp_replace(p_body,E'[\n\r\t]','','g')!~'[[:cntrl:]]'
    AND p_body!~*'<[[:space:]]*/?[[:space:]]*(script|iframe|object|embed|form|style|link|meta)([[:space:]/>])'
    AND p_body!~*'on[a-z]+[[:space:]]*='
    AND p_body!~*'(javascript|data):'
$function$;

CREATE FUNCTION saas.store_policy_admin_projection(p_store_id uuid,p_key text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'key',page.policy_key,'label',page.label,'route',page.route,'ordinal',page.ordinal,
    'status',page.status,'body',page.body,'version',page.version,
    'createdAt',saas.store_policy_timestamp(page.created_at),
    'updatedAt',saas.store_policy_timestamp(page.updated_at)
  )
  FROM saas.store_policy_pages page
  WHERE page.store_id=p_store_id AND page.policy_key=p_key
$function$;

CREATE FUNCTION saas.store_policy_public_projection(p_store_id uuid,p_key text,p_include_body boolean)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'key',page.policy_key,'label',page.label,'route',page.route,
    'published',(page.status='published'),
    'body',CASE WHEN p_include_body AND page.status='published' THEN page.body ELSE NULL END,
    'updatedAt',saas.store_policy_timestamp(page.updated_at)
  ))
  FROM saas.store_policy_pages page
  WHERE page.store_id=p_store_id AND page.policy_key=p_key
$function$;

CREATE FUNCTION saas.store_policy_list_admin(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'policy',false);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((
    SELECT pg_catalog.jsonb_agg(saas.store_policy_admin_projection(p_store_id,page.policy_key) ORDER BY page.ordinal)
    FROM saas.store_policy_pages page WHERE page.store_id=p_store_id
  ),'[]'::jsonb));
END
$function$;

CREATE FUNCTION saas.store_policy_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,
  p_fingerprint text,p_policy_key text,p_expected_version bigint,p_body text,p_status text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; operation saas.store_policy_operations%ROWTYPE; current_page saas.store_policy_pages%ROWTYPE; result jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_now IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR NOT saas.store_policy_key_valid(p_policy_key) OR p_expected_version IS NULL OR p_expected_version<1
     OR NOT saas.store_policy_body_valid(p_body,p_status)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'policy',true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,71071));
  SELECT * INTO operation FROM saas.store_policy_operations op WHERE op.operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>p_store_id OR operation.policy_key<>p_policy_key OR operation.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    END IF;
    RETURN;
  END IF;
  SELECT * INTO current_page FROM saas.store_policy_pages page
  WHERE page.store_id=p_store_id AND page.policy_key=p_policy_key FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF current_page.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  UPDATE saas.store_policy_pages SET body=p_body,status=p_status,version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND policy_key=p_policy_key;
  SELECT saas.store_policy_admin_projection(p_store_id,p_policy_key) INTO result;
  INSERT INTO saas.store_policy_operations(operation_id,store_id,policy_key,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,p_policy_key,p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'saved',result;
END
$function$;

CREATE FUNCTION saas.store_policy_recover(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; operation saas.store_policy_operations%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'policy',false);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation FROM saas.store_policy_operations op WHERE op.operation_id=p_operation_id AND op.store_id=p_store_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb; RETURN; END IF;
  IF operation.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
END
$function$;

CREATE FUNCTION saas.store_policy_hostname_valid(p_hostname text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $function$
  SELECT p_hostname IS NOT NULL AND p_hostname=pg_catalog.lower(p_hostname)
    AND pg_catalog.char_length(p_hostname) BETWEEN 3 AND 253
    AND p_hostname!~'[*:/?#@[:space:][:cntrl:]]'
    AND p_hostname~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
$function$;

CREATE FUNCTION saas.store_policy_public_store(p_hostname text,p_now timestamptz)
RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $function$
  SELECT domain.store_id
  FROM saas.store_domains domain
  JOIN saas.stores store ON store.id=domain.store_id AND store.status='active'
  WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.verified_at<=p_now
  ORDER BY domain.is_primary DESC,domain.id
  LIMIT 1
$function$;

CREATE FUNCTION saas.public_policy_index(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_store uuid;
BEGIN
  IF p_now IS NULL OR NOT saas.store_policy_hostname_valid(p_hostname) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.store_policy_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('items',COALESCE((
    SELECT pg_catalog.jsonb_agg(saas.store_policy_public_projection(selected_store,page.policy_key,false) ORDER BY page.ordinal)
    FROM saas.store_policy_pages page WHERE page.store_id=selected_store
  ),'[]'::jsonb));
END
$function$;

CREATE FUNCTION saas.public_policy_get(p_hostname text,p_now timestamptz,p_policy_key text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_store uuid; projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT saas.store_policy_hostname_valid(p_hostname) OR NOT saas.store_policy_key_valid(p_policy_key)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.store_policy_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT saas.store_policy_public_projection(selected_store,p_policy_key,true) INTO projection;
  RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'not_found' ELSE 'found' END,projection;
END
$function$;

CREATE FUNCTION saas.public_effective_product_projection(p_store_id uuid,p_product_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $function$
  WITH resolved_variants AS (
    SELECT variant.*,resolved.price_cents AS effective_price
    FROM saas.product_variants variant
    CROSS JOIN LATERAL saas.resolve_effective_variant_price(p_store_id,variant.id,'storefront',p_now,NULL) resolved
    WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id AND variant.status='active' AND resolved.outcome='found'
  ), selected_price AS (
    SELECT * FROM resolved_variants
    ORDER BY (NOT stock_tracking OR stock_quantity>0) DESC,effective_price,created_at,id LIMIT 1
  ), variants AS (
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'id',variant.id,'title',variant.title,'sku',variant.sku,'priceCents',variant.effective_price,
      'compareAtCents',variant.compare_at_cents,'stockTracking',variant.stock_tracking,
      'stockQuantity',variant.stock_quantity,'available',(NOT variant.stock_tracking OR variant.stock_quantity>0),
      'attributes',variant.attributes
    )) ORDER BY variant.created_at,variant.id) payload FROM resolved_variants variant
  ), media AS (
    SELECT COALESCE(pg_catalog.jsonb_agg(saas.public_media_projection(media.id) ORDER BY media.sort_order,media.id),'[]'::jsonb) payload
    FROM saas.product_media media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.status='active'
  )
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',product.id,'slug',product.slug,'title',product.title,'description',product.description,
    'currency',product.currency,'status','active','priceCents',selected_price.effective_price,
    'compareAtCents',selected_price.compare_at_cents,
    'available',EXISTS(SELECT 1 FROM resolved_variants available WHERE NOT available.stock_tracking OR available.stock_quantity>0),
    'variants',variants.payload,'media',media.payload
  ))
  FROM saas.products product CROSS JOIN selected_price CROSS JOIN variants CROSS JOIN media
  WHERE product.id=p_product_id AND product.store_id=p_store_id AND product.status='active'
$function$;

CREATE FUNCTION saas.public_search_products(p_hostname text,p_now timestamptz,p_query text,p_limit integer,p_cursor text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_store uuid; cursor_available boolean; cursor_time timestamptz; cursor_id uuid; items jsonb; next_cursor text; last_available boolean; last_time timestamptz; last_id uuid; available_count integer;
BEGIN
  IF p_now IS NULL OR NOT saas.store_policy_hostname_valid(p_hostname) OR p_query IS NULL OR p_query<>pg_catalog.btrim(p_query)
     OR pg_catalog.octet_length(p_query)>100 OR pg_catalog.regexp_replace(p_query,E'[\n\r\t]','','g')~'[[:cntrl:]]'
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 48
     OR (p_cursor IS NOT NULL AND p_cursor!~'^(true|false)\|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF p_cursor IS NOT NULL THEN
    BEGIN
      cursor_available:=pg_catalog.split_part(p_cursor,'|',1)::boolean;
      cursor_time:=pg_catalog.split_part(p_cursor,'|',2)::timestamptz;
      cursor_id:=pg_catalog.split_part(p_cursor,'|',3)::uuid;
    EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END;
    IF saas.store_policy_timestamp(cursor_time)<>pg_catalog.split_part(p_cursor,'|',2) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  END IF;
  selected_store:=saas.store_policy_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  WITH candidates AS MATERIALIZED (
    SELECT product.id,product.created_at,saas.public_effective_product_projection(selected_store,product.id,p_now) payload
    FROM saas.products product
    WHERE product.store_id=selected_store AND product.status='active'
      AND (p_query='' OR pg_catalog.strpos(pg_catalog.lower(product.title),pg_catalog.lower(p_query))>0
        OR pg_catalog.strpos(pg_catalog.lower(product.slug),pg_catalog.lower(p_query))>0
        OR pg_catalog.strpos(pg_catalog.lower(COALESCE(product.description,'')),pg_catalog.lower(p_query))>0
        OR EXISTS(SELECT 1 FROM saas.product_variants variant WHERE variant.store_id=selected_store AND variant.product_id=product.id AND variant.status='active' AND pg_catalog.strpos(pg_catalog.lower(COALESCE(variant.sku,'')),pg_catalog.lower(p_query))>0)
        OR EXISTS(SELECT 1 FROM saas.catalog_product_categories assignment JOIN saas.catalog_categories category ON category.store_id=assignment.store_id AND category.id=assignment.category_id WHERE assignment.store_id=selected_store AND assignment.product_id=product.id AND category.status='active' AND (pg_catalog.strpos(pg_catalog.lower(category.name),pg_catalog.lower(p_query))>0 OR pg_catalog.strpos(pg_catalog.lower(category.slug),pg_catalog.lower(p_query))>0))
        OR EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products assignment JOIN saas.catalog_admin_resources resource ON resource.store_id=assignment.store_id AND resource.id=assignment.resource_id WHERE assignment.store_id=selected_store AND assignment.product_id=product.id AND resource.status='active' AND resource.resource_kind IN('brand','tag') AND (pg_catalog.strpos(pg_catalog.lower(resource.name),pg_catalog.lower(p_query))>0 OR pg_catalog.strpos(pg_catalog.lower(resource.slug),pg_catalog.lower(p_query))>0)))
  ), eligible AS MATERIALIZED (
    SELECT * FROM candidates WHERE payload IS NOT NULL
      AND (p_cursor IS NULL OR ((payload->>'available')::boolean,created_at,id)<(cursor_available,cursor_time,cursor_id))
    ORDER BY (candidates.payload->>'available')::boolean DESC,candidates.created_at DESC,candidates.id DESC LIMIT p_limit+1
  ), page AS (
    SELECT * FROM eligible ORDER BY (eligible.payload->>'available')::boolean DESC,eligible.created_at DESC,eligible.id DESC LIMIT p_limit
  )
  SELECT COALESCE((SELECT pg_catalog.jsonb_agg(page.payload ORDER BY (page.payload->>'available')::boolean DESC,page.created_at DESC,page.id DESC) FROM page),'[]'::jsonb),
    (SELECT pg_catalog.count(*)::integer FROM eligible),
    (SELECT (page.payload->>'available')::boolean FROM page ORDER BY (page.payload->>'available')::boolean DESC,page.created_at DESC,page.id DESC OFFSET p_limit-1 LIMIT 1),
    (SELECT page.created_at FROM page ORDER BY (page.payload->>'available')::boolean DESC,page.created_at DESC,page.id DESC OFFSET p_limit-1 LIMIT 1),
    (SELECT page.id FROM page ORDER BY (page.payload->>'available')::boolean DESC,page.created_at DESC,page.id DESC OFFSET p_limit-1 LIMIT 1)
  INTO items,available_count,last_available,last_time,last_id;
  IF available_count>p_limit THEN next_cursor:=last_available::text||'|'||saas.store_policy_timestamp(last_time)||'|'||last_id::text; END IF;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('items',items,'nextCursor',next_cursor));
END
$function$;

CREATE FUNCTION saas.public_resolve_product_ids(p_hostname text,p_now timestamptz,p_product_ids uuid[])
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_store uuid; items jsonb;
BEGIN
  IF p_now IS NULL OR NOT saas.store_policy_hostname_valid(p_hostname) OR p_product_ids IS NULL
     OR pg_catalog.cardinality(p_product_ids) NOT BETWEEN 0 AND 100
     OR (SELECT pg_catalog.count(DISTINCT id)<>pg_catalog.count(*) FROM pg_catalog.unnest(p_product_ids) item(id))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.store_policy_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(resolved.payload ORDER BY requested.ordinality),'[]'::jsonb)
  INTO items
  FROM pg_catalog.unnest(p_product_ids) WITH ORDINALITY requested(id,ordinality)
  CROSS JOIN LATERAL (SELECT saas.public_effective_product_projection(selected_store,requested.id,p_now) payload) resolved
  WHERE resolved.payload IS NOT NULL;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('items',items);
END
$function$;

REVOKE ALL ON FUNCTION
  saas.guard_store_policy_pages(),saas.guard_store_policy_operations(),
  saas.seed_store_policy_pages(uuid,timestamptz),saas.create_store_policy_pages(),
  saas.store_policy_timestamp(timestamptz),saas.store_policy_key_valid(text),saas.store_policy_body_valid(text,text),
  saas.store_policy_admin_projection(uuid,text),saas.store_policy_public_projection(uuid,text,boolean),
  saas.store_policy_list_admin(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.store_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint,text,text),
  saas.store_policy_recover(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),
  saas.store_policy_hostname_valid(text),saas.store_policy_public_store(text,timestamptz),
  saas.public_policy_index(text,timestamptz),saas.public_policy_get(text,timestamptz,text),
  saas.public_effective_product_projection(uuid,uuid,timestamptz),
  saas.public_search_products(text,timestamptz,text,integer,text),
  saas.public_resolve_product_ids(text,timestamptz,uuid[])
FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.store_policy_list_admin(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.store_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint,text,text),
  saas.store_policy_recover(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
TO celebix_saas_app;

GRANT EXECUTE ON FUNCTION
  saas.public_policy_index(text,timestamptz),
  saas.public_policy_get(text,timestamptz,text),
  saas.public_search_products(text,timestamptz,text,integer,text),
  saas.public_resolve_product_ids(text,timestamptz,uuid[])
TO celebix_saas_host_resolver;

COMMIT;
