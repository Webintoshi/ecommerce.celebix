-- Professional barcode and label studio. Additive, tenant-bound and code-rollback compatible.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.barcode_label_templates(
  id uuid NOT NULL,
  store_id uuid NOT NULL,
  name text NOT NULL,
  name_key text NOT NULL,
  config jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(id),
  UNIQUE(store_id,id),
  UNIQUE(store_id,name_key),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CHECK(name=btrim(name) AND char_length(name) BETWEEN 1 AND 120 AND name!~'[[:cntrl:]]'),
  CHECK(name_key=lower(btrim(name_key)) AND char_length(name_key) BETWEEN 1 AND 120),
  CHECK(jsonb_typeof(config)='object' AND pg_column_size(config)<=32768),
  CHECK(status IN('active','archived')),
  CHECK(version>0 AND updated_at>=created_at),
  CHECK((status='archived')=(archived_at IS NOT NULL)),
  CHECK(NOT(status='archived' AND is_default))
);
CREATE UNIQUE INDEX barcode_label_templates_store_default_key ON saas.barcode_label_templates(store_id) WHERE is_default AND status='active';

CREATE TABLE saas.barcode_print_jobs(
  id uuid NOT NULL,
  store_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  template_id uuid,
  template_name text NOT NULL,
  template_config jsonb NOT NULL,
  output_type text NOT NULL,
  printer_profile text NOT NULL,
  start_cell integer NOT NULL DEFAULT 0,
  variant_count integer NOT NULL,
  label_count integer NOT NULL,
  status text NOT NULL DEFAULT 'prepared',
  created_at timestamptz NOT NULL,
  PRIMARY KEY(id),
  UNIQUE(store_id,id),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  FOREIGN KEY(principal_id) REFERENCES saas.principals(id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,template_id) REFERENCES saas.barcode_label_templates(store_id,id) ON DELETE RESTRICT,
  CHECK(template_name=btrim(template_name) AND char_length(template_name) BETWEEN 1 AND 120 AND template_name!~'[[:cntrl:]]'),
  CHECK(jsonb_typeof(template_config)='object' AND pg_column_size(template_config)<=32768),
  CHECK(output_type IN('browser','pdf','zpl')),
  CHECK(printer_profile IN('a4','thermal','zebra-203','zebra-300')),
  CHECK(start_cell BETWEEN 0 AND 47),
  CHECK(variant_count BETWEEN 1 AND 500 AND label_count BETWEEN variant_count AND 5000),
  CHECK(status='prepared')
);

CREATE TABLE saas.barcode_print_job_items(
  store_id uuid NOT NULL,
  job_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity integer NOT NULL,
  snapshot jsonb NOT NULL,
  position integer NOT NULL,
  PRIMARY KEY(store_id,job_id,variant_id),
  UNIQUE(store_id,job_id,position),
  FOREIGN KEY(store_id,job_id) REFERENCES saas.barcode_print_jobs(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,variant_id) REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  CHECK(quantity BETWEEN 1 AND 10000),
  CHECK(position BETWEEN 0 AND 499),
  CHECK(jsonb_typeof(snapshot)='object' AND pg_column_size(snapshot)<=16384)
);

CREATE TABLE saas.barcode_label_operations(
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  operation_kind text NOT NULL,
  operation_fingerprint character(32) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  CHECK(operation_kind IN('save_template','archive_template','generate_internal','create_job')),
  CHECK(operation_fingerprint~'^[a-f0-9]{32}$'),
  CHECK(jsonb_typeof(result_payload) IN('object','array') AND pg_column_size(result_payload)<=1048576)
);

CREATE TABLE saas.barcode_label_sequences(
  store_id uuid PRIMARY KEY REFERENCES saas.stores(id) ON DELETE RESTRICT,
  last_value bigint NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK(last_value BETWEEN 0 AND 999999999999)
);
INSERT INTO saas.barcode_label_sequences(store_id,last_value,updated_at)
SELECT store_id,max(substring(barcode FROM 5)::bigint),max(updated_at)
FROM saas.product_variants
WHERE barcode~'^CXI-[0-9]{12}$'
GROUP BY store_id;

DO $f$ BEGIN
  IF EXISTS(
    SELECT 1 FROM saas.product_variants
    WHERE barcode LIKE 'CXI-%'
    GROUP BY store_id,barcode HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'barcode_label_studio_existing_internal_barcode_duplicate';
  END IF;
END $f$;

CREATE UNIQUE INDEX product_variants_store_internal_barcode_key
  ON saas.product_variants(store_id,barcode)
  WHERE barcode LIKE 'CXI-%';

DO $f$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['barcode_label_templates','barcode_print_jobs','barcode_print_job_items','barcode_label_operations','barcode_label_sequences'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE pg_catalog.format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE pg_catalog.format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver',table_name);
  END LOOP;
END $f$;

CREATE FUNCTION saas.barcode_label_timestamp(p_value timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
  SELECT to_char(p_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$f$;

CREATE FUNCTION saas.barcode_label_template_config_valid(p_config jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE width_mm numeric; height_mm numeric; barcode_height_mm numeric; rows_count integer; columns_count integer;
  margin_top numeric; margin_right numeric; margin_bottom numeric; margin_left numeric; gap_horizontal numeric; gap_vertical numeric;
  field jsonb; field_count integer; field_order integer; field_key text; seen_keys text[]:='{}'; seen_orders integer[]:='{}';
BEGIN
  IF jsonb_typeof(p_config)<>'object' OR pg_column_size(p_config)>32768
    OR NOT (p_config ?& ARRAY['sectorProfile','paperType','widthMm','heightMm','orientation','rows','columns','marginsMm','gapMm','barcodeFormat','barcodeSource','barcodeHeightMm','showHumanReadable','currencyDisplay','fields'])
    OR p_config-ARRAY['sectorProfile','paperType','widthMm','heightMm','orientation','rows','columns','marginsMm','gapMm','barcodeFormat','barcodeSource','barcodeHeightMm','showHumanReadable','currencyDisplay','fields']<>'{}'::jsonb
    OR p_config->>'sectorProfile' NOT IN('jewelry','apparel','retail','warehouse','custom')
    OR p_config->>'paperType' NOT IN('a4','thermal-roll','custom')
    OR p_config->>'orientation' NOT IN('portrait','landscape')
    OR p_config->>'barcodeFormat' NOT IN('code128','ean13')
    OR p_config->>'barcodeSource' NOT IN('barcode','sku')
    OR p_config->>'currencyDisplay' NOT IN('symbol','code','none')
    OR jsonb_typeof(p_config->'showHumanReadable')<>'boolean'
    OR jsonb_typeof(p_config->'widthMm')<>'number' OR jsonb_typeof(p_config->'heightMm')<>'number'
    OR jsonb_typeof(p_config->'rows')<>'number' OR jsonb_typeof(p_config->'columns')<>'number'
    OR jsonb_typeof(p_config->'barcodeHeightMm')<>'number'
    OR jsonb_typeof(p_config->'marginsMm')<>'object' OR jsonb_typeof(p_config->'gapMm')<>'object'
    OR jsonb_typeof(p_config->'fields')<>'array' THEN RETURN false; END IF;
  width_mm:=(p_config->>'widthMm')::numeric; height_mm:=(p_config->>'heightMm')::numeric;
  barcode_height_mm:=(p_config->>'barcodeHeightMm')::numeric; rows_count:=(p_config->>'rows')::numeric; columns_count:=(p_config->>'columns')::numeric;
  IF rows_count::numeric<>(p_config->>'rows')::numeric OR columns_count::numeric<>(p_config->>'columns')::numeric
    OR width_mm NOT BETWEEN 5 AND 300 OR height_mm NOT BETWEEN 5 AND 300 OR barcode_height_mm NOT BETWEEN 3 AND 100
    OR rows_count NOT BETWEEN 1 AND 100 OR columns_count NOT BETWEEN 1 AND 20
    OR (p_config->'marginsMm')-ARRAY['top','right','bottom','left']<>'{}'::jsonb OR NOT ((p_config->'marginsMm') ?& ARRAY['top','right','bottom','left'])
    OR (p_config->'gapMm')-ARRAY['horizontal','vertical']<>'{}'::jsonb OR NOT ((p_config->'gapMm') ?& ARRAY['horizontal','vertical'])
    OR EXISTS(SELECT 1 FROM jsonb_each(p_config->'marginsMm') WHERE jsonb_typeof(value)<>'number')
    OR EXISTS(SELECT 1 FROM jsonb_each(p_config->'gapMm') WHERE jsonb_typeof(value)<>'number') THEN RETURN false; END IF;
  margin_top:=(p_config->'marginsMm'->>'top')::numeric; margin_right:=(p_config->'marginsMm'->>'right')::numeric;
  margin_bottom:=(p_config->'marginsMm'->>'bottom')::numeric; margin_left:=(p_config->'marginsMm'->>'left')::numeric;
  gap_horizontal:=(p_config->'gapMm'->>'horizontal')::numeric; gap_vertical:=(p_config->'gapMm'->>'vertical')::numeric;
  IF margin_top NOT BETWEEN 0 AND 50 OR margin_right NOT BETWEEN 0 AND 50 OR margin_bottom NOT BETWEEN 0 AND 50 OR margin_left NOT BETWEEN 0 AND 50
    OR gap_horizontal NOT BETWEEN 0 AND 50 OR gap_vertical NOT BETWEEN 0 AND 50
    OR margin_left+margin_right>=width_mm OR margin_top+margin_bottom>=height_mm OR barcode_height_mm>height_mm-margin_top-margin_bottom
    OR (p_config->>'paperType'<>'a4' AND (p_config->>'orientation'<>'portrait' OR rows_count<>1 OR columns_count<>1))
    OR (p_config->>'paperType'='a4' AND (columns_count*(width_mm+gap_horizontal)>CASE WHEN p_config->>'orientation'='portrait' THEN 202 ELSE 289 END OR rows_count*(height_mm+gap_vertical)>CASE WHEN p_config->>'orientation'='portrait' THEN 289 ELSE 202 END)) THEN RETURN false; END IF;
  field_count:=jsonb_array_length(p_config->'fields');
  IF field_count NOT BETWEEN 1 AND 12 THEN RETURN false; END IF;
  FOR field IN SELECT value FROM jsonb_array_elements(p_config->'fields') LOOP
    IF jsonb_typeof(field)<>'object' OR NOT (field ?& ARRAY['key','visible','order','align','fontSizePt','maxLines','autoShrink'])
      OR field-ARRAY['key','visible','order','align','fontSizePt','maxLines','autoShrink']<>'{}'::jsonb
      OR field->>'key' NOT IN('storeName','productTitle','variantTitle','sku','barcodeSymbol','barcodeValue','price','compareAtPrice','brand','category','stock','attributes')
      OR jsonb_typeof(field->'visible')<>'boolean' OR field->>'align' NOT IN('left','center','right') OR jsonb_typeof(field->'autoShrink')<>'boolean'
      OR jsonb_typeof(field->'order')<>'number' OR jsonb_typeof(field->'fontSizePt')<>'number' OR jsonb_typeof(field->'maxLines')<>'number' THEN RETURN false; END IF;
    field_key:=field->>'key'; field_order:=(field->>'order')::numeric;
    IF field_order::numeric<>(field->>'order')::numeric OR field_order NOT BETWEEN 0 AND field_count-1
      OR (field->>'fontSizePt')::numeric NOT BETWEEN 5 AND 36 OR (field->>'maxLines')::numeric<>trunc((field->>'maxLines')::numeric) OR (field->>'maxLines')::numeric NOT BETWEEN 1 AND 4
      OR field_key=ANY(seen_keys) OR field_order=ANY(seen_orders) THEN RETURN false; END IF;
    seen_keys:=array_append(seen_keys,field_key); seen_orders:=array_append(seen_orders,field_order);
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $f$;

CREATE FUNCTION saas.barcode_label_variant_projection(p_store_id uuid,p_variant_id uuid) RETURNS jsonb
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'productId',product.id,'productVersion',product.version,'variantId',variant.id,'variantVersion',variant.version,
    'productTitle',product.title,'variantTitle',variant.title,'sku',variant.sku,'barcode',variant.barcode,
    'priceCents',variant.price_cents,'compareAtCents',variant.compare_at_cents,'currency',product.currency,
    'stock',variant.stock_quantity,'trackInventory',variant.stock_tracking,
    'category',(SELECT jsonb_build_object('id',category.id,'name',category.name)
      FROM saas.catalog_product_categories relation JOIN saas.catalog_categories category
        ON category.store_id=relation.store_id AND category.id=relation.category_id AND category.status='active'
      WHERE relation.store_id=p_store_id AND relation.product_id=product.id ORDER BY relation.position,category.id LIMIT 1),
    'brand',(SELECT jsonb_build_object('id',resource.id,'name',resource.name)
      FROM saas.catalog_admin_resource_products relation JOIN saas.catalog_admin_resources resource
        ON resource.store_id=relation.store_id AND resource.id=relation.resource_id AND resource.resource_kind='brand' AND resource.status='active'
      WHERE relation.store_id=p_store_id AND relation.product_id=product.id ORDER BY relation.position,resource.id LIMIT 1),
    'attributes',variant.attributes,'status',product.status,'updatedAt',saas.barcode_label_timestamp(GREATEST(product.updated_at,variant.updated_at))
  ))
  FROM saas.product_variants variant JOIN saas.products product
    ON product.store_id=variant.store_id AND product.id=variant.product_id
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id AND variant.status='active' AND product.status IN('active','draft')
$f$;

CREATE FUNCTION saas.barcode_label_template_projection(p_store_id uuid,p_template_id uuid) RETURNS jsonb
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT jsonb_build_object('id',id,'name',name,'config',config,'status',status,'isDefault',is_default,'version',version,
    'createdAt',saas.barcode_label_timestamp(created_at),'updatedAt',saas.barcode_label_timestamp(updated_at))
  FROM saas.barcode_label_templates WHERE store_id=p_store_id AND id=p_template_id
$f$;

CREATE FUNCTION saas.barcode_print_job_projection(p_store_id uuid,p_job_id uuid) RETURNS jsonb
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id',job.id,'principalId',job.principal_id,'storeName',(SELECT name FROM saas.stores WHERE id=job.store_id),'templateId',job.template_id,'templateName',job.template_name,
    'templateConfig',job.template_config,'outputType',job.output_type,'printerProfile',job.printer_profile,
    'startCell',job.start_cell,'variantCount',job.variant_count,'labelCount',job.label_count,'status',job.status,
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('variantId',item.variant_id,'quantity',item.quantity,'snapshot',item.snapshot) ORDER BY item.position)
      FROM saas.barcode_print_job_items item WHERE item.store_id=job.store_id AND item.job_id=job.id),'[]'::jsonb),
    'createdAt',saas.barcode_label_timestamp(job.created_at)))
  FROM saas.barcode_print_jobs job WHERE job.store_id=p_store_id AND job.id=p_job_id
$f$;

CREATE FUNCTION saas.barcode_label_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_query text,p_status text,p_stock_state text,p_category_id uuid,p_brand_id uuid,p_product_id uuid,p_has_barcode boolean,p_sort text,p_page_size integer,
  p_anchor_null_rank integer,p_anchor_sort_text text,p_anchor_sort_number integer,p_anchor_variant_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; payload jsonb; escaped_query text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_sort NOT IN('name-asc','name-desc','updated-desc','sku-asc','barcode-asc','stock-desc') OR p_page_size NOT IN(20,50,100)
    OR (p_status IS NOT NULL AND p_status NOT IN('active','draft')) OR (p_stock_state IS NOT NULL AND p_stock_state NOT IN('in_stock','out_of_stock','not_tracked'))
    OR (p_anchor_variant_id IS NULL)<>(p_anchor_null_rank IS NULL) OR (p_anchor_null_rank IS NOT NULL AND p_anchor_null_rank NOT IN(0,1))
    OR (p_query IS NOT NULL AND (p_query<>btrim(p_query) OR char_length(p_query)>200 OR p_query~'[[:cntrl:]]')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  escaped_query:=replace(replace(replace(lower(p_query),E'\\',E'\\\\'),E'%',E'\\%'),E'_',E'\\_');
  WITH category_projection AS (
    SELECT DISTINCT ON (relation.product_id) relation.product_id,category.id,category.name
    FROM saas.catalog_product_categories relation JOIN saas.catalog_categories category
      ON category.store_id=relation.store_id AND category.id=relation.category_id AND category.status='active'
    WHERE relation.store_id=p_store_id ORDER BY relation.product_id,relation.position,category.id
  ), brand_projection AS (
    SELECT DISTINCT ON (relation.product_id) relation.product_id,resource.id,resource.name
    FROM saas.catalog_admin_resource_products relation JOIN saas.catalog_admin_resources resource
      ON resource.store_id=relation.store_id AND resource.id=relation.resource_id AND resource.resource_kind='brand' AND resource.status='active'
    WHERE relation.store_id=p_store_id ORDER BY relation.product_id,relation.position,resource.id
  ), filtered AS (
    SELECT product.id product_id,product.version product_version,product.title product_title,product.currency,product.status,
      variant.id variant_id,variant.version variant_version,variant.title variant_title,variant.sku,variant.barcode,
      variant.price_cents,variant.compare_at_cents,variant.stock_quantity,variant.stock_tracking,variant.attributes,
      category.id category_id,category.name category_name,brand.id brand_id,brand.name brand_name,
      GREATEST(product.updated_at,variant.updated_at) updated_at
    FROM saas.products product JOIN saas.product_variants variant ON variant.store_id=product.store_id AND variant.product_id=product.id AND variant.status='active'
    LEFT JOIN category_projection category ON category.product_id=product.id
    LEFT JOIN brand_projection brand ON brand.product_id=product.id
    WHERE product.store_id=p_store_id AND product.status IN('active','draft')
      AND (p_product_id IS NULL OR product.id=p_product_id)
      AND (p_status IS NULL OR product.status=p_status)
      AND (p_query IS NULL OR lower(product.title) LIKE '%'||escaped_query||'%' ESCAPE E'\\' OR lower(variant.title) LIKE '%'||escaped_query||'%' ESCAPE E'\\' OR lower(COALESCE(variant.sku,'')) LIKE '%'||escaped_query||'%' ESCAPE E'\\' OR lower(COALESCE(variant.barcode,'')) LIKE '%'||escaped_query||'%' ESCAPE E'\\')
      AND (p_stock_state IS NULL OR (p_stock_state='in_stock' AND variant.stock_tracking AND variant.stock_quantity>0) OR (p_stock_state='out_of_stock' AND variant.stock_tracking AND variant.stock_quantity=0) OR (p_stock_state='not_tracked' AND NOT variant.stock_tracking))
      AND (p_has_barcode IS NULL OR (p_has_barcode AND variant.barcode IS NOT NULL) OR (NOT p_has_barcode AND variant.barcode IS NULL))
      AND (p_category_id IS NULL OR EXISTS(SELECT 1 FROM saas.catalog_product_categories category_filter WHERE category_filter.store_id=p_store_id AND category_filter.product_id=product.id AND category_filter.category_id=p_category_id))
      AND (p_brand_id IS NULL OR EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products brand_filter JOIN saas.catalog_admin_resources brand_resource ON brand_resource.store_id=brand_filter.store_id AND brand_resource.id=brand_filter.resource_id AND brand_resource.resource_kind='brand' AND brand_resource.status='active' WHERE brand_filter.store_id=p_store_id AND brand_filter.product_id=product.id AND brand_filter.resource_id=p_brand_id))
  ), keyed AS (
    SELECT filtered.*,
      CASE WHEN (p_sort='sku-asc' AND sku IS NULL) OR (p_sort='barcode-asc' AND barcode IS NULL) THEN 1 ELSE 0 END sort_null_rank,
      CASE
        WHEN p_sort IN('name-asc','name-desc') THEN lower(product_title)
        WHEN p_sort='updated-desc' THEN saas.barcode_label_timestamp(updated_at)
        WHEN p_sort='sku-asc' THEN COALESCE(sku,'')
        WHEN p_sort='barcode-asc' THEN COALESCE(barcode,'')
      END sort_text,
      CASE WHEN p_sort='stock-desc' THEN stock_quantity END sort_number
    FROM filtered
  ), selected AS (
    SELECT keyed.* FROM keyed
    WHERE p_anchor_variant_id IS NULL OR
      sort_null_rank>p_anchor_null_rank OR
      (sort_null_rank=p_anchor_null_rank AND p_sort IN('name-asc','sku-asc','barcode-asc') AND (sort_text>p_anchor_sort_text OR (sort_text=p_anchor_sort_text AND variant_id>p_anchor_variant_id))) OR
      (sort_null_rank=p_anchor_null_rank AND p_sort IN('name-desc','updated-desc') AND (sort_text<p_anchor_sort_text OR (sort_text=p_anchor_sort_text AND variant_id>p_anchor_variant_id))) OR
      (sort_null_rank=p_anchor_null_rank AND p_sort='stock-desc' AND (sort_number<p_anchor_sort_number OR (sort_number=p_anchor_sort_number AND variant_id>p_anchor_variant_id)))
    ORDER BY
      sort_null_rank ASC,
      CASE WHEN p_sort IN('name-asc','sku-asc','barcode-asc') THEN sort_text END ASC,
      CASE WHEN p_sort IN('name-desc','updated-desc') THEN sort_text END DESC,
      CASE WHEN p_sort='stock-desc' THEN sort_number END DESC,
      variant_id ASC
    LIMIT p_page_size + 1
  ), page AS (SELECT * FROM selected LIMIT p_page_size),
  last_row AS (SELECT * FROM page ORDER BY
      sort_null_rank DESC,
      CASE WHEN p_sort IN('name-asc','sku-asc','barcode-asc') THEN sort_text END DESC,
      CASE WHEN p_sort IN('name-desc','updated-desc') THEN sort_text END ASC,
      CASE WHEN p_sort='stock-desc' THEN sort_number END ASC,
      variant_id DESC LIMIT 1)
  SELECT jsonb_build_object(
    'items',COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'productId',page.product_id,'productVersion',page.product_version,'variantId',page.variant_id,'variantVersion',page.variant_version,
      'productTitle',page.product_title,'variantTitle',page.variant_title,'sku',page.sku,'barcode',page.barcode,
      'priceCents',page.price_cents,'compareAtCents',page.compare_at_cents,'currency',page.currency,
      'stock',page.stock_quantity,'trackInventory',page.stock_tracking,
      'category',CASE WHEN page.category_id IS NULL THEN NULL ELSE jsonb_build_object('id',page.category_id,'name',page.category_name) END,
      'brand',CASE WHEN page.brand_id IS NULL THEN NULL ELSE jsonb_build_object('id',page.brand_id,'name',page.brand_name) END,
      'attributes',page.attributes,'status',page.status,'updatedAt',saas.barcode_label_timestamp(page.updated_at)
    )) ORDER BY
      CASE WHEN p_sort IN('name-asc','sku-asc','barcode-asc') THEN page.sort_text END ASC,
      CASE WHEN p_sort IN('name-desc','updated-desc') THEN page.sort_text END DESC,
      CASE WHEN p_sort='stock-desc' THEN page.sort_number END DESC,
      page.variant_id ASC) FROM page),'[]'::jsonb),
    'catalogTotal',(SELECT count(*) FROM filtered),
    'storeName',(SELECT name FROM saas.stores WHERE id=p_store_id),
    'nextAnchor',CASE WHEN (SELECT count(*) FROM selected)>p_page_size THEN (SELECT jsonb_build_object('sortNullRank',sort_null_rank,'sortValue',CASE WHEN p_sort='stock-desc' THEN to_jsonb(sort_number) ELSE to_jsonb(sort_text) END,'variantId',variant_id) FROM last_row) ELSE NULL END
  ) INTO payload;
  payload:=jsonb_strip_nulls(payload);
  RETURN QUERY SELECT 'listed',payload;
END $f$;

CREATE FUNCTION saas.barcode_label_template_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',COALESCE(jsonb_agg(saas.barcode_label_template_projection(p_store_id,id) ORDER BY is_default DESC,updated_at DESC,id),'[]'::jsonb) FROM saas.barcode_label_templates WHERE store_id=p_store_id;
END $f$;

CREATE FUNCTION saas.barcode_label_template_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_template_id uuid,p_expected_version bigint,p_name text,p_config jsonb,p_make_default boolean
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; fingerprint text; existing saas.barcode_label_operations%ROWTYPE; current_version bigint; projection jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_template_id IS NULL OR p_name IS NULL OR p_name<>btrim(p_name) OR char_length(p_name) NOT BETWEEN 1 AND 120 OR p_name~'[[:cntrl:]]' OR p_make_default IS NULL OR (p_expected_version IS NOT NULL AND p_expected_version<1) OR saas.barcode_label_template_config_valid(p_config) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  fingerprint:=md5(p_template_id::text||COALESCE(p_expected_version::text,'new')||p_name||p_config::text||p_make_default::text);
  SELECT * INTO existing FROM saas.barcode_label_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF existing.store_id<>p_store_id OR existing.operation_kind<>'save_template' OR existing.operation_fingerprint<>fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',existing.result_payload; END IF; RETURN; END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  IF p_expected_version IS NULL THEN
    IF EXISTS(SELECT 1 FROM saas.barcode_label_templates WHERE store_id=p_store_id AND name_key=lower(p_name)) THEN RETURN QUERY SELECT 'name_conflict',NULL::jsonb; RETURN; END IF;
    IF p_make_default THEN UPDATE saas.barcode_label_templates SET is_default=false,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND is_default; END IF;
    INSERT INTO saas.barcode_label_templates(id,store_id,name,name_key,config,is_default,created_at,updated_at) VALUES(p_template_id,p_store_id,p_name,lower(p_name),p_config,p_make_default,p_now,p_now);
  ELSE
    SELECT version INTO current_version FROM saas.barcode_label_templates WHERE store_id=p_store_id AND id=p_template_id AND status='active' FOR UPDATE;
    IF current_version IS NULL THEN RETURN QUERY SELECT 'template_not_found',NULL::jsonb; RETURN; END IF;
    IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
    IF EXISTS(SELECT 1 FROM saas.barcode_label_templates WHERE store_id=p_store_id AND name_key=lower(p_name) AND id<>p_template_id) THEN RETURN QUERY SELECT 'name_conflict',NULL::jsonb; RETURN; END IF;
    IF p_make_default THEN UPDATE saas.barcode_label_templates SET is_default=false,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id<>p_template_id AND is_default; END IF;
    UPDATE saas.barcode_label_templates SET name=p_name,name_key=lower(p_name),config=p_config,is_default=p_make_default,version=version+1,updated_at=p_now WHERE id=p_template_id;
  END IF;
  projection:=saas.barcode_label_template_projection(p_store_id,p_template_id);
  INSERT INTO saas.barcode_label_operations VALUES(p_operation_id,p_store_id,'save_template',fingerprint,projection,p_now);
  RETURN QUERY SELECT 'saved',projection;
END $f$;

CREATE FUNCTION saas.barcode_label_template_archive(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_template_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; fingerprint text; existing saas.barcode_label_operations%ROWTYPE; current_version bigint; projection jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_template_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  fingerprint:=md5(p_template_id::text||p_expected_version::text);
  SELECT * INTO existing FROM saas.barcode_label_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF existing.store_id<>p_store_id OR existing.operation_kind<>'archive_template' OR existing.operation_fingerprint<>fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',existing.result_payload; END IF; RETURN; END IF;
  SELECT version INTO current_version FROM saas.barcode_label_templates WHERE store_id=p_store_id AND id=p_template_id AND status='active' FOR UPDATE;
  IF current_version IS NULL THEN RETURN QUERY SELECT 'template_not_found',NULL::jsonb; RETURN; END IF;
  IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  UPDATE saas.barcode_label_templates SET status='archived',is_default=false,archived_at=p_now,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND id=p_template_id;
  projection:=saas.barcode_label_template_projection(p_store_id,p_template_id);
  INSERT INTO saas.barcode_label_operations VALUES(p_operation_id,p_store_id,'archive_template',fingerprint,projection,p_now);
  RETURN QUERY SELECT 'archived',projection;
END $f$;

CREATE FUNCTION saas.barcode_label_generate_internal(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_targets jsonb
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; fingerprint text; existing saas.barcode_label_operations%ROWTYPE; target jsonb; selected saas.product_variants%ROWTYPE; succeeded jsonb:='[]'::jsonb; failed jsonb:='[]'::jsonb; internal_code text; sequence_value bigint; result jsonb; owned_count integer:=0;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR jsonb_typeof(p_targets) IS DISTINCT FROM 'array' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF jsonb_array_length(p_targets) NOT BETWEEN 1 AND 200 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_targets) item
      WHERE jsonb_typeof(item)<>'object' OR NOT(item?&ARRAY['variantId','expectedVersion']) OR item-(ARRAY['variantId','expectedVersion']::text[])<>'{}'::jsonb
        OR COALESCE(item->>'variantId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR COALESCE(item->>'expectedVersion','') !~ '^[1-9][0-9]{0,15}$')
    OR (SELECT count(*)<>count(DISTINCT item->>'variantId') FROM jsonb_array_elements(p_targets) item)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  fingerprint:=md5(p_targets::text);
  SELECT * INTO existing FROM saas.barcode_label_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF existing.store_id<>p_store_id OR existing.operation_kind<>'generate_internal' OR existing.operation_fingerprint<>fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',jsonb_set(existing.result_payload,'{replayed}','true'::jsonb); END IF; RETURN; END IF;
  PERFORM variant.id FROM saas.product_variants variant
    JOIN jsonb_array_elements(p_targets) target_row ON variant.id=(target_row->>'variantId')::uuid
    WHERE variant.store_id=p_store_id AND variant.status='active' ORDER BY variant.id FOR UPDATE;
  GET DIAGNOSTICS owned_count=ROW_COUNT;
  IF owned_count<>jsonb_array_length(p_targets) THEN RETURN QUERY SELECT 'variant_not_found',NULL::jsonb; RETURN; END IF;
  FOR target IN SELECT value FROM jsonb_array_elements(p_targets) LOOP
    SELECT * INTO selected FROM saas.product_variants WHERE store_id=p_store_id AND id=(target->>'variantId')::uuid AND status='active' FOR UPDATE;
    IF selected.barcode IS NOT NULL THEN failed:=failed||jsonb_build_array(jsonb_build_object('variantId',selected.id,'code','existing_barcode'));
    ELSIF selected.version<>(target->>'expectedVersion')::bigint THEN failed:=failed||jsonb_build_array(jsonb_build_object('variantId',selected.id,'code','version_conflict'));
    ELSE
      LOOP
        INSERT INTO saas.barcode_label_sequences(store_id,last_value,updated_at)
          VALUES(p_store_id,1,p_now)
          ON CONFLICT(store_id) DO UPDATE SET last_value=saas.barcode_label_sequences.last_value+1,updated_at=EXCLUDED.updated_at
          RETURNING last_value INTO sequence_value;
        IF sequence_value>999999999999 THEN RAISE EXCEPTION 'barcode_label_internal_sequence_exhausted'; END IF;
        internal_code:='CXI-'||lpad(sequence_value::text,12,'0');
        EXIT WHEN NOT EXISTS(SELECT 1 FROM saas.product_variants WHERE store_id=p_store_id AND barcode=internal_code);
      END LOOP;
      UPDATE saas.product_variants SET barcode=internal_code,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=selected.id AND barcode IS NULL;
      succeeded:=succeeded||jsonb_build_array(jsonb_build_object('variantId',selected.id,'barcode',internal_code,'version',selected.version+1));
    END IF;
  END LOOP;
  result:=jsonb_build_object('succeeded',succeeded,'failed',failed,'replayed',false);
  INSERT INTO saas.barcode_label_operations VALUES(p_operation_id,p_store_id,'generate_internal',fingerprint,result,p_now);
  RETURN QUERY SELECT 'generated',result;
END $f$;

CREATE FUNCTION saas.barcode_label_code128_modules(p_value text) RETURNS integer
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE position integer:=1; run_length integer; paired integer; codewords integer:=0;
BEGIN
  WHILE position<=char_length(p_value) LOOP
    run_length:=COALESCE(char_length(substring(substring(p_value FROM position) FROM '^[0-9]+')),0);
    IF run_length>=4 THEN
      paired:=run_length-(run_length%2);
      IF run_length%2=1 THEN codewords:=codewords+1; position:=position+1; END IF;
      codewords:=codewords+1+(paired/2); position:=position+paired;
      IF position<=char_length(p_value) THEN codewords:=codewords+1; END IF;
    ELSE
      codewords:=codewords+1; position:=position+1;
    END IF;
  END LOOP;
  RETURN 55+codewords*11;
END $f$;

CREATE FUNCTION saas.barcode_label_ean13_valid(p_value text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE position integer; total integer:=0;
BEGIN
  IF p_value!~'^[0-9]{13}$' THEN RETURN false; END IF;
  FOR position IN 1..12 LOOP
    total:=total+substring(p_value FROM position FOR 1)::integer*CASE WHEN position%2=1 THEN 1 ELSE 3 END;
  END LOOP;
  RETURN (10-(total%10))%10=substring(p_value FROM 13 FOR 1)::integer;
END $f$;

CREATE FUNCTION saas.barcode_print_job_create(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_job_id uuid,p_template_id uuid,p_template_version bigint,p_template_name text,p_template_config jsonb,p_output_type text,p_printer_profile text,p_start_cell integer,p_targets jsonb
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; fingerprint text; existing saas.barcode_label_operations%ROWTYPE; target jsonb; snapshot jsonb; selected saas.product_variants%ROWTYPE; validated jsonb:='[]'::jsonb; item_count integer; label_count integer:=0; position integer:=0; projection jsonb; canonical_template_name text; canonical_template_version bigint; barcode_value text; barcode_modules integer; available_width_mm numeric; minimum_module_mm numeric;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_job_id IS NULL OR p_template_name IS NULL OR p_output_type IS NULL OR p_output_type NOT IN('browser','pdf','zpl') OR p_printer_profile IS NULL OR p_printer_profile NOT IN('a4','thermal','zebra-203','zebra-300') OR p_start_cell IS NULL OR p_start_cell NOT BETWEEN 0 AND 47 OR saas.barcode_label_template_config_valid(p_template_config) IS DISTINCT FROM true OR jsonb_typeof(p_targets) IS DISTINCT FROM 'array' OR (p_template_id IS NULL)<>(p_template_version IS NULL) OR (p_template_version IS NOT NULL AND p_template_version<1) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF jsonb_array_length(p_targets) NOT BETWEEN 1 AND 500 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF (p_output_type='zpl' AND (p_printer_profile NOT IN('zebra-203','zebra-300') OR p_template_config->>'paperType'='a4' OR p_start_cell<>0))
    OR (p_output_type IN('browser','pdf') AND (p_printer_profile<>CASE WHEN p_template_config->>'paperType'='a4' THEN 'a4' ELSE 'thermal' END OR CASE WHEN p_template_config->>'paperType'='a4' THEN p_start_cell>=(p_template_config->>'rows')::integer*(p_template_config->>'columns')::integer ELSE p_start_cell<>0 END))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF COALESCE(p_template_config->>'barcodeFormat','') NOT IN('code128','ean13') OR COALESCE(p_template_config->>'barcodeSource','') NOT IN('barcode','sku')
    OR COALESCE(p_template_config->>'widthMm','')!~'^[0-9]+([.][0-9]+)?$' OR jsonb_typeof(p_template_config->'marginsMm')<>'object'
    OR COALESCE(p_template_config->'marginsMm'->>'left','')!~'^[0-9]+([.][0-9]+)?$' OR COALESCE(p_template_config->'marginsMm'->>'right','')!~'^[0-9]+([.][0-9]+)?$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  available_width_mm:=(p_template_config->>'widthMm')::numeric-(p_template_config->'marginsMm'->>'left')::numeric-(p_template_config->'marginsMm'->>'right')::numeric;
  fingerprint:=md5(p_job_id::text||COALESCE(p_template_id::text,'system')||COALESCE(p_template_version::text,'system')||p_template_name||p_template_config::text||p_output_type||p_printer_profile||p_start_cell::text||p_targets::text);
  SELECT * INTO existing FROM saas.barcode_label_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id<>p_store_id OR existing.operation_kind<>'create_job' OR existing.operation_fingerprint<>fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',saas.barcode_print_job_projection(p_store_id,(existing.result_payload->>'jobId')::uuid); END IF;
    RETURN;
  END IF;
  IF p_template_id IS NULL THEN
    canonical_template_name:=p_template_name;
    IF canonical_template_name IS NULL OR canonical_template_name<>btrim(canonical_template_name) OR char_length(canonical_template_name) NOT BETWEEN 1 AND 120 OR canonical_template_name~'[[:cntrl:]]' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  ELSE
    SELECT name,version INTO canonical_template_name,canonical_template_version FROM saas.barcode_label_templates WHERE store_id=p_store_id AND id=p_template_id AND status='active' FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'template_not_found',NULL::jsonb; RETURN; END IF;
    IF canonical_template_version<>p_template_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  END IF;
  item_count:=jsonb_array_length(p_targets);
  FOR target IN SELECT value FROM jsonb_array_elements(p_targets) LOOP
    IF jsonb_typeof(target)<>'object' OR NOT(target?&ARRAY['variantId','expectedVersion','quantity'])
       OR COALESCE(target->>'variantId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR COALESCE(target->>'expectedVersion','') !~ '^[1-9][0-9]{0,15}$' OR COALESCE(target->>'quantity','') !~ '^[1-9][0-9]{0,4}$'
       OR (target->>'quantity')::integer NOT BETWEEN 1 AND 10000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    SELECT * INTO selected FROM saas.product_variants WHERE store_id=p_store_id AND id=(target->>'variantId')::uuid AND status='active' FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'variant_not_found',NULL::jsonb; RETURN; END IF;
    IF selected.version<>(target->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
    barcode_value:=CASE WHEN p_template_config->>'barcodeSource'='sku' THEN selected.sku ELSE selected.barcode END;
    IF p_template_config->>'barcodeFormat'='ean13' THEN
      IF barcode_value IS NULL OR NOT saas.barcode_label_ean13_valid(barcode_value) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
      barcode_modules:=117;
    ELSE
      IF barcode_value IS NULL OR barcode_value!~'^[A-Za-z0-9 ._/-]{1,80}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
      barcode_modules:=saas.barcode_label_code128_modules(barcode_value);
    END IF;
    minimum_module_mm:=CASE
      WHEN p_printer_profile='zebra-203' THEN (CASE WHEN p_template_config->>'barcodeFormat'='ean13' THEN 3 ELSE 2 END)*25.4/203
      WHEN p_printer_profile='zebra-300' THEN (CASE WHEN p_template_config->>'barcodeFormat'='ean13' THEN 4 ELSE 3 END)*25.4/300
      WHEN p_template_config->>'barcodeFormat'='ean13' THEN 0.264 ELSE 0.19 END;
    IF barcode_modules*minimum_module_mm>available_width_mm THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    snapshot:=saas.barcode_label_variant_projection(p_store_id,selected.id);
    label_count:=label_count+(target->>'quantity')::integer;
    IF label_count>5000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    validated:=validated||jsonb_build_array(jsonb_build_object('variantId',selected.id,'quantity',(target->>'quantity')::integer,'snapshot',snapshot));
  END LOOP;
  IF (SELECT count(*)<>count(DISTINCT value->>'variantId') FROM jsonb_array_elements(validated)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.barcode_print_jobs(id,store_id,principal_id,template_id,template_name,template_config,output_type,printer_profile,start_cell,variant_count,label_count,created_at)
    VALUES(p_job_id,p_store_id,p_principal_id,p_template_id,canonical_template_name,p_template_config,p_output_type,p_printer_profile,p_start_cell,item_count,label_count,p_now);
  FOR target IN SELECT value FROM jsonb_array_elements(validated) LOOP
    INSERT INTO saas.barcode_print_job_items VALUES(p_store_id,p_job_id,(target->>'variantId')::uuid,(target->>'quantity')::integer,target->'snapshot',position);
    position:=position+1;
  END LOOP;
  projection:=saas.barcode_print_job_projection(p_store_id,p_job_id);
  INSERT INTO saas.barcode_label_operations VALUES(p_operation_id,p_store_id,'create_job',fingerprint,jsonb_build_object('jobId',p_job_id),p_now);
  RETURN QUERY SELECT 'created',projection;
END $f$;

CREATE FUNCTION saas.barcode_print_job_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',id,'templateId',template_id,'templateName',template_name,'outputType',output_type,'printerProfile',printer_profile,
    'startCell',start_cell,'variantCount',variant_count,'labelCount',label_count,'status',status,'createdAt',saas.barcode_label_timestamp(created_at)
  )) ORDER BY created_at DESC,id DESC),'[]'::jsonb)
  FROM (SELECT id,template_id,template_name,output_type,printer_profile,start_cell,variant_count,label_count,status,created_at FROM saas.barcode_print_jobs WHERE store_id=p_store_id ORDER BY created_at DESC,id DESC LIMIT 100) jobs;
END $f$;

CREATE FUNCTION saas.barcode_print_job_get(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_job_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; projection jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  projection:=saas.barcode_print_job_projection(p_store_id,p_job_id);
  IF projection IS NULL THEN RETURN QUERY SELECT 'job_not_found',NULL::jsonb; ELSE RETURN QUERY SELECT 'found',projection; END IF;
END $f$;

REVOKE ALL ON FUNCTION saas.barcode_label_timestamp(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_template_config_valid(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_variant_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_template_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_print_job_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_code128_modules(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_ean13_valid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,uuid,uuid,uuid,boolean,text,integer,integer,text,integer,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_template_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_template_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint,text,jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_template_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_generate_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_print_job_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid,bigint,text,jsonb,text,text,integer,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_print_job_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_print_job_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.barcode_label_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,uuid,uuid,uuid,boolean,text,integer,integer,text,integer,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.barcode_label_template_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.barcode_label_template_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint,text,jsonb,boolean) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.barcode_label_template_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.barcode_label_generate_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.barcode_print_job_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid,bigint,text,jsonb,text,text,integer,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.barcode_print_job_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.barcode_print_job_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;

COMMIT;
