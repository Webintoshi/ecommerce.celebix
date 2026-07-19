-- Phase 3A4 additive public storefront domain and product-media authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.store_domains (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  hostname text NOT NULL UNIQUE,
  hostname_type text NOT NULL,
  status text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  CONSTRAINT store_domains_store_id_key UNIQUE (store_id, id),
  CONSTRAINT store_domains_hostname_ascii_alabel_check CHECK (
    hostname = lower(hostname)
    AND char_length(hostname) BETWEEN 3 AND 253
    AND hostname !~ '[*:/?#@[:space:][:cntrl:]]'
    AND hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  ),
  CONSTRAINT store_domains_hostname_type_check CHECK (hostname_type IN ('platform_subdomain', 'custom_domain')),
  CONSTRAINT store_domains_status_check CHECK (status IN ('pending', 'active', 'disabled')),
  CONSTRAINT store_domains_activation_check CHECK (
    (status = 'active' AND verified_at IS NOT NULL AND verified_at >= created_at)
    OR status IN ('pending', 'disabled')
  ),
  CONSTRAINT store_domains_primary_check CHECK (NOT is_primary OR status = 'active'),
  CONSTRAINT store_domains_timestamp_check CHECK (updated_at >= created_at),
  CONSTRAINT store_domains_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX store_domains_one_active_primary_idx
  ON saas.store_domains (store_id)
  WHERE status = 'active' AND is_primary;
CREATE INDEX store_domains_public_resolver_idx
  ON saas.store_domains (hostname, store_id)
  WHERE status = 'active';
CREATE INDEX store_domains_store_status_idx
  ON saas.store_domains (store_id, status, is_primary DESC, hostname);

CREATE FUNCTION saas.guard_store_domain_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  store_slug text;
BEGIN
  SELECT store.slug INTO store_slug FROM saas.stores AS store WHERE store.id = NEW.store_id;
  IF store_slug IS NULL THEN RAISE EXCEPTION 'STORE_DOMAIN_STORE_NOT_FOUND'; END IF;
  IF NEW.hostname_type = 'platform_subdomain'
     AND split_part(NEW.hostname, '.', 1) <> store_slug THEN
    RAISE EXCEPTION 'STORE_DOMAIN_PLATFORM_SLUG_MISMATCH';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.id <> OLD.id OR NEW.store_id <> OLD.store_id OR NEW.hostname <> OLD.hostname
    OR NEW.hostname_type <> OLD.hostname_type OR NEW.created_at <> OLD.created_at
    OR NEW.version <> OLD.version + 1
  ) THEN RAISE EXCEPTION 'STORE_DOMAIN_AUTHORITY_IMMUTABLE'; END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_store_domain_authority() FROM PUBLIC;
CREATE TRIGGER store_domains_authority_guard
BEFORE INSERT OR UPDATE ON saas.store_domains
FOR EACH ROW EXECUTE FUNCTION saas.guard_store_domain_authority();

CREATE TABLE saas.product_media (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid,
  object_key text NOT NULL UNIQUE,
  public_url text NOT NULL,
  media_type text NOT NULL,
  alt_text text NOT NULL DEFAULT '',
  width integer,
  height integer,
  byte_size bigint NOT NULL,
  sort_order integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  CONSTRAINT product_media_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT product_media_product_fk FOREIGN KEY (store_id, product_id) REFERENCES saas.products(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT product_media_variant_fk FOREIGN KEY (store_id, variant_id) REFERENCES saas.product_variants(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT product_media_store_id_key UNIQUE (store_id, id),
  CONSTRAINT product_media_object_key_check CHECK (
    object_key = 'stores/' || store_id::text || '/products/' || product_id::text || '/' || id::text ||
      CASE media_type WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' WHEN 'image/webp' THEN '.webp' ELSE '' END
  ),
  CONSTRAINT product_media_public_url_check CHECK (
    public_url = btrim(public_url) AND char_length(public_url) BETWEEN 1 AND 2048
    AND public_url ~ '^https://[^/?#[:space:][:cntrl:]]+/'
    AND public_url !~ '[?#[:space:][:cntrl:]]'
    AND right(public_url, char_length(object_key) + 1) = '/' || object_key
  ),
  CONSTRAINT product_media_type_check CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT product_media_alt_check CHECK (alt_text = btrim(alt_text) AND char_length(alt_text) <= 500 AND alt_text !~ '[[:cntrl:]]'),
  CONSTRAINT product_media_dimensions_check CHECK ((width IS NULL AND height IS NULL) OR (width BETWEEN 1 AND 8192 AND height BETWEEN 1 AND 8192)),
  CONSTRAINT product_media_size_check CHECK (byte_size BETWEEN 1 AND 5242880),
  CONSTRAINT product_media_sort_check CHECK (sort_order BETWEEN 0 AND 15),
  CONSTRAINT product_media_status_check CHECK (status IN ('pending', 'active', 'archived')),
  CONSTRAINT product_media_archive_check CHECK ((status = 'archived' AND archived_at IS NOT NULL) OR (status IN ('pending', 'active') AND archived_at IS NULL)),
  CONSTRAINT product_media_timestamp_check CHECK (updated_at >= created_at AND (archived_at IS NULL OR (archived_at >= created_at AND updated_at >= archived_at))),
  CONSTRAINT product_media_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX product_media_active_order_key
  ON saas.product_media (store_id, product_id, sort_order)
  WHERE status = 'active';
CREATE INDEX product_media_product_status_order_idx
  ON saas.product_media (store_id, product_id, status, sort_order, id);
CREATE INDEX product_media_variant_idx
  ON saas.product_media (store_id, variant_id)
  WHERE variant_id IS NOT NULL AND status <> 'archived';

CREATE TABLE saas.product_media_operations (
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  CONSTRAINT product_media_operations_kind_check CHECK (operation_kind IN ('attach_media', 'update_alt', 'reorder_media', 'archive_media')),
  CONSTRAINT product_media_operations_fingerprint_check CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT product_media_operations_payload_check CHECK (pg_catalog.jsonb_typeof(result_payload) IN ('object', 'array') AND pg_catalog.pg_column_size(result_payload) <= 65536)
);
CREATE INDEX product_media_operations_store_idx ON saas.product_media_operations (store_id, committed_at DESC, operation_id);

CREATE FUNCTION saas.guard_product_media_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id <> OLD.id OR NEW.store_id <> OLD.store_id OR NEW.product_id <> OLD.product_id
    OR NEW.variant_id IS DISTINCT FROM OLD.variant_id OR NEW.object_key <> OLD.object_key
    OR NEW.public_url <> OLD.public_url OR NEW.media_type <> OLD.media_type
    OR NEW.width IS DISTINCT FROM OLD.width OR NEW.height IS DISTINCT FROM OLD.height
    OR NEW.byte_size <> OLD.byte_size OR NEW.created_at <> OLD.created_at
    OR NEW.version <> OLD.version + 1
    OR OLD.status = 'archived'
  ) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_AUTHORITY_IMMUTABLE'; END IF;
  IF NEW.variant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM saas.product_variants AS variant
    WHERE variant.id = NEW.variant_id AND variant.product_id = NEW.product_id AND variant.store_id = NEW.store_id
  ) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_VARIANT_SCOPE_INVALID'; END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_product_media_authority() FROM PUBLIC;
CREATE TRIGGER product_media_authority_guard
BEFORE INSERT OR UPDATE ON saas.product_media
FOR EACH ROW EXECUTE FUNCTION saas.guard_product_media_authority();

CREATE FUNCTION saas.guard_product_media_operation_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, saas
AS $function$ BEGIN RAISE EXCEPTION 'PRODUCT_MEDIA_OPERATION_IMMUTABLE'; END $function$;
REVOKE ALL ON FUNCTION saas.guard_product_media_operation_mutation() FROM PUBLIC;
CREATE TRIGGER product_media_operations_immutable
BEFORE UPDATE OR DELETE ON saas.product_media_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_product_media_operation_mutation();

ALTER TABLE saas.store_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_domains FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.product_media FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.product_media_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.product_media_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.store_domains, saas.product_media, saas.product_media_operations FROM PUBLIC;
REVOKE ALL ON saas.store_domains, saas.product_media, saas.product_media_operations FROM celebix_saas_app;
REVOKE ALL ON saas.store_domains, saas.product_media, saas.product_media_operations FROM celebix_saas_host_resolver;

CREATE FUNCTION saas.media_projection(p_media_id uuid)
RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', media.id, 'storeId', media.store_id, 'productId', media.product_id, 'variantId', media.variant_id,
    'objectKey', media.object_key, 'publicUrl', media.public_url, 'mediaType', media.media_type,
    'altText', media.alt_text, 'width', media.width, 'height', media.height, 'byteSize', media.byte_size,
    'sortOrder', media.sort_order, 'status', media.status,
    'createdAt', saas.catalog_timestamp(media.created_at), 'updatedAt', saas.catalog_timestamp(media.updated_at),
    'archivedAt', CASE WHEN media.archived_at IS NULL THEN NULL ELSE saas.catalog_timestamp(media.archived_at) END,
    'version', media.version
  )) FROM saas.product_media AS media WHERE media.id = p_media_id;
$function$;
REVOKE ALL ON FUNCTION saas.media_projection(uuid) FROM PUBLIC;

CREATE FUNCTION saas.public_media_projection(p_media_id uuid)
RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', media.id, 'productId', media.product_id, 'variantId', media.variant_id,
    'url', media.public_url, 'mediaType', media.media_type, 'altText', media.alt_text,
    'width', media.width, 'height', media.height, 'sortOrder', media.sort_order
  )) FROM saas.product_media AS media WHERE media.id = p_media_id AND media.status = 'active';
$function$;
REVOKE ALL ON FUNCTION saas.public_media_projection(uuid) FROM PUBLIC;

CREATE FUNCTION saas.public_product_projection(p_store_id uuid, p_product_id uuid)
RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas
AS $function$
  WITH active_variants AS (
    SELECT variant.* FROM saas.product_variants AS variant
    WHERE variant.store_id = p_store_id AND variant.product_id = p_product_id AND variant.status = 'active'
  ), selected_price AS (
    SELECT variant.* FROM active_variants AS variant ORDER BY variant.price_cents, variant.created_at, variant.id LIMIT 1
  ), variants AS (
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'id', variant.id, 'title', variant.title, 'sku', variant.sku, 'priceCents', variant.price_cents,
      'compareAtCents', variant.compare_at_cents, 'stockTracking', variant.stock_tracking,
      'stockQuantity', variant.stock_quantity, 'available', (NOT variant.stock_tracking OR variant.stock_quantity > 0),
      'attributes', variant.attributes
    )) ORDER BY variant.created_at, variant.id) AS payload FROM active_variants AS variant
  ), media AS (
    SELECT COALESCE(pg_catalog.jsonb_agg(saas.public_media_projection(item.id) ORDER BY item.sort_order, item.id), '[]'::jsonb) AS payload
    FROM saas.product_media AS item WHERE item.store_id = p_store_id AND item.product_id = p_product_id AND item.status = 'active'
  )
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', product.id, 'slug', product.slug, 'title', product.title, 'description', product.description,
    'currency', product.currency, 'status', 'active', 'priceCents', selected_price.price_cents,
    'compareAtCents', selected_price.compare_at_cents,
    'available', EXISTS (SELECT 1 FROM active_variants AS available WHERE NOT available.stock_tracking OR available.stock_quantity > 0),
    'variants', variants.payload, 'media', media.payload
  ))
  FROM saas.products AS product CROSS JOIN selected_price CROSS JOIN variants CROSS JOIN media
  WHERE product.id = p_product_id AND product.store_id = p_store_id AND product.status = 'active';
$function$;
REVOKE ALL ON FUNCTION saas.public_product_projection(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION saas.resolve_public_storefront(p_hostname text, p_now timestamptz)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE projection jsonb;
BEGIN
  IF p_now IS NULL OR p_hostname IS NULL OR p_hostname <> lower(p_hostname)
     OR char_length(p_hostname) NOT BETWEEN 3 AND 253 OR p_hostname ~ '[*:/?#@[:space:][:cntrl:]]'
     OR p_hostname !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb; RETURN;
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion', 1, 'id', store.id, 'name', store.name, 'slug', store.slug,
    'hostname', domain.hostname, 'primaryHostname', primary_domain.hostname,
    'canonicalUrl', 'https://' || domain.hostname || '/', 'currency', store.currency,
    'locale', store.locale, 'themeKey', store.theme_key
  ) INTO projection
  FROM saas.store_domains AS domain
  JOIN saas.stores AS store ON store.id = domain.store_id AND store.status = 'active'
  JOIN saas.store_domains AS primary_domain ON primary_domain.store_id = store.id
    AND primary_domain.status = 'active' AND primary_domain.is_primary
    AND primary_domain.verified_at <= p_now
  WHERE domain.hostname = p_hostname AND domain.status = 'active' AND domain.verified_at <= p_now;
  RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'not_found' ELSE 'found' END, projection;
END
$function$;
REVOKE ALL ON FUNCTION saas.resolve_public_storefront(text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.resolve_public_storefront(text,timestamptz) TO celebix_saas_host_resolver;

CREATE FUNCTION saas.public_storefront_authorized(p_store_id uuid, p_hostname text, p_now timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, saas
AS $function$
  SELECT p_store_id IS NOT NULL AND p_now IS NOT NULL AND EXISTS (
    SELECT 1 FROM saas.store_domains AS domain JOIN saas.stores AS store ON store.id = domain.store_id
    WHERE domain.store_id = p_store_id AND domain.hostname = p_hostname AND domain.status = 'active'
      AND domain.verified_at <= p_now AND store.status = 'active'
  );
$function$;
REVOKE ALL ON FUNCTION saas.public_storefront_authorized(uuid,text,timestamptz) FROM PUBLIC;

CREATE FUNCTION saas.public_list_products(p_store_id uuid, p_hostname text, p_now timestamptz, p_limit integer)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 48 THEN RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb; RETURN; END IF;
  IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found'::text, NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text, COALESCE(pg_catalog.jsonb_agg(item.payload ORDER BY item.created_at DESC, item.id DESC), '[]'::jsonb)
  FROM (
    SELECT product.id, product.created_at, saas.public_product_projection(p_store_id, product.id) AS payload
    FROM saas.products AS product WHERE product.store_id = p_store_id AND product.status = 'active'
      AND EXISTS (SELECT 1 FROM saas.product_variants AS variant WHERE variant.store_id=p_store_id AND variant.product_id=product.id AND variant.status='active')
    ORDER BY product.created_at DESC, product.id DESC LIMIT p_limit
  ) AS item;
END
$function$;
REVOKE ALL ON FUNCTION saas.public_list_products(uuid,text,timestamptz,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.public_list_products(uuid,text,timestamptz,integer) TO celebix_saas_host_resolver;

CREATE FUNCTION saas.public_get_product_by_slug(p_store_id uuid, p_hostname text, p_now timestamptz, p_slug text)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE projection jsonb;
BEGIN
  IF p_slug IS NULL OR p_slug <> lower(p_slug) OR char_length(p_slug) NOT BETWEEN 3 AND 100 OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  SELECT saas.public_product_projection(p_store_id, product.id) INTO projection FROM saas.products AS product
  WHERE product.store_id=p_store_id AND product.slug=p_slug AND product.status='active';
  RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'not_found' ELSE 'found' END, projection;
END
$function$;
REVOKE ALL ON FUNCTION saas.public_get_product_by_slug(uuid,text,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.public_get_product_by_slug(uuid,text,timestamptz,text) TO celebix_saas_host_resolver;

CREATE FUNCTION saas.public_list_product_media(p_store_id uuid,p_hostname text,p_now timestamptz,p_product_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) OR NOT EXISTS (
    SELECT 1 FROM saas.products AS product WHERE product.id=p_product_id AND product.store_id=p_store_id AND product.status='active'
  ) THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,COALESCE(pg_catalog.jsonb_agg(saas.public_media_projection(media.id) ORDER BY media.sort_order,media.id),'[]'::jsonb)
  FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.status='active';
END
$function$;
REVOKE ALL ON FUNCTION saas.public_list_product_media(uuid,text,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.public_list_product_media(uuid,text,timestamptz,uuid) TO celebix_saas_host_resolver;

CREATE FUNCTION saas.media_authority_error(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_storage_bytes IS NULL OR p_now IS NULL OR p_storage_bytes < 0 THEN RETURN 'invalid_input'; END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.stores AS store WHERE store.id=p_store_id AND store.status='active') THEN RETURN 'store_inactive'; END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.memberships AS membership WHERE membership.id=p_membership_id AND membership.store_id=p_store_id AND membership.principal_id=p_principal_id AND membership.status='active' AND membership.role IN ('store_owner','admin','editor')) THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM saas.subscriptions AS subscription
    JOIN saas.plans AS plan ON plan.id=subscription.plan_id
      AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
    WHERE subscription.store_id=p_store_id AND subscription.plan_id=p_plan_id
      AND subscription.plan_code=p_plan_code AND subscription.plan_version=p_plan_version
      AND subscription.status='active' AND subscription.valid_from <= p_now
      AND (subscription.valid_until IS NULL OR subscription.valid_until > p_now)
      AND plan.status='active' AND plan.valid_from <= p_now
      AND (plan.valid_until IS NULL OR plan.valid_until > p_now)
  ) THEN RETURN 'feature_not_enabled'; END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.plan_features AS feature WHERE feature.plan_id=p_plan_id AND feature.feature_key='media' AND feature.enabled)
     OR NOT EXISTS (SELECT 1 FROM saas.plan_limits AS plan_limit WHERE plan_limit.plan_id=p_plan_id AND plan_limit.limit_key='storageBytes' AND plan_limit.effective_limit=p_storage_bytes) THEN
    RETURN 'feature_not_enabled';
  END IF;
  RETURN NULL;
END
$function$;
REVOKE ALL ON FUNCTION saas.media_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) FROM PUBLIC;

CREATE FUNCTION saas.media_operation_replay(p_operation_id uuid,p_store_id uuid,p_kind text,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
  SELECT CASE WHEN operation.operation_kind=p_kind AND operation.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END, operation.result_payload
  FROM saas.product_media_operations AS operation WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id;
$function$;
REVOKE ALL ON FUNCTION saas.media_operation_replay(uuid,uuid,text,text) FROM PUBLIC;

CREATE FUNCTION saas.media_attach_product(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_media_id uuid,p_product_id uuid,p_variant_id uuid,p_object_key text,p_public_url text,p_media_type text,p_alt_text text,p_width integer,p_height integer,p_byte_size bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; existing record; next_order integer; projection jsonb;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO existing FROM saas.media_operation_replay(p_operation_id,p_store_id,'attach_media',p_fingerprint);
  IF FOUND THEN RETURN QUERY SELECT existing.outcome,existing.result_payload; RETURN; END IF;
  PERFORM 1 FROM saas.products AS product WHERE product.id=p_product_id AND product.store_id=p_store_id AND product.status<>'archived' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF p_variant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM saas.product_variants AS variant WHERE variant.id=p_variant_id AND variant.product_id=p_product_id AND variant.store_id=p_store_id AND variant.status='active') THEN RETURN QUERY SELECT 'variant_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF p_media_id IS NULL OR p_operation_id IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_media_type NOT IN ('image/jpeg','image/png','image/webp') OR p_width NOT BETWEEN 1 AND 8192 OR p_height NOT BETWEEN 1 AND 8192 OR p_byte_size NOT BETWEEN 1 AND 5242880 OR p_alt_text IS NULL OR p_alt_text<>btrim(p_alt_text) OR char_length(p_alt_text)>500 OR p_alt_text~'[[:cntrl:]]' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF p_object_key <> 'stores/'||p_store_id::text||'/products/'||p_product_id::text||'/'||p_media_id::text||(CASE p_media_type WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' ELSE '.webp' END) OR p_public_url !~ '^https://[^/?#[:space:][:cntrl:]]+/' OR right(p_public_url,char_length(p_object_key)+1)<>'/'||p_object_key THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF (SELECT count(*) FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.status IN ('pending','active')) >= 16 OR (SELECT COALESCE(sum(media.byte_size),0) FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.status IN ('pending','active')) + p_byte_size > p_storage_bytes THEN RETURN QUERY SELECT 'media_limit_reached'::text,NULL::jsonb; RETURN; END IF;
  SELECT COALESCE(max(media.sort_order)+1,0) INTO next_order FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.status='active';
  INSERT INTO saas.product_media(id,store_id,product_id,variant_id,object_key,public_url,media_type,alt_text,width,height,byte_size,sort_order,status,created_at,updated_at,version) VALUES(p_media_id,p_store_id,p_product_id,p_variant_id,p_object_key,p_public_url,p_media_type,p_alt_text,p_width,p_height,p_byte_size,next_order,'active',p_now,p_now,1);
  projection:=pg_catalog.jsonb_build_object('media',saas.media_projection(p_media_id));
  INSERT INTO saas.product_media_operations VALUES(p_operation_id,p_store_id,'attach_media',p_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'committed'::text,projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
END
$function$;

CREATE FUNCTION saas.media_list_product(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,p_product_id uuid,p_include_archived boolean)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_include_archived IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.products AS product WHERE product.id=p_product_id AND product.store_id=p_store_id AND product.status<>'archived') THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,COALESCE(pg_catalog.jsonb_agg(saas.media_projection(media.id) ORDER BY media.sort_order,media.id),'[]'::jsonb) FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND (p_include_archived OR media.status<>'archived');
END
$function$;

CREATE FUNCTION saas.media_update_alt(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_media_id uuid,p_expected_version bigint,p_alt_text text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; existing record; current_version bigint; projection jsonb;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now); IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO existing FROM saas.media_operation_replay(p_operation_id,p_store_id,'update_alt',p_fingerprint); IF FOUND THEN RETURN QUERY SELECT existing.outcome,existing.result_payload; RETURN; END IF;
  IF p_alt_text IS NULL OR p_alt_text<>btrim(p_alt_text) OR char_length(p_alt_text)>500 OR p_alt_text~'[[:cntrl:]]' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT media.version INTO current_version FROM saas.product_media AS media WHERE media.id=p_media_id AND media.product_id=p_product_id AND media.store_id=p_store_id AND media.status<>'archived' FOR UPDATE;
  IF current_version IS NULL THEN RETURN QUERY SELECT 'media_not_found'::text,NULL::jsonb; RETURN; END IF; IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.product_media SET alt_text=p_alt_text,updated_at=p_now,version=version+1 WHERE id=p_media_id;
  projection:=pg_catalog.jsonb_build_object('media',saas.media_projection(p_media_id)); INSERT INTO saas.product_media_operations VALUES(p_operation_id,p_store_id,'update_alt',p_fingerprint,projection,p_now); RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.media_reorder_product(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_ordered_ids uuid[])
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; existing record; projection jsonb;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now); IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO existing FROM saas.media_operation_replay(p_operation_id,p_store_id,'reorder_media',p_fingerprint); IF FOUND THEN RETURN QUERY SELECT existing.outcome,existing.result_payload; RETURN; END IF;
  IF p_ordered_ids IS NULL OR cardinality(p_ordered_ids) NOT BETWEEN 1 AND 16 OR (SELECT count(DISTINCT requested.id) FROM unnest(p_ordered_ids) AS requested(id))<>cardinality(p_ordered_ids) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.products AS product WHERE product.id=p_product_id AND product.store_id=p_store_id AND product.status<>'archived' FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF (SELECT count(*) FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.status='active')<>cardinality(p_ordered_ids) OR EXISTS(SELECT 1 FROM unnest(p_ordered_ids) AS requested(id) WHERE NOT EXISTS(SELECT 1 FROM saas.product_media AS media WHERE media.id=requested.id AND media.store_id=p_store_id AND media.product_id=p_product_id AND media.status='active')) THEN RETURN QUERY SELECT 'media_not_found'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.product_media SET status='pending',updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND product_id=p_product_id AND status='active';
  UPDATE saas.product_media AS media SET status='active',sort_order=requested.ordinality-1,updated_at=p_now,version=version+1 FROM unnest(p_ordered_ids) WITH ORDINALITY AS requested(id,ordinality) WHERE media.id=requested.id AND media.store_id=p_store_id AND media.product_id=p_product_id;
  SELECT pg_catalog.jsonb_agg(saas.media_projection(media.id) ORDER BY media.sort_order,media.id) INTO projection FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.status='active';
  INSERT INTO saas.product_media_operations VALUES(p_operation_id,p_store_id,'reorder_media',p_fingerprint,projection,p_now); RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.media_archive_product(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_media_id uuid,p_expected_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; existing record; current_version bigint; projection jsonb;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now); IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO existing FROM saas.media_operation_replay(p_operation_id,p_store_id,'archive_media',p_fingerprint); IF FOUND THEN RETURN QUERY SELECT existing.outcome,existing.result_payload; RETURN; END IF;
  SELECT media.version INTO current_version FROM saas.product_media AS media WHERE media.id=p_media_id AND media.product_id=p_product_id AND media.store_id=p_store_id AND media.status<>'archived' FOR UPDATE;
  IF current_version IS NULL THEN RETURN QUERY SELECT 'media_not_found'::text,NULL::jsonb; RETURN; END IF; IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.product_media SET status='archived',archived_at=p_now,updated_at=p_now,version=version+1 WHERE id=p_media_id;
  projection:=pg_catalog.jsonb_build_object('media',saas.media_projection(p_media_id)); INSERT INTO saas.product_media_operations VALUES(p_operation_id,p_store_id,'archive_media',p_fingerprint,projection,p_now); RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

REVOKE ALL ON FUNCTION saas.media_attach_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,uuid,text,text,text,text,integer,integer,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_list_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_update_alt(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_reorder_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.media_attach_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,uuid,text,text,text,text,integer,integer,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_list_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_update_alt(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_reorder_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[]) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) TO celebix_saas_app;

COMMIT;
