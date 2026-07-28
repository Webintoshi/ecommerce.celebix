-- İKAS-quality tenant-scoped catalog onboarding foundation.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.catalog_product_profiles(
  product_id uuid NOT NULL,
  store_id uuid NOT NULL,
  product_type text NOT NULL,
  supplier_name text,
  google_product_category_id text,
  seo_title text,
  seo_description text,
  minimum_purchase_quantity bigint NOT NULL DEFAULT 1,
  maximum_purchase_quantity bigint,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(product_id),
  UNIQUE(store_id,product_id),
  FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  CHECK(product_type IN('physical','digital')),
  CHECK(supplier_name IS NULL OR (supplier_name=pg_catalog.btrim(supplier_name) AND pg_catalog.char_length(supplier_name) BETWEEN 1 AND 200 AND supplier_name!~'[[:cntrl:]]')),
  CHECK(google_product_category_id IS NULL OR google_product_category_id~'^[0-9]{1,20}$'),
  CHECK(seo_title IS NULL OR (seo_title=pg_catalog.btrim(seo_title) AND pg_catalog.char_length(seo_title) BETWEEN 1 AND 200 AND seo_title!~'[[:cntrl:]]')),
  CHECK(seo_description IS NULL OR (seo_description=pg_catalog.btrim(seo_description) AND pg_catalog.char_length(seo_description) BETWEEN 1 AND 500 AND seo_description!~'[[:cntrl:]]')),
  CHECK(minimum_purchase_quantity BETWEEN 1 AND 9007199254740991),
  CHECK(maximum_purchase_quantity IS NULL OR (maximum_purchase_quantity BETWEEN 1 AND 9007199254740991 AND maximum_purchase_quantity>=minimum_purchase_quantity)),
  CHECK(version BETWEEN 1 AND 9007199254740991),
  CHECK(pg_catalog.isfinite(created_at) AND pg_catalog.isfinite(updated_at) AND updated_at>=created_at)
);

CREATE TABLE saas.catalog_categories(
  id uuid NOT NULL,
  store_id uuid NOT NULL,
  parent_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  depth integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  version bigint NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(id),
  UNIQUE(store_id,id),
  UNIQUE(store_id,slug),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,parent_id) REFERENCES saas.catalog_categories(store_id,id) ON DELETE RESTRICT,
  CHECK(parent_id IS NULL OR parent_id<>id),
  CHECK(name=pg_catalog.btrim(name) AND pg_catalog.char_length(name) BETWEEN 1 AND 120 AND name!~'[[:cntrl:]]'),
  CHECK(slug=pg_catalog.lower(slug) AND pg_catalog.char_length(slug) BETWEEN 1 AND 100 AND slug~'^[a-z0-9]+(-[a-z0-9]+)*$'),
  CHECK(position BETWEEN 0 AND 9999),
  CHECK(depth BETWEEN 1 AND 8),
  CHECK(status IN('active','archived')),
  CHECK(version BETWEEN 1 AND 9007199254740991),
  CHECK(pg_catalog.isfinite(created_at) AND pg_catalog.isfinite(updated_at) AND updated_at>=created_at),
  CHECK((status='active' AND archived_at IS NULL) OR (status='archived' AND archived_at IS NOT NULL AND archived_at>=created_at AND updated_at>=archived_at))
);

CREATE INDEX catalog_categories_store_tree_idx
  ON saas.catalog_categories(store_id,parent_id,position,id)
  WHERE status='active';

CREATE FUNCTION saas.guard_catalog_category_tree()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  parent_depth integer;
  cycle_found boolean;
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.id<>OLD.id OR NEW.store_id<>OLD.store_id OR NEW.created_at<>OLD.created_at
    OR NEW.version<>OLD.version+1 OR OLD.status='archived'
  ) THEN
    RAISE EXCEPTION 'CATALOG_CATEGORY_AUTHORITY_IMMUTABLE';
  END IF;

  IF NEW.parent_id IS NULL THEN
    NEW.depth:=1;
  ELSE
    SELECT category.depth INTO parent_depth
    FROM saas.catalog_categories AS category
    WHERE category.store_id=NEW.store_id AND category.id=NEW.parent_id AND category.status='active'
    FOR UPDATE;
    IF parent_depth IS NULL THEN RAISE EXCEPTION 'CATALOG_CATEGORY_PARENT_INVALID'; END IF;
    NEW.depth:=parent_depth+1;
    IF NEW.depth>8 THEN RAISE EXCEPTION 'CATALOG_CATEGORY_DEPTH_EXCEEDED'; END IF;

    WITH RECURSIVE ancestors(id,parent_id) AS (
      SELECT category.id,category.parent_id
      FROM saas.catalog_categories AS category
      WHERE category.store_id=NEW.store_id AND category.id=NEW.parent_id
      UNION ALL
      SELECT parent.id,parent.parent_id
      FROM saas.catalog_categories AS parent
      JOIN ancestors ON parent.id=ancestors.parent_id
      WHERE parent.store_id=NEW.store_id
    )
    SELECT EXISTS(SELECT 1 FROM ancestors WHERE id=NEW.id) INTO cycle_found;
    IF cycle_found THEN RAISE EXCEPTION 'CATALOG_CATEGORY_CYCLE'; END IF;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION saas.guard_catalog_category_tree() FROM PUBLIC;
CREATE TRIGGER catalog_categories_tree_guard
BEFORE INSERT OR UPDATE ON saas.catalog_categories
FOR EACH ROW EXECUTE FUNCTION saas.guard_catalog_category_tree();

CREATE TABLE saas.catalog_product_categories(
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  category_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY(store_id,product_id,category_id),
  UNIQUE(store_id,category_id,product_id),
  FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,category_id) REFERENCES saas.catalog_categories(store_id,id) ON DELETE RESTRICT,
  CHECK(position BETWEEN 0 AND 7)
);

CREATE INDEX catalog_product_categories_category_idx
  ON saas.catalog_product_categories(store_id,category_id,position,product_id);

CREATE TABLE saas.catalog_variant_commerce_profiles(
  variant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  store_id uuid NOT NULL,
  continue_selling_when_out_of_stock boolean NOT NULL DEFAULT false,
  measured_quantity_milli bigint,
  measured_unit text,
  base_quantity_milli bigint,
  base_unit text,
  shipping_desi_milli bigint,
  hs_code text,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(variant_id),
  UNIQUE(store_id,variant_id),
  FOREIGN KEY(store_id,variant_id) REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,product_id,variant_id) REFERENCES saas.product_variants(store_id,product_id,id) ON DELETE RESTRICT,
  CHECK(measured_quantity_milli IS NULL OR measured_quantity_milli BETWEEN 1 AND 9007199254740991),
  CHECK(base_quantity_milli IS NULL OR base_quantity_milli BETWEEN 1 AND 9007199254740991),
  CHECK(measured_unit IS NULL OR measured_unit IN('piece','g','kg','ml','l','cm','m','m2','m3')),
  CHECK(base_unit IS NULL OR base_unit IN('piece','g','kg','ml','l','cm','m','m2','m3')),
  CHECK((measured_quantity_milli IS NULL AND measured_unit IS NULL AND base_quantity_milli IS NULL AND base_unit IS NULL) OR (measured_quantity_milli IS NOT NULL AND measured_unit IS NOT NULL AND base_quantity_milli IS NOT NULL AND base_unit IS NOT NULL)),
  CHECK(shipping_desi_milli IS NULL OR shipping_desi_milli BETWEEN 0 AND 9007199254740991),
  CHECK(hs_code IS NULL OR hs_code~'^[0-9]{4,12}$'),
  CHECK(version BETWEEN 1 AND 9007199254740991),
  CHECK(pg_catalog.isfinite(created_at) AND pg_catalog.isfinite(updated_at) AND updated_at>=created_at)
);

CREATE TABLE saas.catalog_product_channels(
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  channel_kind text NOT NULL,
  storefront_domain_id uuid,
  marketplace_profile_id uuid,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,product_id,channel_id),
  FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,storefront_domain_id) REFERENCES saas.store_domains(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,marketplace_profile_id) REFERENCES saas.merchant_provider_profiles(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT catalog_product_channels_authority_check CHECK(
    channel_kind IN('storefront','marketplace')
    AND (
      (channel_kind='storefront' AND channel_id=storefront_domain_id AND storefront_domain_id IS NOT NULL AND marketplace_profile_id IS NULL)
      OR
      (channel_kind='marketplace' AND channel_id=marketplace_profile_id AND marketplace_profile_id IS NOT NULL AND storefront_domain_id IS NULL)
    )
  ),
  CHECK(position BETWEEN 0 AND 31),
  CHECK(pg_catalog.isfinite(created_at))
);

CREATE INDEX catalog_product_channels_channel_idx
  ON saas.catalog_product_channels(store_id,channel_kind,channel_id,product_id);

CREATE TABLE saas.catalog_onboarding_operations(
  operation_id uuid NOT NULL,
  store_id uuid NOT NULL,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_product_id uuid,
  result_category_id uuid,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY(operation_id),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,result_product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,result_category_id) REFERENCES saas.catalog_categories(store_id,id) ON DELETE RESTRICT,
  CHECK(operation_kind IN('quick_create','advanced_create','update_merchandising','publish_after_media','create_category','update_category','archive_category')),
  CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=131072),
  CHECK(pg_catalog.isfinite(committed_at)),
  CHECK(
    (operation_kind IN('quick_create','advanced_create','update_merchandising','publish_after_media') AND result_product_id IS NOT NULL AND result_category_id IS NULL)
    OR
    (operation_kind IN('create_category','update_category','archive_category') AND result_product_id IS NULL AND result_category_id IS NOT NULL)
  )
);

CREATE INDEX catalog_onboarding_operations_store_idx
  ON saas.catalog_onboarding_operations(store_id,committed_at DESC,operation_id);

CREATE FUNCTION saas.guard_catalog_onboarding_operation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  RAISE EXCEPTION 'CATALOG_ONBOARDING_OPERATION_IMMUTABLE';
END
$function$;

REVOKE ALL ON FUNCTION saas.guard_catalog_onboarding_operation_mutation() FROM PUBLIC;
CREATE TRIGGER catalog_onboarding_operations_immutable
BEFORE UPDATE OR DELETE ON saas.catalog_onboarding_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_catalog_onboarding_operation_mutation();

ALTER TABLE saas.catalog_product_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_product_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_product_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_variant_commerce_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_variant_commerce_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_product_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_product_channels FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_onboarding_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_onboarding_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON saas.catalog_product_profiles FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON saas.catalog_categories FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON saas.catalog_product_categories FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON saas.catalog_variant_commerce_profiles FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON saas.catalog_product_channels FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON saas.catalog_onboarding_operations FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

CREATE FUNCTION saas.catalog_onboarding_json_exact(
  candidate jsonb,
  required_keys text[],
  optional_keys text[] DEFAULT ARRAY[]::text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path=pg_catalog,saas
AS $function$
  SELECT candidate IS NOT NULL
    AND pg_catalog.jsonb_typeof(candidate)='object'
    AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.unnest(required_keys) AS required(key)
      WHERE NOT candidate ? required.key
    )
    AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_object_keys(candidate) AS actual(key)
      WHERE NOT actual.key=ANY(required_keys||optional_keys)
    )
$function$;

CREATE FUNCTION saas.catalog_onboarding_uuid_json_array_valid(
  candidate jsonb,
  maximum_count integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path=pg_catalog,saas
AS $function$
  SELECT candidate IS NOT NULL
    AND pg_catalog.jsonb_typeof(candidate)='array'
    AND pg_catalog.jsonb_array_length(candidate)<=maximum_count
    AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(candidate) AS item(value)
      WHERE pg_catalog.jsonb_typeof(item.value)<>'string'
         OR item.value#>>'{}'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    AND pg_catalog.jsonb_array_length(candidate)=(
      SELECT pg_catalog.count(DISTINCT item.value#>>'{}')
      FROM pg_catalog.jsonb_array_elements(candidate) AS item(value)
    )
$function$;

CREATE FUNCTION saas.catalog_onboarding_slug_base(candidate text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  normalized text;
BEGIN
  normalized:=pg_catalog.lower(pg_catalog.translate(candidate,'ÇĞİÖŞÜçğıöşü','CGIOSUcgiosu'));
  normalized:=pg_catalog.regexp_replace(normalized,'[^a-z0-9]+','-','g');
  normalized:=pg_catalog.btrim(normalized,'-');
  IF normalized='' THEN normalized:='urun'; END IF;
  IF pg_catalog.char_length(normalized)<3 THEN normalized:='urun-'||normalized; END IF;
  RETURN pg_catalog.left(normalized,100);
END
$function$;

CREATE FUNCTION saas.catalog_onboarding_resource_ids_projection(
  p_store_id uuid,
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'brand',(
      SELECT relation.resource_id
      FROM saas.catalog_admin_resource_products AS relation
      JOIN saas.catalog_admin_resources AS resource
        ON resource.store_id=relation.store_id AND resource.id=relation.resource_id
      WHERE relation.store_id=p_store_id AND relation.product_id=p_product_id
        AND resource.resource_kind='brand' AND resource.status='active'
      ORDER BY relation.resource_id LIMIT 1
    ),
    'collections',COALESCE((
      SELECT pg_catalog.jsonb_agg(relation.resource_id ORDER BY relation.resource_id)
      FROM saas.catalog_admin_resource_products AS relation
      JOIN saas.catalog_admin_resources AS resource
        ON resource.store_id=relation.store_id AND resource.id=relation.resource_id
      WHERE relation.store_id=p_store_id AND relation.product_id=p_product_id
        AND resource.resource_kind='collection' AND resource.status='active'
    ),'[]'::jsonb),
    'tags',COALESCE((
      SELECT pg_catalog.jsonb_agg(relation.resource_id ORDER BY relation.resource_id)
      FROM saas.catalog_admin_resource_products AS relation
      JOIN saas.catalog_admin_resources AS resource
        ON resource.store_id=relation.store_id AND resource.id=relation.resource_id
      WHERE relation.store_id=p_store_id AND relation.product_id=p_product_id
        AND resource.resource_kind='tag' AND resource.status='active'
    ),'[]'::jsonb),
    'attributes',COALESCE((
      SELECT pg_catalog.jsonb_agg(relation.resource_id ORDER BY relation.resource_id)
      FROM saas.catalog_admin_resource_products AS relation
      JOIN saas.catalog_admin_resources AS resource
        ON resource.store_id=relation.store_id AND resource.id=relation.resource_id
      WHERE relation.store_id=p_store_id AND relation.product_id=p_product_id
        AND resource.resource_kind='attribute' AND resource.status='active'
    ),'[]'::jsonb),
    'extras',COALESCE((
      SELECT pg_catalog.jsonb_agg(relation.resource_id ORDER BY relation.resource_id)
      FROM saas.catalog_admin_resource_products AS relation
      JOIN saas.catalog_admin_resources AS resource
        ON resource.store_id=relation.store_id AND resource.id=relation.resource_id
      WHERE relation.store_id=p_store_id AND relation.product_id=p_product_id
        AND resource.resource_kind='extra' AND resource.status='active'
    ),'[]'::jsonb),
    'definitions',COALESCE((
      SELECT pg_catalog.jsonb_agg(relation.resource_id ORDER BY relation.resource_id)
      FROM saas.catalog_admin_resource_products AS relation
      JOIN saas.catalog_admin_resources AS resource
        ON resource.store_id=relation.store_id AND resource.id=relation.resource_id
      WHERE relation.store_id=p_store_id AND relation.product_id=p_product_id
        AND resource.resource_kind='definition' AND resource.status='active'
    ),'[]'::jsonb)
  ))
$function$;

CREATE FUNCTION saas.catalog_onboarding_profile_projection(
  p_store_id uuid,
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'productType',profile.product_type,
    'supplierName',profile.supplier_name,
    'googleProductCategoryId',profile.google_product_category_id,
    'seoTitle',profile.seo_title,
    'seoDescription',profile.seo_description,
    'minimumPurchaseQuantity',profile.minimum_purchase_quantity,
    'maximumPurchaseQuantity',profile.maximum_purchase_quantity,
    'version',profile.version,
    'updatedAt',saas.catalog_timestamp(profile.updated_at)
  ))
  FROM saas.catalog_product_profiles AS profile
  WHERE profile.store_id=p_store_id AND profile.product_id=p_product_id
$function$;

CREATE FUNCTION saas.catalog_onboarding_result_projection(
  p_store_id uuid,
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'product',saas.catalog_product_projection(p_product_id),
    'variants',COALESCE((
      SELECT pg_catalog.jsonb_agg(saas.catalog_variant_projection(variant.id) ORDER BY variant.created_at,variant.id)
      FROM saas.product_variants AS variant
      WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id AND variant.status='active'
    ),'[]'::jsonb),
    'profile',saas.catalog_onboarding_profile_projection(p_store_id,p_product_id),
    'categoryIds',COALESCE((
      SELECT pg_catalog.jsonb_agg(relation.category_id ORDER BY relation.position,relation.category_id)
      FROM saas.catalog_product_categories AS relation
      WHERE relation.store_id=p_store_id AND relation.product_id=p_product_id
    ),'[]'::jsonb),
    'resourceIds',saas.catalog_onboarding_resource_ids_projection(p_store_id,p_product_id),
    'channelIds',COALESCE((
      SELECT pg_catalog.jsonb_agg(channel.channel_id ORDER BY channel.position,channel.channel_id)
      FROM saas.catalog_product_channels AS channel
      WHERE channel.store_id=p_store_id AND channel.product_id=p_product_id
    ),'[]'::jsonb),
    'mediaCount',(
      SELECT pg_catalog.count(*)
      FROM saas.product_media AS media
      WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.status='active'
    ),
    'replayed',false
  )
$function$;

CREATE FUNCTION saas.catalog_product_editor_projection(
  p_store_id uuid,
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'product',saas.catalog_product_projection(p_product_id),
    'variants',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'variant',saas.catalog_variant_projection(variant.id),
          'continueSellingWhenOutOfStock',commerce.continue_selling_when_out_of_stock,
          'unitPricing',CASE WHEN commerce.measured_quantity_milli IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
            'measuredQuantityMilli',commerce.measured_quantity_milli,
            'measuredUnit',commerce.measured_unit,
            'baseQuantityMilli',commerce.base_quantity_milli,
            'baseUnit',commerce.base_unit
          ) END,
          'shippingDesiMilli',commerce.shipping_desi_milli,
          'hsCode',commerce.hs_code,
          'inventory',COALESCE((
            SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'locationId',balance.location_id,'quantity',balance.quantity
            ) ORDER BY location.is_default DESC,balance.location_id)
            FROM saas.inventory_balances AS balance
            JOIN saas.inventory_locations AS location
              ON location.store_id=balance.store_id AND location.id=balance.location_id
            WHERE balance.store_id=p_store_id AND balance.variant_id=variant.id AND location.status='active'
          ),'[]'::jsonb)
        )) ORDER BY variant.created_at,variant.id
      )
      FROM saas.product_variants AS variant
      JOIN saas.catalog_variant_commerce_profiles AS commerce
        ON commerce.store_id=variant.store_id AND commerce.variant_id=variant.id
      WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id AND variant.status='active'
    ),'[]'::jsonb),
    'profile',saas.catalog_onboarding_profile_projection(p_store_id,p_product_id),
    'categoryIds',COALESCE((
      SELECT pg_catalog.jsonb_agg(relation.category_id ORDER BY relation.position,relation.category_id)
      FROM saas.catalog_product_categories AS relation
      WHERE relation.store_id=p_store_id AND relation.product_id=p_product_id
    ),'[]'::jsonb),
    'resourceIds',saas.catalog_onboarding_resource_ids_projection(p_store_id,p_product_id),
    'channelIds',COALESCE((
      SELECT pg_catalog.jsonb_agg(channel.channel_id ORDER BY channel.position,channel.channel_id)
      FROM saas.catalog_product_channels AS channel
      WHERE channel.store_id=p_store_id AND channel.product_id=p_product_id
    ),'[]'::jsonb),
    'mediaCount',(
      SELECT pg_catalog.count(*) FROM saas.product_media AS media
      WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.status='active'
    )
  )
$function$;

CREATE FUNCTION saas.catalog_get_onboarding_options(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
BEGIN
  authority_error:=saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NULL THEN
    authority_error:=saas.merchant_action_authority_error(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
      'catalog','catalog_admin.read'
    );
  END IF;
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
    'categories',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id',category.id,'parentId',category.parent_id,'name',category.name,
        'slug',category.slug,'position',category.position
      )) ORDER BY category.depth,category.position,category.id)
      FROM saas.catalog_categories AS category
      WHERE category.store_id=p_store_id AND category.status='active'
    ),'[]'::jsonb),
    'resources',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',resource.id,'kind',resource.resource_kind,'name',resource.name
      ) ORDER BY resource.resource_kind,resource.name,resource.id)
      FROM saas.catalog_admin_resources AS resource
      WHERE resource.store_id=p_store_id AND resource.status='active'
    ),'[]'::jsonb),
    'locations',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',location.id,'name',location.name,'isDefault',location.is_default
      ) ORDER BY location.is_default DESC,location.name,location.id)
      FROM saas.inventory_locations AS location
      WHERE location.store_id=p_store_id AND location.status='active'
    ),'[]'::jsonb),
    'channels',COALESCE((
      SELECT pg_catalog.jsonb_agg(channel.value ORDER BY channel.kind,channel.name,channel.id)
      FROM (
        SELECT domain.id,'storefront'::text AS kind,domain.hostname AS name,
          pg_catalog.jsonb_build_object('id',domain.id,'kind','storefront','name',domain.hostname) AS value
        FROM saas.store_domains AS domain
        WHERE domain.store_id=p_store_id AND domain.status='active'
        UNION ALL
        SELECT profile.id,'marketplace'::text,profile.provider_code,
          pg_catalog.jsonb_build_object('id',profile.id,'kind','marketplace','name',profile.provider_code)
        FROM saas.merchant_provider_profiles AS profile
        WHERE profile.store_id=p_store_id AND profile.status='active' AND profile.capability='marketplace_sync'
      ) AS channel
    ),'[]'::jsonb)
  );
END
$function$;

CREATE FUNCTION saas.catalog_onboard_product(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_variant_ids uuid[],p_intent jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  prior_operation saas.catalog_onboarding_operations%ROWTYPE;
  store_currency text;
  intent_kind text;
  product_title text;
  product_description text;
  product_type text;
  slug_base text;
  allocated_slug text;
  slug_suffix integer:=1;
  variant_count integer;
  category_values jsonb;
  resource_values jsonb;
  channel_values jsonb;
  profile_values jsonb;
  variant_value jsonb;
  inventory_value jsonb;
  inventory_total numeric;
  variant_ordinal integer;
  requested_variant_id uuid;
  category_record record;
  resource_record record;
  channel_record record;
  result jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NULL THEN
    authority_error:=saas.merchant_action_authority_error(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
      'catalog','catalog_admin.manage'
    );
  END IF;
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;

  SELECT operation.* INTO prior_operation
  FROM saas.catalog_onboarding_operations AS operation
  WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF prior_operation.store_id<>p_store_id OR prior_operation.payload_fingerprint<>p_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'operation_replayed',prior_operation.result_payload||'{"replayed":true}'::jsonb;
    END IF;
    RETURN;
  END IF;

  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_variant_ids IS NULL OR pg_catalog.cardinality(p_variant_ids) NOT BETWEEN 1 AND 100
     OR pg_catalog.cardinality(p_variant_ids)<>(SELECT pg_catalog.count(DISTINCT id) FROM pg_catalog.unnest(p_variant_ids) AS requested(id))
     OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_variant_ids) AS requested(id) WHERE requested.id IS NULL)
     OR p_intent IS NULL OR pg_catalog.jsonb_typeof(p_intent)<>'object'
     OR pg_catalog.pg_column_size(p_intent)>131072 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  intent_kind:=p_intent->>'kind';
  IF intent_kind='quick' THEN
    IF NOT saas.catalog_onboarding_json_exact(
      p_intent,ARRAY['kind','title','priceCents','publish'],ARRAY['stockQuantity','categoryId']
    )
       OR pg_catalog.jsonb_typeof(p_intent->'title')<>'string'
       OR p_intent->>'title'<>pg_catalog.btrim(p_intent->>'title')
       OR pg_catalog.char_length(p_intent->>'title') NOT BETWEEN 1 AND 200
       OR p_intent->>'title'~'[[:cntrl:]]'
       OR pg_catalog.jsonb_typeof(p_intent->'priceCents')<>'number'
       OR (p_intent->>'priceCents')::numeric<>pg_catalog.trunc((p_intent->>'priceCents')::numeric)
       OR (p_intent->>'priceCents')::numeric NOT BETWEEN 0 AND 9007199254740991
       OR pg_catalog.jsonb_typeof(p_intent->'publish')<>'boolean'
       OR (p_intent ? 'stockQuantity' AND (
         pg_catalog.jsonb_typeof(p_intent->'stockQuantity')<>'number'
         OR (p_intent->>'stockQuantity')::numeric<>pg_catalog.trunc((p_intent->>'stockQuantity')::numeric)
         OR (p_intent->>'stockQuantity')::numeric NOT BETWEEN 0 AND 2147483647
       ))
       OR (p_intent ? 'categoryId' AND (
         pg_catalog.jsonb_typeof(p_intent->'categoryId')<>'string'
         OR p_intent->>'categoryId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       ))
       OR pg_catalog.cardinality(p_variant_ids)<>1 THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
      RETURN;
    END IF;
    product_title:=p_intent->>'title';
    product_description:=NULL;
    product_type:='physical';
    category_values:=CASE WHEN p_intent ? 'categoryId' THEN pg_catalog.jsonb_build_array(p_intent->'categoryId') ELSE '[]'::jsonb END;
    resource_values:='{"collections":[],"tags":[],"attributes":[],"extras":[],"definitions":[]}'::jsonb;
    channel_values:=COALESCE((
      SELECT pg_catalog.jsonb_agg(domain.id ORDER BY domain.hostname,domain.id)
      FROM saas.store_domains AS domain
      WHERE domain.store_id=p_store_id AND domain.status='active' AND domain.is_primary
    ),'[]'::jsonb);
    profile_values:='{"minimumPurchaseQuantity":1}'::jsonb;
    variant_count:=1;
  ELSIF intent_kind='advanced' THEN
    IF NOT saas.catalog_onboarding_json_exact(
      p_intent,
      ARRAY['kind','productType','title','publish','variants','categoryIds','resourceIds','channelIds','profile'],
      ARRAY['description']
    )
       OR p_intent->>'productType' NOT IN('physical','digital')
       OR pg_catalog.jsonb_typeof(p_intent->'title')<>'string'
       OR p_intent->>'title'<>pg_catalog.btrim(p_intent->>'title')
       OR pg_catalog.char_length(p_intent->>'title') NOT BETWEEN 1 AND 200
       OR p_intent->>'title'~'[[:cntrl:]]'
       OR pg_catalog.jsonb_typeof(p_intent->'publish')<>'boolean'
       OR (p_intent ? 'description' AND (
         pg_catalog.jsonb_typeof(p_intent->'description')<>'string'
         OR p_intent->>'description'<>pg_catalog.btrim(p_intent->>'description')
         OR pg_catalog.char_length(p_intent->>'description') NOT BETWEEN 1 AND 10000
         OR p_intent->>'description'~'[[:cntrl:]]'
       ))
       OR pg_catalog.jsonb_typeof(p_intent->'variants')<>'array'
       OR pg_catalog.jsonb_array_length(p_intent->'variants') NOT BETWEEN 1 AND 100
       OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_intent->'categoryIds',8)
       OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_intent->'channelIds',32)
       OR NOT saas.catalog_onboarding_json_exact(
         p_intent->'resourceIds',ARRAY['collections','tags','attributes','extras','definitions'],ARRAY['brand']
       )
       OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_intent->'resourceIds'->'collections',50)
       OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_intent->'resourceIds'->'tags',50)
       OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_intent->'resourceIds'->'attributes',50)
       OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_intent->'resourceIds'->'extras',50)
       OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_intent->'resourceIds'->'definitions',50)
       OR (p_intent->'resourceIds' ? 'brand' AND (
         pg_catalog.jsonb_typeof(p_intent->'resourceIds'->'brand')<>'string'
         OR p_intent->'resourceIds'->>'brand'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       ))
       OR NOT saas.catalog_onboarding_json_exact(
         p_intent->'profile',ARRAY['minimumPurchaseQuantity'],
         ARRAY['supplierName','googleProductCategoryId','seoTitle','seoDescription','maximumPurchaseQuantity']
       ) THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
      RETURN;
    END IF;

    profile_values:=p_intent->'profile';
    IF pg_catalog.jsonb_typeof(profile_values->'minimumPurchaseQuantity')<>'number'
       OR (profile_values->>'minimumPurchaseQuantity')::numeric<>pg_catalog.trunc((profile_values->>'minimumPurchaseQuantity')::numeric)
       OR (profile_values->>'minimumPurchaseQuantity')::numeric NOT BETWEEN 1 AND 9007199254740991
       OR (profile_values ? 'maximumPurchaseQuantity' AND (
         pg_catalog.jsonb_typeof(profile_values->'maximumPurchaseQuantity')<>'number'
         OR (profile_values->>'maximumPurchaseQuantity')::numeric<>pg_catalog.trunc((profile_values->>'maximumPurchaseQuantity')::numeric)
         OR (profile_values->>'maximumPurchaseQuantity')::numeric NOT BETWEEN (profile_values->>'minimumPurchaseQuantity')::numeric AND 9007199254740991
       ))
       OR (profile_values ? 'supplierName' AND (
         pg_catalog.jsonb_typeof(profile_values->'supplierName')<>'string'
         OR profile_values->>'supplierName'<>pg_catalog.btrim(profile_values->>'supplierName')
         OR pg_catalog.char_length(profile_values->>'supplierName') NOT BETWEEN 1 AND 200
         OR profile_values->>'supplierName'~'[[:cntrl:]]'
       ))
       OR (profile_values ? 'googleProductCategoryId' AND (
         pg_catalog.jsonb_typeof(profile_values->'googleProductCategoryId')<>'string'
         OR profile_values->>'googleProductCategoryId'!~'^[0-9]{1,20}$'
       ))
       OR (profile_values ? 'seoTitle' AND (
         pg_catalog.jsonb_typeof(profile_values->'seoTitle')<>'string'
         OR profile_values->>'seoTitle'<>pg_catalog.btrim(profile_values->>'seoTitle')
         OR pg_catalog.char_length(profile_values->>'seoTitle') NOT BETWEEN 1 AND 200
         OR profile_values->>'seoTitle'~'[[:cntrl:]]'
       ))
       OR (profile_values ? 'seoDescription' AND (
         pg_catalog.jsonb_typeof(profile_values->'seoDescription')<>'string'
         OR profile_values->>'seoDescription'<>pg_catalog.btrim(profile_values->>'seoDescription')
         OR pg_catalog.char_length(profile_values->>'seoDescription') NOT BETWEEN 1 AND 500
         OR profile_values->>'seoDescription'~'[[:cntrl:]]'
       )) THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
      RETURN;
    END IF;

    product_title:=p_intent->>'title';
    product_description:=p_intent->>'description';
    product_type:=p_intent->>'productType';
    category_values:=p_intent->'categoryIds';
    resource_values:=p_intent->'resourceIds';
    channel_values:=p_intent->'channelIds';
    variant_count:=pg_catalog.jsonb_array_length(p_intent->'variants');
    IF pg_catalog.cardinality(p_variant_ids)<>variant_count THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
      RETURN;
    END IF;

    FOR variant_value IN SELECT value FROM pg_catalog.jsonb_array_elements(p_intent->'variants') LOOP
      IF NOT saas.catalog_onboarding_json_exact(
        variant_value,
        ARRAY['title','priceCents','stockTracking','stockQuantity','attributes','continueSellingWhenOutOfStock','inventory'],
        ARRAY['sku','barcode','compareAtCents','costCents','unitPricing','shippingDesiMilli','hsCode']
      )
         OR pg_catalog.jsonb_typeof(variant_value->'title')<>'string'
         OR variant_value->>'title'<>pg_catalog.btrim(variant_value->>'title')
         OR pg_catalog.char_length(variant_value->>'title') NOT BETWEEN 1 AND 200
         OR variant_value->>'title'~'[[:cntrl:]]'
         OR (variant_value ? 'sku' AND (
           pg_catalog.jsonb_typeof(variant_value->'sku')<>'string'
           OR variant_value->>'sku'!~'^[A-Z0-9][A-Z0-9._-]{0,63}$'
         ))
         OR (variant_value ? 'barcode' AND (
           pg_catalog.jsonb_typeof(variant_value->'barcode')<>'string'
           OR variant_value->>'barcode'<>pg_catalog.btrim(variant_value->>'barcode')
           OR pg_catalog.char_length(variant_value->>'barcode') NOT BETWEEN 1 AND 128
           OR variant_value->>'barcode'~'[[:cntrl:]]'
         ))
         OR pg_catalog.jsonb_typeof(variant_value->'priceCents')<>'number'
         OR (variant_value->>'priceCents')::numeric<>pg_catalog.trunc((variant_value->>'priceCents')::numeric)
         OR (variant_value->>'priceCents')::numeric NOT BETWEEN 0 AND 9007199254740991
         OR (variant_value ? 'compareAtCents' AND (
           pg_catalog.jsonb_typeof(variant_value->'compareAtCents')<>'number'
           OR (variant_value->>'compareAtCents')::numeric<>pg_catalog.trunc((variant_value->>'compareAtCents')::numeric)
           OR (variant_value->>'compareAtCents')::numeric NOT BETWEEN (variant_value->>'priceCents')::numeric AND 9007199254740991
         ))
         OR (variant_value ? 'costCents' AND (
           pg_catalog.jsonb_typeof(variant_value->'costCents')<>'number'
           OR (variant_value->>'costCents')::numeric<>pg_catalog.trunc((variant_value->>'costCents')::numeric)
           OR (variant_value->>'costCents')::numeric NOT BETWEEN 0 AND 9007199254740991
         ))
         OR pg_catalog.jsonb_typeof(variant_value->'stockTracking')<>'boolean'
         OR pg_catalog.jsonb_typeof(variant_value->'stockQuantity')<>'number'
         OR (variant_value->>'stockQuantity')::numeric<>pg_catalog.trunc((variant_value->>'stockQuantity')::numeric)
         OR (variant_value->>'stockQuantity')::numeric NOT BETWEEN 0 AND 2147483647
         OR NOT saas.catalog_attributes_are_valid(variant_value->'attributes')
         OR pg_catalog.jsonb_typeof(variant_value->'continueSellingWhenOutOfStock')<>'boolean'
         OR pg_catalog.jsonb_typeof(variant_value->'inventory')<>'array'
         OR pg_catalog.jsonb_array_length(variant_value->'inventory')>50
         OR (product_type='digital' AND (variant_value ? 'shippingDesiMilli' OR variant_value ? 'hsCode'))
         OR (variant_value ? 'shippingDesiMilli' AND (
           pg_catalog.jsonb_typeof(variant_value->'shippingDesiMilli')<>'number'
           OR (variant_value->>'shippingDesiMilli')::numeric<>pg_catalog.trunc((variant_value->>'shippingDesiMilli')::numeric)
           OR (variant_value->>'shippingDesiMilli')::numeric NOT BETWEEN 0 AND 9007199254740991
         ))
         OR (variant_value ? 'hsCode' AND (
           pg_catalog.jsonb_typeof(variant_value->'hsCode')<>'string'
           OR variant_value->>'hsCode'!~'^[0-9]{4,12}$'
         )) THEN
        RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
        RETURN;
      END IF;

      IF variant_value ? 'unitPricing' AND (
        NOT saas.catalog_onboarding_json_exact(
          variant_value->'unitPricing',ARRAY['measuredQuantityMilli','measuredUnit','baseQuantityMilli','baseUnit']
        )
        OR pg_catalog.jsonb_typeof(variant_value->'unitPricing'->'measuredQuantityMilli')<>'number'
        OR (variant_value->'unitPricing'->>'measuredQuantityMilli')::numeric<>pg_catalog.trunc((variant_value->'unitPricing'->>'measuredQuantityMilli')::numeric)
        OR (variant_value->'unitPricing'->>'measuredQuantityMilli')::numeric NOT BETWEEN 1 AND 9007199254740991
        OR variant_value->'unitPricing'->>'measuredUnit' NOT IN('piece','g','kg','ml','l','cm','m','m2','m3')
        OR pg_catalog.jsonb_typeof(variant_value->'unitPricing'->'baseQuantityMilli')<>'number'
        OR (variant_value->'unitPricing'->>'baseQuantityMilli')::numeric<>pg_catalog.trunc((variant_value->'unitPricing'->>'baseQuantityMilli')::numeric)
        OR (variant_value->'unitPricing'->>'baseQuantityMilli')::numeric NOT BETWEEN 1 AND 9007199254740991
        OR variant_value->'unitPricing'->>'baseUnit' NOT IN('piece','g','kg','ml','l','cm','m','m2','m3')
      ) THEN
        RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
        RETURN;
      END IF;

      IF EXISTS(
        SELECT 1 FROM pg_catalog.jsonb_array_elements(variant_value->'inventory') AS allocation(value)
        WHERE NOT saas.catalog_onboarding_json_exact(allocation.value,ARRAY['locationId','quantity'])
           OR pg_catalog.jsonb_typeof(allocation.value->'locationId')<>'string'
           OR allocation.value->>'locationId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           OR pg_catalog.jsonb_typeof(allocation.value->'quantity')<>'number'
           OR (allocation.value->>'quantity')::numeric<>pg_catalog.trunc((allocation.value->>'quantity')::numeric)
           OR (allocation.value->>'quantity')::numeric NOT BETWEEN 0 AND 2147483647
      ) OR pg_catalog.jsonb_array_length(variant_value->'inventory')<>(
        SELECT pg_catalog.count(DISTINCT allocation.value->>'locationId')
        FROM pg_catalog.jsonb_array_elements(variant_value->'inventory') AS allocation(value)
      ) THEN
        RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
        RETURN;
      END IF;
      SELECT COALESCE(pg_catalog.sum((allocation.value->>'quantity')::numeric),0)
      INTO inventory_total
      FROM pg_catalog.jsonb_array_elements(variant_value->'inventory') AS allocation(value);
      IF pg_catalog.jsonb_array_length(variant_value->'inventory')>0
         AND inventory_total<>(variant_value->>'stockQuantity')::numeric THEN
        RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
        RETURN;
      END IF;
    END LOOP;
  ELSE
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(category_values) AS requested(value)
    WHERE NOT EXISTS(
      SELECT 1 FROM saas.catalog_categories AS category
      WHERE category.store_id=p_store_id AND category.id=(requested.value#>>'{}')::uuid AND category.status='active'
    )
  ) OR EXISTS(
    SELECT 1 FROM (
      SELECT 'brand'::text AS kind,resource_values->>'brand' AS id WHERE resource_values ? 'brand'
      UNION ALL SELECT 'collection',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'collections')
      UNION ALL SELECT 'tag',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'tags')
      UNION ALL SELECT 'attribute',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'attributes')
      UNION ALL SELECT 'extra',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'extras')
      UNION ALL SELECT 'definition',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'definitions')
    ) AS requested
    WHERE NOT EXISTS(
      SELECT 1 FROM saas.catalog_admin_resources AS resource
      WHERE resource.store_id=p_store_id AND resource.id=requested.id::uuid
        AND resource.resource_kind=requested.kind AND resource.status='active'
    )
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(channel_values) AS requested(value)
    WHERE NOT EXISTS(
      SELECT 1 FROM saas.store_domains AS domain
      WHERE domain.store_id=p_store_id AND domain.id=(requested.value#>>'{}')::uuid AND domain.status='active'
      UNION ALL
      SELECT 1 FROM saas.merchant_provider_profiles AS profile
      WHERE profile.store_id=p_store_id AND profile.id=(requested.value#>>'{}')::uuid
        AND profile.status='active' AND profile.capability='marketplace_sync'
    )
  ) OR (intent_kind='advanced' AND EXISTS(
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_intent->'variants') AS variant(value)
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(variant.value->'inventory') AS allocation(value)
    WHERE NOT EXISTS(
      SELECT 1 FROM saas.inventory_locations AS location
      WHERE location.store_id=p_store_id AND location.id=(allocation.value->>'locationId')::uuid AND location.status='active'
    )
  )) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  SELECT store.currency INTO store_currency
  FROM saas.stores AS store
  WHERE store.id=p_store_id AND store.status='active'
  FOR UPDATE;
  IF store_currency IS NULL THEN
    RETURN QUERY SELECT 'store_inactive',NULL::jsonb;
    RETURN;
  END IF;
  IF (SELECT pg_catalog.count(*) FROM saas.products AS product WHERE product.store_id=p_store_id AND product.status<>'archived')>=p_products_limit THEN
    RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb;
    RETURN;
  END IF;

  slug_base:=saas.catalog_onboarding_slug_base(product_title);
  allocated_slug:=slug_base;
  WHILE EXISTS(SELECT 1 FROM saas.products AS product WHERE product.store_id=p_store_id AND product.slug=allocated_slug) LOOP
    slug_suffix:=slug_suffix+1;
    allocated_slug:=pg_catalog.left(slug_base,100-pg_catalog.char_length('-'||slug_suffix::text))||'-'||slug_suffix::text;
  END LOOP;

  BEGIN
    INSERT INTO saas.products(
      id,store_id,slug,title,description,status,currency,version,created_at,updated_at
    ) VALUES(
      p_product_id,p_store_id,allocated_slug,product_title,product_description,'draft',store_currency,1,p_now,p_now
    );
    INSERT INTO saas.catalog_product_profiles(
      product_id,store_id,product_type,supplier_name,google_product_category_id,seo_title,seo_description,
      minimum_purchase_quantity,maximum_purchase_quantity,version,created_at,updated_at
    ) VALUES(
      p_product_id,p_store_id,product_type,profile_values->>'supplierName',profile_values->>'googleProductCategoryId',
      profile_values->>'seoTitle',profile_values->>'seoDescription',
      (profile_values->>'minimumPurchaseQuantity')::bigint,(profile_values->>'maximumPurchaseQuantity')::bigint,1,p_now,p_now
    );

    PERFORM pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id',p_operation_id::text,true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
    IF intent_kind='quick' THEN
      INSERT INTO saas.product_variants(
        id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at
      ) VALUES(
        p_variant_ids[1],p_product_id,p_store_id,'Standart',(p_intent->>'priceCents')::bigint,true,
        COALESCE((p_intent->>'stockQuantity')::bigint,0),'active','{}'::jsonb,1,p_now,p_now
      );
      INSERT INTO saas.catalog_variant_commerce_profiles(
        variant_id,product_id,store_id,continue_selling_when_out_of_stock,version,created_at,updated_at
      ) VALUES(p_variant_ids[1],p_product_id,p_store_id,false,1,p_now,p_now);
    ELSE
      variant_ordinal:=0;
      FOR variant_value IN SELECT value FROM pg_catalog.jsonb_array_elements(p_intent->'variants') LOOP
        variant_ordinal:=variant_ordinal+1;
        requested_variant_id:=p_variant_ids[variant_ordinal];
        INSERT INTO saas.product_variants(
          id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,cost_cents,
          stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at
        ) VALUES(
          requested_variant_id,p_product_id,p_store_id,variant_value->>'title',variant_value->>'sku',variant_value->>'barcode',
          (variant_value->>'priceCents')::bigint,(variant_value->>'compareAtCents')::bigint,(variant_value->>'costCents')::bigint,
          (variant_value->>'stockTracking')::boolean,
          CASE WHEN pg_catalog.jsonb_array_length(variant_value->'inventory')>0 THEN 0 ELSE (variant_value->>'stockQuantity')::bigint END,
          'active',variant_value->'attributes',1,p_now,p_now
        );
        INSERT INTO saas.catalog_variant_commerce_profiles(
          variant_id,product_id,store_id,continue_selling_when_out_of_stock,
          measured_quantity_milli,measured_unit,base_quantity_milli,base_unit,
          shipping_desi_milli,hs_code,version,created_at,updated_at
        ) VALUES(
          requested_variant_id,p_product_id,p_store_id,(variant_value->>'continueSellingWhenOutOfStock')::boolean,
          (variant_value->'unitPricing'->>'measuredQuantityMilli')::bigint,variant_value->'unitPricing'->>'measuredUnit',
          (variant_value->'unitPricing'->>'baseQuantityMilli')::bigint,variant_value->'unitPricing'->>'baseUnit',
          (variant_value->>'shippingDesiMilli')::bigint,variant_value->>'hsCode',1,p_now,p_now
        );
        IF pg_catalog.jsonb_array_length(variant_value->'inventory')>0 THEN
          DELETE FROM saas.inventory_balances
          WHERE store_id=p_store_id AND variant_id=requested_variant_id;
          INSERT INTO saas.inventory_balances(store_id,location_id,variant_id,quantity,version,updated_at)
          SELECT p_store_id,(allocation.value->>'locationId')::uuid,requested_variant_id,
            (allocation.value->>'quantity')::bigint,1,p_now
          FROM pg_catalog.jsonb_array_elements(variant_value->'inventory') AS allocation(value);
          INSERT INTO saas.inventory_movements(
            id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,
            source_kind,source_id,occurred_at,created_at
          )
          SELECT saas.inventory_deterministic_uuid(
              'inventory-onboarding-adjustment',p_operation_id::text||':'||requested_variant_id::text||':'||(allocation.value->>'locationId')
            ),p_store_id,(allocation.value->>'locationId')::uuid,requested_variant_id,'catalog_adjustment','in',
            (allocation.value->>'quantity')::bigint,'catalog_adjustment',p_operation_id,p_now,p_now
          FROM pg_catalog.jsonb_array_elements(variant_value->'inventory') AS allocation(value)
          WHERE (allocation.value->>'quantity')::bigint>0;
          PERFORM pg_catalog.set_config('saas.inventory.source_marker','inventory_managed',true);
          UPDATE saas.product_variants
          SET stock_quantity=(variant_value->>'stockQuantity')::bigint,version=version+1,updated_at=p_now
          WHERE store_id=p_store_id AND id=requested_variant_id;
          PERFORM pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
        END IF;
      END LOOP;
    END IF;
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);

    INSERT INTO saas.catalog_product_categories(store_id,product_id,category_id,position)
    SELECT p_store_id,p_product_id,(requested.value#>>'{}')::uuid,requested.ordinality-1
    FROM pg_catalog.jsonb_array_elements(category_values) WITH ORDINALITY AS requested(value,ordinality);

    FOR resource_record IN
      SELECT 'brand'::text AS kind,resource_values->>'brand' AS id WHERE resource_values ? 'brand'
      UNION ALL SELECT 'collection',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'collections')
      UNION ALL SELECT 'tag',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'tags')
      UNION ALL SELECT 'attribute',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'attributes')
      UNION ALL SELECT 'extra',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'extras')
      UNION ALL SELECT 'definition',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'definitions')
    LOOP
      INSERT INTO saas.catalog_admin_resource_products(store_id,resource_id,product_id,position)
      SELECT p_store_id,resource_record.id::uuid,p_product_id,
        COALESCE(pg_catalog.max(relation.position),-1)+1
      FROM saas.catalog_admin_resource_products AS relation
      WHERE relation.store_id=p_store_id AND relation.resource_id=resource_record.id::uuid;
    END LOOP;

    INSERT INTO saas.catalog_product_channels(
      store_id,product_id,channel_id,channel_kind,storefront_domain_id,marketplace_profile_id,position,created_at
    )
    SELECT p_store_id,p_product_id,(requested.value#>>'{}')::uuid,
      CASE WHEN domain.id IS NOT NULL THEN 'storefront' ELSE 'marketplace' END,
      domain.id,profile.id,requested.ordinality-1,p_now
    FROM pg_catalog.jsonb_array_elements(channel_values) WITH ORDINALITY AS requested(value,ordinality)
    LEFT JOIN saas.store_domains AS domain
      ON domain.store_id=p_store_id AND domain.id=(requested.value#>>'{}')::uuid AND domain.status='active'
    LEFT JOIN saas.merchant_provider_profiles AS profile
      ON profile.store_id=p_store_id AND profile.id=(requested.value#>>'{}')::uuid
      AND profile.status='active' AND profile.capability='marketplace_sync';

    result:=saas.catalog_onboarding_result_projection(p_store_id,p_product_id);
    INSERT INTO saas.catalog_onboarding_operations(
      operation_id,store_id,operation_kind,payload_fingerprint,result_product_id,result_payload,committed_at
    ) VALUES(
      p_operation_id,p_store_id,CASE WHEN intent_kind='quick' THEN 'quick_create' ELSE 'advanced_create' END,
      p_fingerprint,p_product_id,result,p_now
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb;
      RETURN;
    WHEN check_violation OR foreign_key_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
      RETURN;
  END;
  RETURN QUERY SELECT 'created',result;
END
$function$;

CREATE FUNCTION saas.catalog_get_product_editor(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_product_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  result jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NULL THEN
    authority_error:=saas.merchant_action_authority_error(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
      'catalog','catalog_admin.read'
    );
  END IF;
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;
  IF p_product_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM saas.products AS product
    WHERE product.store_id=p_store_id AND product.id=p_product_id AND product.status<>'archived'
  ) THEN
    RETURN QUERY SELECT 'product_not_found',NULL::jsonb;
    RETURN;
  END IF;
  result:=saas.catalog_product_editor_projection(p_store_id,p_product_id);
  RETURN QUERY SELECT 'found',result;
END
$function$;

CREATE FUNCTION saas.catalog_update_merchandising(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_profile_version bigint,p_payload jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  prior_operation saas.catalog_onboarding_operations%ROWTYPE;
  current_profile saas.catalog_product_profiles%ROWTYPE;
  profile_values jsonb;
  category_values jsonb;
  resource_values jsonb;
  channel_values jsonb;
  resource_record record;
  result jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NULL THEN
    authority_error:=saas.merchant_action_authority_error(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
      'catalog','catalog_admin.manage'
    );
  END IF;
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;

  SELECT operation.* INTO prior_operation
  FROM saas.catalog_onboarding_operations AS operation
  WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF prior_operation.store_id<>p_store_id OR prior_operation.payload_fingerprint<>p_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'operation_replayed',prior_operation.result_payload||'{"replayed":true}'::jsonb;
    END IF;
    RETURN;
  END IF;

  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_expected_profile_version IS NULL OR p_payload IS NULL
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR pg_catalog.pg_column_size(p_payload)>131072
     OR NOT saas.catalog_onboarding_json_exact(p_payload,ARRAY['profile','categoryIds','resourceIds','channelIds'])
     OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_payload->'categoryIds',8)
     OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_payload->'channelIds',32)
     OR NOT saas.catalog_onboarding_json_exact(
       p_payload->'resourceIds',ARRAY['collections','tags','attributes','extras','definitions'],ARRAY['brand']
     )
     OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_payload->'resourceIds'->'collections',50)
     OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_payload->'resourceIds'->'tags',50)
     OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_payload->'resourceIds'->'attributes',50)
     OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_payload->'resourceIds'->'extras',50)
     OR NOT saas.catalog_onboarding_uuid_json_array_valid(p_payload->'resourceIds'->'definitions',50)
     OR (p_payload->'resourceIds' ? 'brand' AND (
       pg_catalog.jsonb_typeof(p_payload->'resourceIds'->'brand')<>'string'
       OR p_payload->'resourceIds'->>'brand'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ))
     OR NOT saas.catalog_onboarding_json_exact(
       p_payload->'profile',ARRAY['minimumPurchaseQuantity'],
       ARRAY['supplierName','googleProductCategoryId','seoTitle','seoDescription','maximumPurchaseQuantity']
     ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  profile_values:=p_payload->'profile';
  category_values:=p_payload->'categoryIds';
  resource_values:=p_payload->'resourceIds';
  channel_values:=p_payload->'channelIds';
  IF pg_catalog.jsonb_typeof(profile_values->'minimumPurchaseQuantity')<>'number'
     OR (profile_values->>'minimumPurchaseQuantity')::numeric<>pg_catalog.trunc((profile_values->>'minimumPurchaseQuantity')::numeric)
     OR (profile_values->>'minimumPurchaseQuantity')::numeric NOT BETWEEN 1 AND 9007199254740991
     OR (profile_values ? 'maximumPurchaseQuantity' AND (
       pg_catalog.jsonb_typeof(profile_values->'maximumPurchaseQuantity')<>'number'
       OR (profile_values->>'maximumPurchaseQuantity')::numeric<>pg_catalog.trunc((profile_values->>'maximumPurchaseQuantity')::numeric)
       OR (profile_values->>'maximumPurchaseQuantity')::numeric NOT BETWEEN (profile_values->>'minimumPurchaseQuantity')::numeric AND 9007199254740991
     ))
     OR (profile_values ? 'supplierName' AND (
       pg_catalog.jsonb_typeof(profile_values->'supplierName')<>'string'
       OR profile_values->>'supplierName'<>pg_catalog.btrim(profile_values->>'supplierName')
       OR pg_catalog.char_length(profile_values->>'supplierName') NOT BETWEEN 1 AND 200
       OR profile_values->>'supplierName'~'[[:cntrl:]]'
     ))
     OR (profile_values ? 'googleProductCategoryId' AND (
       pg_catalog.jsonb_typeof(profile_values->'googleProductCategoryId')<>'string'
       OR profile_values->>'googleProductCategoryId'!~'^[0-9]{1,20}$'
     ))
     OR (profile_values ? 'seoTitle' AND (
       pg_catalog.jsonb_typeof(profile_values->'seoTitle')<>'string'
       OR profile_values->>'seoTitle'<>pg_catalog.btrim(profile_values->>'seoTitle')
       OR pg_catalog.char_length(profile_values->>'seoTitle') NOT BETWEEN 1 AND 200
       OR profile_values->>'seoTitle'~'[[:cntrl:]]'
     ))
     OR (profile_values ? 'seoDescription' AND (
       pg_catalog.jsonb_typeof(profile_values->'seoDescription')<>'string'
       OR profile_values->>'seoDescription'<>pg_catalog.btrim(profile_values->>'seoDescription')
       OR pg_catalog.char_length(profile_values->>'seoDescription') NOT BETWEEN 1 AND 500
       OR profile_values->>'seoDescription'~'[[:cntrl:]]'
     ))
     OR EXISTS(
       SELECT 1 FROM pg_catalog.jsonb_array_elements(category_values) AS requested(value)
       WHERE NOT EXISTS(
         SELECT 1 FROM saas.catalog_categories AS category
         WHERE category.store_id=p_store_id AND category.id=(requested.value#>>'{}')::uuid AND category.status='active'
       )
     )
     OR EXISTS(
       SELECT 1 FROM (
         SELECT 'brand'::text AS kind,resource_values->>'brand' AS id WHERE resource_values ? 'brand'
         UNION ALL SELECT 'collection',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'collections')
         UNION ALL SELECT 'tag',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'tags')
         UNION ALL SELECT 'attribute',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'attributes')
         UNION ALL SELECT 'extra',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'extras')
         UNION ALL SELECT 'definition',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'definitions')
       ) AS requested
       WHERE NOT EXISTS(
         SELECT 1 FROM saas.catalog_admin_resources AS resource
         WHERE resource.store_id=p_store_id AND resource.id=requested.id::uuid
           AND resource.resource_kind=requested.kind AND resource.status='active'
       )
     )
     OR EXISTS(
       SELECT 1 FROM pg_catalog.jsonb_array_elements(channel_values) AS requested(value)
       WHERE NOT EXISTS(
         SELECT 1 FROM saas.store_domains AS domain
         WHERE domain.store_id=p_store_id AND domain.id=(requested.value#>>'{}')::uuid AND domain.status='active'
         UNION ALL
         SELECT 1 FROM saas.merchant_provider_profiles AS profile
         WHERE profile.store_id=p_store_id AND profile.id=(requested.value#>>'{}')::uuid
           AND profile.status='active' AND profile.capability='marketplace_sync'
       )
     ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  SELECT profile.* INTO current_profile
  FROM saas.catalog_product_profiles AS profile
  JOIN saas.products AS product
    ON product.store_id=profile.store_id AND product.id=profile.product_id
  WHERE profile.store_id=p_store_id AND profile.product_id=p_product_id AND product.status<>'archived'
  FOR UPDATE OF profile;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'product_not_found',NULL::jsonb;
    RETURN;
  END IF;
  IF current_profile.version<>p_expected_profile_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb;
    RETURN;
  END IF;

  BEGIN
    UPDATE saas.catalog_product_profiles
    SET supplier_name=profile_values->>'supplierName',
      google_product_category_id=profile_values->>'googleProductCategoryId',
      seo_title=profile_values->>'seoTitle',seo_description=profile_values->>'seoDescription',
      minimum_purchase_quantity=(profile_values->>'minimumPurchaseQuantity')::bigint,
      maximum_purchase_quantity=(profile_values->>'maximumPurchaseQuantity')::bigint,
      version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND product_id=p_product_id;

    DELETE FROM saas.catalog_product_categories WHERE store_id=p_store_id AND product_id=p_product_id;
    INSERT INTO saas.catalog_product_categories(store_id,product_id,category_id,position)
    SELECT p_store_id,p_product_id,(requested.value#>>'{}')::uuid,requested.ordinality-1
    FROM pg_catalog.jsonb_array_elements(category_values) WITH ORDINALITY AS requested(value,ordinality);

    DELETE FROM saas.catalog_admin_resource_products WHERE store_id=p_store_id AND product_id=p_product_id;
    FOR resource_record IN
      SELECT 'brand'::text AS kind,resource_values->>'brand' AS id WHERE resource_values ? 'brand'
      UNION ALL SELECT 'collection',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'collections')
      UNION ALL SELECT 'tag',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'tags')
      UNION ALL SELECT 'attribute',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'attributes')
      UNION ALL SELECT 'extra',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'extras')
      UNION ALL SELECT 'definition',value#>>'{}' FROM pg_catalog.jsonb_array_elements(resource_values->'definitions')
    LOOP
      INSERT INTO saas.catalog_admin_resource_products(store_id,resource_id,product_id,position)
      SELECT p_store_id,resource_record.id::uuid,p_product_id,COALESCE(pg_catalog.max(relation.position),-1)+1
      FROM saas.catalog_admin_resource_products AS relation
      WHERE relation.store_id=p_store_id AND relation.resource_id=resource_record.id::uuid;
    END LOOP;

    DELETE FROM saas.catalog_product_channels WHERE store_id=p_store_id AND product_id=p_product_id;
    INSERT INTO saas.catalog_product_channels(
      store_id,product_id,channel_id,channel_kind,storefront_domain_id,marketplace_profile_id,position,created_at
    )
    SELECT p_store_id,p_product_id,(requested.value#>>'{}')::uuid,
      CASE WHEN domain.id IS NOT NULL THEN 'storefront' ELSE 'marketplace' END,
      domain.id,profile.id,requested.ordinality-1,p_now
    FROM pg_catalog.jsonb_array_elements(channel_values) WITH ORDINALITY AS requested(value,ordinality)
    LEFT JOIN saas.store_domains AS domain
      ON domain.store_id=p_store_id AND domain.id=(requested.value#>>'{}')::uuid AND domain.status='active'
    LEFT JOIN saas.merchant_provider_profiles AS profile
      ON profile.store_id=p_store_id AND profile.id=(requested.value#>>'{}')::uuid
      AND profile.status='active' AND profile.capability='marketplace_sync';

    result:=saas.catalog_onboarding_result_projection(p_store_id,p_product_id);
    INSERT INTO saas.catalog_onboarding_operations(
      operation_id,store_id,operation_kind,payload_fingerprint,result_product_id,result_payload,committed_at
    ) VALUES(p_operation_id,p_store_id,'update_merchandising',p_fingerprint,p_product_id,result,p_now);
  EXCEPTION
    WHEN unique_violation THEN
      RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb;
      RETURN;
    WHEN check_violation OR foreign_key_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
      RETURN;
  END;
  RETURN QUERY SELECT 'updated',result;
END
$function$;

CREATE FUNCTION saas.catalog_publish_after_media(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_product_version bigint,p_expected_media_count integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  prior_operation saas.catalog_onboarding_operations%ROWTYPE;
  product_record saas.products%ROWTYPE;
  active_media_count integer;
  pending_media_count integer;
  result jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NULL THEN
    authority_error:=saas.merchant_action_authority_error(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
      'catalog','catalog_admin.manage'
    );
  END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;

  SELECT operation.* INTO prior_operation
  FROM saas.catalog_onboarding_operations AS operation
  WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF prior_operation.store_id<>p_store_id OR prior_operation.payload_fingerprint<>p_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'operation_replayed',prior_operation.result_payload||'{"replayed":true}'::jsonb;
    END IF;
    RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_expected_product_version IS NULL OR p_expected_media_count IS NULL
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_expected_media_count NOT BETWEEN 0 AND 16 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  SELECT product.* INTO product_record
  FROM saas.products AS product
  WHERE product.store_id=p_store_id AND product.id=p_product_id
  FOR UPDATE;
  IF NOT FOUND OR product_record.status='archived' THEN
    RETURN QUERY SELECT 'product_not_found',NULL::jsonb;
    RETURN;
  END IF;
  IF product_record.version<>p_expected_product_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb;
    RETURN;
  END IF;
  IF product_record.status<>'draft' THEN
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;
    RETURN;
  END IF;
  SELECT pg_catalog.count(*) FILTER(WHERE media.status='active'),
    pg_catalog.count(*) FILTER(WHERE media.status='pending')
  INTO active_media_count,pending_media_count
  FROM saas.product_media AS media
  WHERE media.store_id=p_store_id AND media.product_id=p_product_id;
  IF active_media_count<>p_expected_media_count OR pending_media_count<>0 THEN
    RETURN QUERY SELECT 'media_incomplete',NULL::jsonb;
    RETURN;
  END IF;

  UPDATE saas.products SET status='active',version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_product_id;
  result:=saas.catalog_onboarding_result_projection(p_store_id,p_product_id);
  INSERT INTO saas.catalog_onboarding_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,result_product_id,result_payload,committed_at
  ) VALUES(p_operation_id,p_store_id,'publish_after_media',p_fingerprint,p_product_id,result,p_now);
  RETURN QUERY SELECT 'published',result;
END
$function$;

CREATE FUNCTION saas.catalog_category_projection(p_store_id uuid,p_category_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',category.id,
    'parentId',category.parent_id,
    'name',category.name,
    'slug',category.slug,
    'position',category.position,
    'depth',category.depth,
    'status',category.status,
    'version',category.version,
    'createdAt',saas.catalog_timestamp(category.created_at),
    'updatedAt',saas.catalog_timestamp(category.updated_at),
    'archivedAt',CASE WHEN category.archived_at IS NULL THEN NULL ELSE saas.catalog_timestamp(category.archived_at) END
  ))
  FROM saas.catalog_categories AS category
  WHERE category.store_id=p_store_id AND category.id=p_category_id
$function$;

CREATE FUNCTION saas.catalog_list_categories(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NULL THEN
    authority_error:=saas.merchant_action_authority_error(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
      'catalog','catalog_admin.read'
    );
  END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',COALESCE((
    SELECT pg_catalog.jsonb_agg(saas.catalog_category_projection(p_store_id,category.id)
      ORDER BY (category.status='archived'),category.depth,category.position,category.name,category.id)
    FROM saas.catalog_categories AS category WHERE category.store_id=p_store_id
  ),'[]'::jsonb);
END
$function$;

CREATE FUNCTION saas.catalog_create_category(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_category_id uuid,p_fields jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  prior_operation saas.catalog_onboarding_operations%ROWTYPE;
  requested_parent uuid;
  requested_parent_depth integer;
  slug_base text;
  allocated_slug text;
  slug_suffix integer:=1;
  result jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage'
  ); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_category_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR NOT saas.catalog_onboarding_json_exact(p_fields,ARRAY['name','position'],ARRAY['parentId'])
     OR pg_catalog.jsonb_typeof(p_fields->'name')<>'string'
     OR p_fields->>'name'<>pg_catalog.btrim(p_fields->>'name')
     OR pg_catalog.char_length(p_fields->>'name') NOT BETWEEN 1 AND 120
     OR p_fields->>'name'~'[[:cntrl:]]'
     OR pg_catalog.jsonb_typeof(p_fields->'position')<>'number'
     OR (p_fields->>'position')::numeric<>pg_catalog.trunc((p_fields->>'position')::numeric)
     OR (p_fields->>'position')::numeric NOT BETWEEN 0 AND 9999
     OR (p_fields ? 'parentId' AND (
       pg_catalog.jsonb_typeof(p_fields->'parentId')<>'string'
       OR p_fields->>'parentId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     )) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  SELECT operation.* INTO prior_operation FROM saas.catalog_onboarding_operations AS operation
  WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF prior_operation.store_id<>p_store_id OR prior_operation.payload_fingerprint<>p_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',prior_operation.result_payload||'{"replayed":true}'::jsonb; END IF;
    RETURN;
  END IF;

  requested_parent:=(p_fields->>'parentId')::uuid;
  IF requested_parent IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM saas.catalog_categories AS parent
    WHERE parent.store_id=p_store_id AND parent.id=requested_parent AND parent.status='active'
  ) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF requested_parent IS NOT NULL THEN
    SELECT parent.depth INTO requested_parent_depth FROM saas.catalog_categories AS parent
    WHERE parent.store_id=p_store_id AND parent.id=requested_parent AND parent.status='active';
    IF requested_parent_depth>=8 THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN; END IF;
  END IF;
  PERFORM 1 FROM saas.stores AS store WHERE store.id=p_store_id AND store.status='active' FOR UPDATE;
  slug_base:=saas.catalog_onboarding_slug_base(p_fields->>'name');
  allocated_slug:=slug_base;
  WHILE EXISTS(SELECT 1 FROM saas.catalog_categories AS category WHERE category.store_id=p_store_id AND category.slug=allocated_slug) LOOP
    slug_suffix:=slug_suffix+1;
    allocated_slug:=pg_catalog.left(slug_base,100-pg_catalog.char_length('-'||slug_suffix::text))||'-'||slug_suffix::text;
  END LOOP;
  BEGIN
    INSERT INTO saas.catalog_categories(id,store_id,parent_id,name,slug,position,status,version,created_at,updated_at)
    VALUES(p_category_id,p_store_id,requested_parent,p_fields->>'name',allocated_slug,(p_fields->>'position')::integer,'active',1,p_now,p_now);
    result:=pg_catalog.jsonb_build_object('category',saas.catalog_category_projection(p_store_id,p_category_id),'replayed',false);
    INSERT INTO saas.catalog_onboarding_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_category_id,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,'create_category',p_fingerprint,p_category_id,result,p_now);
  EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN;
    WHEN check_violation OR foreign_key_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'created',result;
END
$function$;

CREATE FUNCTION saas.catalog_update_category(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_category_id uuid,p_expected_version bigint,p_fields jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  prior_operation saas.catalog_onboarding_operations%ROWTYPE;
  current_category saas.catalog_categories%ROWTYPE;
  requested_parent uuid;
  requested_parent_depth integer;
  slug_base text;
  allocated_slug text;
  slug_suffix integer:=1;
  result jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage'
  ); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_category_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR NOT saas.catalog_onboarding_json_exact(p_fields,ARRAY['name','position'],ARRAY['parentId'])
     OR pg_catalog.jsonb_typeof(p_fields->'name')<>'string'
     OR p_fields->>'name'<>pg_catalog.btrim(p_fields->>'name')
     OR pg_catalog.char_length(p_fields->>'name') NOT BETWEEN 1 AND 120 OR p_fields->>'name'~'[[:cntrl:]]'
     OR pg_catalog.jsonb_typeof(p_fields->'position')<>'number'
     OR (p_fields->>'position')::numeric<>pg_catalog.trunc((p_fields->>'position')::numeric)
     OR (p_fields->>'position')::numeric NOT BETWEEN 0 AND 9999
     OR (p_fields ? 'parentId' AND (
       pg_catalog.jsonb_typeof(p_fields->'parentId')<>'string'
       OR p_fields->>'parentId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     )) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT operation.* INTO prior_operation FROM saas.catalog_onboarding_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF prior_operation.store_id<>p_store_id OR prior_operation.payload_fingerprint<>p_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',prior_operation.result_payload||'{"replayed":true}'::jsonb; END IF;
    RETURN;
  END IF;
  SELECT category.* INTO current_category FROM saas.catalog_categories AS category
  WHERE category.store_id=p_store_id AND category.id=p_category_id AND category.status='active' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'category_not_found',NULL::jsonb; RETURN; END IF;
  IF current_category.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  requested_parent:=(p_fields->>'parentId')::uuid;
  IF requested_parent=p_category_id OR (requested_parent IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM saas.catalog_categories AS parent
    WHERE parent.store_id=p_store_id AND parent.id=requested_parent AND parent.status='active'
  )) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF requested_parent IS NOT NULL THEN
    SELECT parent.depth INTO requested_parent_depth FROM saas.catalog_categories AS parent
    WHERE parent.store_id=p_store_id AND parent.id=requested_parent AND parent.status='active';
    IF requested_parent_depth>=8 THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN; END IF;
  END IF;
  IF requested_parent IS DISTINCT FROM current_category.parent_id AND EXISTS(
    SELECT 1 FROM saas.catalog_categories AS child
    WHERE child.store_id=p_store_id AND child.parent_id=p_category_id AND child.status='active'
  ) THEN RETURN QUERY SELECT 'category_in_use',NULL::jsonb; RETURN; END IF;
  IF requested_parent IS NOT NULL AND EXISTS(
    WITH RECURSIVE descendants(id) AS (
      SELECT child.id FROM saas.catalog_categories AS child
      WHERE child.store_id=p_store_id AND child.parent_id=p_category_id AND child.status='active'
      UNION ALL
      SELECT child.id FROM saas.catalog_categories AS child JOIN descendants ON child.parent_id=descendants.id
      WHERE child.store_id=p_store_id AND child.status='active'
    ) SELECT 1 FROM descendants WHERE id=requested_parent
  ) THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores AS store WHERE store.id=p_store_id AND store.status='active' FOR UPDATE;
  slug_base:=saas.catalog_onboarding_slug_base(p_fields->>'name'); allocated_slug:=slug_base;
  WHILE EXISTS(SELECT 1 FROM saas.catalog_categories AS category WHERE category.store_id=p_store_id AND category.slug=allocated_slug AND category.id<>p_category_id) LOOP
    slug_suffix:=slug_suffix+1;
    allocated_slug:=pg_catalog.left(slug_base,100-pg_catalog.char_length('-'||slug_suffix::text))||'-'||slug_suffix::text;
  END LOOP;
  BEGIN
    UPDATE saas.catalog_categories SET parent_id=requested_parent,name=p_fields->>'name',slug=allocated_slug,
      position=(p_fields->>'position')::integer,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND id=p_category_id;
    result:=pg_catalog.jsonb_build_object('category',saas.catalog_category_projection(p_store_id,p_category_id),'replayed',false);
    INSERT INTO saas.catalog_onboarding_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_category_id,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,'update_category',p_fingerprint,p_category_id,result,p_now);
  EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN;
    WHEN check_violation OR foreign_key_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'updated',result;
END
$function$;

CREATE FUNCTION saas.catalog_archive_category(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_category_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  prior_operation saas.catalog_onboarding_operations%ROWTYPE;
  current_category saas.catalog_categories%ROWTYPE;
  result jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage'
  ); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_category_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT operation.* INTO prior_operation FROM saas.catalog_onboarding_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF prior_operation.store_id<>p_store_id OR prior_operation.payload_fingerprint<>p_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',prior_operation.result_payload||'{"replayed":true}'::jsonb; END IF;
    RETURN;
  END IF;
  SELECT category.* INTO current_category FROM saas.catalog_categories AS category
  WHERE category.store_id=p_store_id AND category.id=p_category_id AND category.status='active' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'category_not_found',NULL::jsonb; RETURN; END IF;
  IF current_category.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.catalog_categories AS child WHERE child.store_id=p_store_id AND child.parent_id=p_category_id AND child.status='active')
     OR EXISTS(
       SELECT 1 FROM saas.catalog_product_categories AS assignment
       JOIN saas.products AS product ON product.store_id=assignment.store_id AND product.id=assignment.product_id
       WHERE assignment.store_id=p_store_id AND assignment.category_id=p_category_id AND product.status<>'archived'
     ) THEN RETURN QUERY SELECT 'category_in_use',NULL::jsonb; RETURN; END IF;
  UPDATE saas.catalog_categories SET status='archived',archived_at=p_now,version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_category_id;
  result:=pg_catalog.jsonb_build_object('category',saas.catalog_category_projection(p_store_id,p_category_id),'replayed',false);
  INSERT INTO saas.catalog_onboarding_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_category_id,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,'archive_category',p_fingerprint,p_category_id,result,p_now);
  RETURN QUERY SELECT 'archived',result;
END
$function$;

CREATE FUNCTION saas.catalog_recover_onboarding_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  prior_operation saas.catalog_onboarding_operations%ROWTYPE;
BEGIN
  authority_error:=saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NULL THEN
    authority_error:=saas.merchant_action_authority_error(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
      'catalog','catalog_admin.read'
    );
  END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;
  SELECT operation.* INTO prior_operation
  FROM saas.catalog_onboarding_operations AS operation
  WHERE operation.operation_id=p_operation_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;
  ELSIF prior_operation.store_id<>p_store_id OR prior_operation.payload_fingerprint<>p_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE
    RETURN QUERY SELECT 'operation_replayed',prior_operation.result_payload||'{"replayed":true}'::jsonb;
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_onboarding_json_exact(jsonb,text[],text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_onboarding_uuid_json_array_valid(jsonb,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_onboarding_slug_base(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_onboarding_resource_ids_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_onboarding_profile_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_onboarding_result_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_product_editor_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_category_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_get_onboarding_options(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_onboard_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_get_product_editor(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_update_merchandising(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_publish_after_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_list_categories(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_create_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_update_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_archive_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_recover_onboarding_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.catalog_get_onboarding_options(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_onboard_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_get_product_editor(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_update_merchandising(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_publish_after_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,integer) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_list_categories(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_create_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_update_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_archive_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_recover_onboarding_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text) TO celebix_saas_app;

COMMIT;
