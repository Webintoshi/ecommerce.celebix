-- İKAS-quality tenant-scoped catalog onboarding foundation.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.product_variants
  ADD CONSTRAINT product_variants_store_product_id_key UNIQUE(store_id,product_id,id);

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

COMMIT;
