-- Shared collection membership, durable ordering, media and paginated reads.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.catalog_admin_resources IN EXCLUSIVE MODE;
CREATE TABLE saas.catalog_collections_182_backup(identity text PRIMARY KEY,definition text NOT NULL,owner_id oid NOT NULL,acl aclitem[],settings text[],security_definer boolean NOT NULL);
ALTER TABLE saas.catalog_collections_182_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_collections_182_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.catalog_collections_182_backup FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;
INSERT INTO saas.catalog_collections_182_backup
SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proowner,p.proacl,p.proconfig,p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname IN (
 'catalog_admin_save_resource','catalog_admin_resource_projection','storefront_asset_create','storefront_asset_list','storefront_asset_archive',
 'catalog_onboarding_resource_ids_projection','catalog_get_product_choices','catalog_get_onboarding_choices','catalog_get_onboarding_options','catalog_onboard_product','catalog_update_merchandising','catalog_create_product','catalog_update_product',
 'catalog_list_products_v3','catalog_list_products_unpriced_v3','catalog_list_products_unpriced_v5',
 'promotion_evaluator_materialize_lines','promotion_catalog_reference_matches_variant_v1');

ALTER TABLE saas.storefront_assets DROP CONSTRAINT storefront_assets_kind_check;
ALTER TABLE saas.storefront_assets ADD CONSTRAINT storefront_assets_kind_check CHECK(asset_kind IN('logo','hero','social','favicon','category','collection'));

CREATE FUNCTION saas.catalog_collection_config_normalized(p_config jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN NOT p_config?'schemaVersion' AND pg_catalog.jsonb_typeof(p_config)='object'
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_config) k WHERE k<>'featured')
 AND (NOT p_config?'featured' OR pg_catalog.jsonb_typeof(p_config->'featured')='boolean')
 THEN pg_catalog.jsonb_build_object('schemaVersion',1,'mode','manual','published',false,'featured',COALESCE((p_config->>'featured')::boolean,false),'match','all','rules','[]'::jsonb,'sort','custom') ELSE p_config END
$f$;

CREATE FUNCTION saas.catalog_collection_config_valid(p_store_id uuid,p_config jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE rule jsonb; ref uuid;
BEGIN
 IF p_store_id IS NULL OR p_config IS NULL OR NOT saas.catalog_onboarding_json_exact(p_config,ARRAY['schemaVersion','mode','published','featured','match','rules','sort'],ARRAY['coverAssetId'])
 OR pg_catalog.jsonb_typeof(p_config->'mode')<>'string' OR pg_catalog.jsonb_typeof(p_config->'match')<>'string' OR pg_catalog.jsonb_typeof(p_config->'sort')<>'string'
 OR p_config->'schemaVersion'<>'1'::jsonb OR p_config->>'mode' NOT IN('manual','automatic')
 OR pg_catalog.jsonb_typeof(p_config->'published')<>'boolean' OR pg_catalog.jsonb_typeof(p_config->'featured')<>'boolean'
 OR p_config->>'match' NOT IN('all','any') OR p_config->>'sort' NOT IN('custom','newest','title','price-asc','price-desc')
 OR pg_catalog.jsonb_typeof(p_config->'rules')<>'array' OR pg_catalog.jsonb_array_length(p_config->'rules')>10
 OR (p_config->>'mode'='manual' AND pg_catalog.jsonb_array_length(p_config->'rules')<>0)
 OR (p_config->>'mode'='automatic' AND pg_catalog.jsonb_array_length(p_config->'rules')=0) THEN RETURN false;END IF;
 IF p_config?'coverAssetId' THEN
  IF pg_catalog.jsonb_typeof(p_config->'coverAssetId')<>'string' OR p_config->>'coverAssetId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN false;END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.storefront_assets WHERE store_id=p_store_id AND id=(p_config->>'coverAssetId')::uuid AND asset_kind='collection' AND status='active') THEN RETURN false;END IF;
 END IF;
 FOR rule IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'rules') LOOP
  IF NOT saas.catalog_onboarding_json_exact(rule,ARRAY['kind','resourceId'],ARRAY[]::text[]) OR rule->>'kind' NOT IN('category','brand','tag')
  OR pg_catalog.jsonb_typeof(rule->'resourceId')<>'string' OR rule->>'resourceId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN false;END IF;
  ref:=(rule->>'resourceId')::uuid;
  IF rule->>'kind'='category' THEN
   IF NOT EXISTS(SELECT 1 FROM saas.catalog_categories WHERE store_id=p_store_id AND id=ref AND status='active') THEN RETURN false;END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM saas.catalog_admin_resources WHERE store_id=p_store_id AND id=ref AND resource_kind=rule->>'kind' AND status='active') THEN RETURN false;END IF;
 END LOOP;
 RETURN (SELECT count(DISTINCT value)=pg_catalog.jsonb_array_length(p_config->'rules') FROM pg_catalog.jsonb_array_elements(p_config->'rules'));
EXCEPTION WHEN others THEN RETURN false;
END $f$;

CREATE FUNCTION saas.catalog_collection_rule_matches_product(p_store_id uuid,p_rule jsonb,p_product_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_rule->>'kind'='category' THEN EXISTS(
  WITH RECURSIVE descendants AS (
   SELECT id FROM saas.catalog_categories WHERE store_id=p_store_id AND id=(p_rule->>'resourceId')::uuid AND status='active'
   UNION SELECT c.id FROM saas.catalog_categories c JOIN descendants d ON c.parent_id=d.id WHERE c.store_id=p_store_id AND c.status='active')
  SELECT 1 FROM descendants d JOIN saas.catalog_product_categories pc ON pc.store_id=p_store_id AND pc.category_id=d.id AND pc.product_id=p_product_id
 ) ELSE EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products rp JOIN saas.catalog_admin_resources r ON r.store_id=rp.store_id AND r.id=rp.resource_id
  WHERE rp.store_id=p_store_id AND rp.product_id=p_product_id AND r.id=(p_rule->>'resourceId')::uuid AND r.resource_kind=p_rule->>'kind' AND r.status='active') END
$f$;
CREATE FUNCTION saas.catalog_collection_config_matches_product(p_store_id uuid,p_config jsonb,p_product_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.products WHERE store_id=p_store_id AND id=p_product_id AND status<>'archived')
 AND p_config->>'mode'='automatic' AND pg_catalog.jsonb_array_length(p_config->'rules')>0
 AND CASE WHEN p_config->>'match'='all' THEN NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'rules') rule WHERE NOT saas.catalog_collection_rule_matches_product(p_store_id,rule,p_product_id))
 ELSE EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'rules') rule WHERE saas.catalog_collection_rule_matches_product(p_store_id,rule,p_product_id)) END
$f$;
CREATE FUNCTION saas.catalog_collection_matches_product(p_store_id uuid,p_collection_id uuid,p_product_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.catalog_admin_resources collection JOIN saas.products product ON product.store_id=collection.store_id AND product.id=p_product_id AND product.status<>'archived'
 WHERE collection.store_id=p_store_id AND collection.id=p_collection_id AND collection.resource_kind='collection' AND collection.status='active'
 AND CASE WHEN collection.config->>'mode'='automatic' THEN saas.catalog_collection_config_matches_product(p_store_id,collection.config,p_product_id)
 ELSE EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products rp WHERE rp.store_id=p_store_id AND rp.resource_id=p_collection_id AND rp.product_id=p_product_id) END)
$f$;
-- Indexed candidates narrow whole-collection reads before applying the canonical membership predicate.
CREATE FUNCTION saas.catalog_collection_matching_product_ids(p_store_id uuid,p_config jsonb,p_collection_id uuid)
RETURNS TABLE(product_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 WITH RECURSIVE rules AS MATERIALIZED(SELECT value rule,ordinality n FROM pg_catalog.jsonb_array_elements(p_config->'rules') WITH ORDINALITY),
 descendants(n,id) AS(
  SELECT rules.n,c.id FROM rules JOIN saas.catalog_categories c ON c.store_id=p_store_id AND c.id=(rules.rule->>'resourceId')::uuid AND c.status='active' WHERE rules.rule->>'kind'='category'
  UNION SELECT d.n,c.id FROM descendants d JOIN saas.catalog_categories c ON c.store_id=p_store_id AND c.parent_id=d.id AND c.status='active'),
 candidates AS MATERIALIZED(
  SELECT pc.product_id FROM descendants d JOIN saas.catalog_product_categories pc ON pc.store_id=p_store_id AND pc.category_id=d.id
  UNION SELECT rp.product_id FROM rules JOIN saas.catalog_admin_resources r ON r.store_id=p_store_id AND r.id=(rules.rule->>'resourceId')::uuid AND r.resource_kind=rules.rule->>'kind' AND r.status='active' JOIN saas.catalog_admin_resource_products rp ON rp.store_id=r.store_id AND rp.resource_id=r.id WHERE rules.rule->>'kind' IN('brand','tag'))
 SELECT p.id FROM candidates x JOIN saas.products p ON p.store_id=p_store_id AND p.id=x.product_id AND p.status<>'archived'
 WHERE p_config->>'mode'='automatic' AND saas.catalog_collection_config_matches_product(p_store_id,p_config,p.id)
 UNION ALL SELECT rp.product_id FROM saas.catalog_admin_resource_products rp JOIN saas.products p ON p.store_id=rp.store_id AND p.id=rp.product_id AND p.status<>'archived' WHERE p_config->>'mode'='manual' AND rp.store_id=p_store_id AND rp.resource_id=p_collection_id
$f$;
CREATE FUNCTION saas.catalog_collection_projection(p_store_id uuid,p_id uuid,p_include_ids boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',r.id,'name',r.name,'slug',r.slug,'description',r.description,
 'config',saas.catalog_collection_config_normalized(r.config),'status',r.status,'version',r.version,'createdAt',saas.catalog_admin_timestamp(r.created_at),'updatedAt',saas.catalog_admin_timestamp(r.updated_at),
 'productCount',CASE WHEN r.config->>'mode'='automatic' THEN (SELECT count(*) FROM saas.catalog_collection_matching_product_ids(r.store_id,r.config,r.id)) ELSE (SELECT count(*) FROM saas.catalog_admin_resource_products rp WHERE rp.store_id=r.store_id AND rp.resource_id=r.id) END,
 'publicProductCount',(SELECT count(DISTINCT p.id) FROM saas.catalog_collection_matching_product_ids(r.store_id,saas.catalog_collection_config_normalized(r.config),r.id) matching JOIN saas.products p ON p.store_id=r.store_id AND p.id=matching.product_id AND p.status='active' JOIN saas.product_variants v ON v.store_id=p.store_id AND v.product_id=p.id AND v.status='active' CROSS JOIN LATERAL saas.resolve_effective_variant_price(r.store_id,v.id,'storefront',pg_catalog.statement_timestamp(),NULL::text) price WHERE r.status='active' AND price.outcome='found'),
 'productIds',CASE WHEN p_include_ids THEN (SELECT COALESCE(jsonb_agg(rp.product_id ORDER BY rp.position),'[]'::jsonb) FROM saas.catalog_admin_resource_products rp WHERE rp.store_id=r.store_id AND rp.resource_id=r.id) END,
 'cover',CASE WHEN asset.id IS NOT NULL THEN pg_catalog.jsonb_build_object('url',asset.public_url,'altText',asset.alt_text,'mediaType',asset.media_type,'width',asset.width,'height',asset.height) END))
 FROM saas.catalog_admin_resources r LEFT JOIN saas.storefront_assets asset ON asset.store_id=r.store_id AND asset.id=(r.config->>'coverAssetId')::uuid AND asset.asset_kind='collection' AND asset.status='active'
 WHERE r.store_id=p_store_id AND r.id=p_id AND r.resource_kind='collection'
$f$;

-- Patch exact accepted predecessor anchors; preserve original function identities/ACLs.
DO $patch$
DECLARE row record; changed text;anchor text;
BEGIN
 FOR row IN SELECT * FROM saas.catalog_collections_182_backup LOOP
 changed:=row.definition;
 IF row.identity LIKE 'saas.catalog_admin_save_resource(%' THEN
  anchor:='CASE WHEN p_kind=''brand'' THEN 10000 ELSE 100 END';
  IF position(anchor IN changed)=0 OR position('p_kind=''brand'' AND p_expected_version IS NOT NULL' IN changed)=0 THEN RAISE EXCEPTION 'COLLECTION_SAVE_PREDECESSOR_INVALID';END IF;
  changed:=replace(changed,anchor,'CASE WHEN p_kind=''collection'' AND p_config->>''mode''=''automatic'' THEN 100000 WHEN p_kind IN(''brand'',''collection'') THEN 10000 ELSE 100 END');
  changed:=replace(changed,'p_kind=''brand'' AND p_expected_version IS NOT NULL','p_kind IN(''brand'',''collection'') AND p_expected_version IS NOT NULL');
  changed:=replace(changed,'OR pg_catalog.jsonb_typeof(p_config)<>''object''','OR (p_kind=''collection'' AND NOT saas.catalog_collection_config_valid(p_store_id,saas.catalog_collection_config_normalized(p_config))) OR pg_catalog.jsonb_typeof(p_config)<>''object''');
  changed:=replace(changed,'  result jsonb;',E'  result jsonb;\n  slug_base text; slug_suffix integer;');
  anchor:='  IF\n    p_fingerprint';
  IF position(E'  IF\n    p_fingerprint' IN changed)=0 THEN RAISE EXCEPTION 'COLLECTION_SAVE_INPUT_ANCHOR_INVALID';END IF;
  changed:=replace(changed,E'  IF\n    p_fingerprint',$code$  IF p_kind='collection' AND p_expected_version IS NOT NULL AND p_slug='' THEN
    SELECT slug INTO p_slug FROM saas.catalog_admin_resources WHERE store_id=p_store_id AND id=p_resource_id AND resource_kind='collection';
    IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;END IF;
  END IF;
  IF p_kind='collection' AND p_expected_version IS NULL AND p_slug='' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('collection-slug:'||p_store_id::text,0));
    slug_base:=saas.catalog_onboarding_slug_base(p_name); p_slug:=slug_base; slug_suffix:=1;
    WHILE EXISTS(SELECT 1 FROM saas.catalog_admin_resources WHERE store_id=p_store_id AND resource_kind='collection' AND slug=p_slug) LOOP
      slug_suffix:=slug_suffix+1; p_slug:=pg_catalog.left(slug_base,110)||'-'||slug_suffix::text;
    END LOOP;
  END IF;
$code$||E'  IF\n    p_fingerprint');
  changed:=replace(changed,E'  SELECT *\n  INTO current_resource',$code$  IF p_kind='collection' THEN p_config:=saas.catalog_collection_config_normalized(p_config); END IF;
  IF p_kind='collection' AND p_config?'coverAssetId' THEN
    PERFORM 1 FROM saas.storefront_assets WHERE store_id=p_store_id AND id=(p_config->>'coverAssetId')::uuid AND asset_kind='collection' AND status='active' FOR SHARE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  END IF;
$code$||E'  SELECT *\n  INTO current_resource');
  changed:=replace(changed,$old$OR p_description~'[[:cntrl:]]'$old$,$new$OR (CASE WHEN p_kind='collection' THEN translate(p_description,E'\n\r','') ELSE p_description END)~'[[:cntrl:]]'$new$);
  anchor:='    UPDATE saas.catalog_admin_resources';
  IF position(anchor IN changed)=0 THEN RAISE EXCEPTION 'COLLECTION_SAVE_VERSION_ANCHOR_INVALID';END IF;
  changed:=replace(changed,anchor,$code$    IF p_kind='collection' AND (COALESCE(current_resource.config->>'mode','manual')<>COALESCE(p_config->>'mode','manual') OR current_resource.slug<>p_slug) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
    IF p_kind='collection' THEN p_config:=saas.catalog_collection_config_normalized(p_config); END IF;
$code$||anchor);
 ELSIF row.identity LIKE 'saas.storefront_asset_create(%' THEN
  IF position('p_kind IS DISTINCT FROM ''category''' IN changed)=0 THEN RAISE EXCEPTION 'COLLECTION_MEDIA_CREATE_PREDECESSOR_INVALID';END IF;
  changed:=replace(changed,'p_kind IS DISTINCT FROM ''category''','p_kind IS NULL OR p_kind NOT IN(''category'',''collection'')');
  changed:=replace(changed,''''||'/storefront/category/'||'''','''/storefront/''||p_kind||''/''');
  changed:=replace(changed,'p_asset_id,p_store_id,''category'',p_object_key','p_asset_id,p_store_id,p_kind,p_object_key');
 ELSIF row.identity LIKE 'saas.storefront_asset_list(%' THEN
  changed:=replace(changed,'p_kind IS DISTINCT FROM ''category''','p_kind IS NULL OR p_kind NOT IN(''category'',''collection'')');
  changed:=replace(changed,'asset.asset_kind=''category''','asset.asset_kind=p_kind');
 ELSIF row.identity LIKE 'saas.storefront_asset_archive(%' THEN
  anchor:='IF EXISTS(SELECT 1 FROM saas.catalog_categories AS category WHERE category.store_id=p_store_id AND category.image_asset_id=p_asset_id) THEN';
  IF position(anchor IN changed)=0 THEN RAISE EXCEPTION 'COLLECTION_MEDIA_ARCHIVE_PREDECESSOR_INVALID';END IF;
  changed:=replace(changed,anchor,'IF EXISTS(SELECT 1 FROM saas.catalog_categories AS category WHERE category.store_id=p_store_id AND category.image_asset_id=p_asset_id) OR EXISTS(SELECT 1 FROM saas.catalog_admin_resources r WHERE r.store_id=p_store_id AND r.resource_kind=''collection'' AND r.config->>''coverAssetId''=p_asset_id::text) THEN');
 ELSIF row.identity LIKE 'saas.catalog_admin_resource_projection(%' THEN
  -- Only the shared public assignment projection remains legacy; dedicated reads paginate.
  changed:=replace(changed,'r.resource_kind','r.resource_kind');
 ELSIF row.identity LIKE 'saas.catalog_onboarding_resource_ids_projection(%' THEN
  changed:=replace(changed,'resource.resource_kind=''collection'' AND resource.status=''active''','resource.resource_kind=''collection'' AND resource.status=''active'' AND COALESCE(resource.config->>''mode'',''manual'')=''manual''');
 END IF;
 IF changed<>row.definition THEN EXECUTE changed;END IF;
 END LOOP;
END $patch$;

-- All current paginated product-query versions share the same automatic membership.
DO $query_patch$
DECLARE row record; changed text; old text;
BEGIN
 old:=$old$        OR EXISTS (
          SELECT 1
          FROM saas.catalog_admin_resource_products AS assignment
          JOIN saas.catalog_admin_resources AS resource
            ON resource.store_id = assignment.store_id
           AND resource.id = assignment.resource_id
           AND resource.resource_kind = 'collection'
           AND resource.status = 'active'
          WHERE assignment.store_id = p_store_id
            AND assignment.product_id = product.id
            AND assignment.resource_id = p_collection_id
        )$old$;
 FOR row IN SELECT * FROM saas.catalog_collections_182_backup WHERE identity LIKE 'saas.catalog_list_products%' LOOP
  IF position(old IN row.definition)=0 THEN IF position('saas.catalog_list_products_unpriced' IN row.definition)>0 OR position('saas.catalog_list_products_v5' IN row.definition)>0 OR position('saas.catalog_list_products_v4' IN row.definition)>0 THEN CONTINUE;END IF; RAISE EXCEPTION 'COLLECTION_PRODUCT_QUERY_PREDECESSOR_INVALID:%',row.identity;END IF;
  changed:=replace(row.definition,old,'        OR saas.catalog_collection_matches_product(p_store_id,p_collection_id,product.id)');EXECUTE changed;
 END LOOP;
END $query_patch$;

-- Preserve the optimized promotion fact loader and enrich only its collection facts.
DO $promotion_patch$
DECLARE row record;changed text;old text;
BEGIN
 SELECT * INTO row FROM saas.catalog_collections_182_backup WHERE identity LIKE 'saas.promotion_evaluator_materialize_lines(%';
 old:=$old$COALESCE(pg_catalog.jsonb_agg(resource_product.resource_id::text ORDER BY resource_product.resource_id) FILTER (WHERE resource.resource_kind='collection'),'[]'::jsonb) collection_ids$old$;
 IF position(old IN row.definition)=0 THEN RAISE EXCEPTION 'COLLECTION_PROMOTION_MATERIALIZE_PREDECESSOR_INVALID';END IF;
 changed:=replace(row.definition,old,$new$'[]'::jsonb collection_ids$new$);
 -- Compute membership once for each distinct bounded catalog product, not each cart line.
 changed:=replace(changed,$old$  ), enriched AS (
    SELECT catalog_lines.line,$old$,$new$  ), collection_facts AS MATERIALIZED (
    SELECT product.product_id,COALESCE((SELECT pg_catalog.jsonb_agg(collection.id::text ORDER BY collection.id)
      FROM saas.catalog_admin_resources collection WHERE collection.store_id=p_store_id
      AND collection.resource_kind='collection' AND collection.status='active'
      AND saas.catalog_collection_matches_product(p_store_id,collection.id,product.product_id)),'[]'::jsonb) collection_ids
    FROM catalog_products product
  ), enriched AS (
    SELECT catalog_lines.line,$new$);
 changed:=replace(changed,$old$COALESCE(resource_facts.collection_ids,'[]'::jsonb) collection_ids$old$,$new$COALESCE(collection_facts.collection_ids,'[]'::jsonb) collection_ids$new$);
 changed:=replace(changed,$old$    LEFT JOIN resource_facts ON resource_facts.product_id=catalog_lines.product_id$old$,$new$    LEFT JOIN resource_facts ON resource_facts.product_id=catalog_lines.product_id
    LEFT JOIN collection_facts ON collection_facts.product_id=catalog_lines.product_id$new$);
 EXECUTE changed;
 SELECT * INTO row FROM saas.catalog_collections_182_backup WHERE identity LIKE 'saas.promotion_catalog_reference_matches_variant_v1(%';
 old:=$old$WHEN 'collection' THEN EXISTS(
      SELECT 1 FROM saas.catalog_admin_resource_products membership
      JOIN saas.catalog_admin_resources resource ON resource.store_id=membership.store_id AND resource.id=membership.resource_id
      WHERE membership.store_id=p_store_id AND membership.product_id=p_product_id
        AND resource.id=(p_reference->>'id')::uuid AND resource.resource_kind='collection' AND resource.status='active' AND resource.archived_at IS NULL
    )$old$;
 IF position(old IN row.definition)=0 THEN RAISE EXCEPTION 'COLLECTION_PROMOTION_REFERENCE_PREDECESSOR_INVALID';END IF;
 EXECUTE replace(row.definition,old,$new$WHEN 'collection' THEN saas.catalog_collection_matches_product(p_store_id,(p_reference->>'id')::uuid,p_product_id)$new$);
END $promotion_patch$;

-- Prevent individual product edits from changing automatic order pins into membership.
DO $onboarding_patch$
DECLARE row record;changed text;
BEGIN
 FOR row IN SELECT p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition,p.proowner,p.proacl,p.proconfig,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='saas' AND p.proname IN('catalog_get_onboarding_choices','catalog_get_product_choices','catalog_get_onboarding_options','catalog_onboard_product','catalog_update_merchandising','catalog_create_product','catalog_update_product','catalog_prepare_product','catalog_create_product_v2','catalog_update_product_v2') LOOP
  changed:=row.definition;
  changed:=replace(changed,'AND resource.resource_kind=requested.kind AND resource.status=''active''','AND resource.resource_kind=requested.kind AND resource.status=''active'' AND (resource.resource_kind<>''collection'' OR COALESCE(resource.config->>''mode'',''manual'')=''manual'')');
  changed:=replace(changed,'WHERE resource.store_id=p_store_id AND resource.status=''active''','WHERE resource.store_id=p_store_id AND resource.status=''active'' AND (resource.resource_kind<>''collection'' OR COALESCE(resource.config->>''mode'',''manual'')=''manual'')');
  changed:=replace(changed,'DELETE FROM saas.catalog_admin_resource_products WHERE store_id=p_store_id AND product_id=p_product_id;', 'DELETE FROM saas.catalog_admin_resource_products rp WHERE rp.store_id=p_store_id AND rp.product_id=p_product_id AND NOT EXISTS(SELECT 1 FROM saas.catalog_admin_resources r WHERE r.store_id=rp.store_id AND r.id=rp.resource_id AND r.resource_kind=''collection'' AND r.config->>''mode''=''automatic'');');
  IF changed<>row.definition THEN
   INSERT INTO saas.catalog_collections_182_backup VALUES(row.identity,row.definition,row.proowner,row.proacl,row.proconfig,row.prosecdef) ON CONFLICT DO NOTHING;
   EXECUTE changed;
  END IF;
 END LOOP;
END $onboarding_patch$;

-- Collection descriptions accept line breaks; all other control characters remain denied.
DO $description$
DECLARE c record;changed text;
BEGIN
 SELECT conname,pg_get_constraintdef(oid) definition INTO c FROM pg_constraint WHERE conrelid='saas.catalog_admin_resources'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%description%' AND pg_get_constraintdef(oid) LIKE '%cntrl%';
 IF c.conname IS NULL THEN RAISE EXCEPTION 'COLLECTION_DESCRIPTION_CONSTRAINT_MISSING';END IF;
 INSERT INTO saas.catalog_collections_182_backup VALUES('constraint:description',format('ALTER TABLE saas.catalog_admin_resources DROP CONSTRAINT %I; ALTER TABLE saas.catalog_admin_resources ADD CONSTRAINT %I %s',c.conname,c.conname,c.definition),(SELECT oid FROM pg_roles WHERE rolname='celebix_saas_owner'),NULL,NULL,false);
 changed:=replace(c.definition,'(description !~ ''[[:cntrl:]]''::text)','((CASE WHEN resource_kind=''collection'' THEN translate(description,E''\n\r'','''') ELSE description END) !~ ''[[:cntrl:]]''::text)');
 IF changed=c.definition THEN RAISE EXCEPTION 'COLLECTION_DESCRIPTION_CONSTRAINT_PREDECESSOR_INVALID';END IF;
 EXECUTE format('ALTER TABLE saas.catalog_admin_resources DROP CONSTRAINT %I',c.conname);
 EXECUTE format('ALTER TABLE saas.catalog_admin_resources ADD CONSTRAINT %I %s',c.conname,changed);
END $description$;

CREATE FUNCTION saas.catalog_admin_list_collections(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_query jsonb
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;page_number integer;page_size integer;search_value text;state_value text;sort_value text;payload jsonb;
BEGIN
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_query IS NULL OR p_query IS NULL OR NOT saas.catalog_onboarding_json_exact(p_query,ARRAY['page','pageSize','state','sort'],ARRAY['search'])
 OR pg_catalog.jsonb_typeof(p_query->'page')<>'number' OR pg_catalog.jsonb_typeof(p_query->'pageSize')<>'number'
 OR p_query->>'page'!~'^[0-9]+$' OR p_query->>'pageSize'!~'^[0-9]+$'
 OR (p_query->>'page')::numeric NOT BETWEEN 1 AND 100001 OR (p_query->>'pageSize')::numeric NOT BETWEEN 1 AND 50
 OR pg_catalog.jsonb_typeof(p_query->'state')<>'string' OR pg_catalog.jsonb_typeof(p_query->'sort')<>'string' OR p_query->>'state' NOT IN('all','published','draft','archived') OR p_query->>'sort' NOT IN('title','products','updated')
 OR (p_query?'search' AND (pg_catalog.jsonb_typeof(p_query->'search')<>'string' OR char_length(p_query->>'search')>100 OR p_query->>'search'~'[[:cntrl:]]')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 page_number:=(p_query->>'page')::integer;page_size:=(p_query->>'pageSize')::integer;search_value:=COALESCE(p_query->>'search','');state_value:=p_query->>'state';sort_value:=p_query->>'sort';
 WITH all_rows AS MATERIALIZED(SELECT r.* FROM saas.catalog_admin_resources r WHERE r.store_id=p_store_id AND r.resource_kind='collection'),
 filtered AS MATERIALIZED(SELECT r.id,r.name,r.updated_at,saas.catalog_collection_projection(p_store_id,r.id,false) item FROM all_rows r WHERE
  (search_value='' OR strpos(lower(r.name),lower(search_value))>0) AND (state_value='all' AND r.status='active' OR state_value='archived' AND r.status='archived' OR state_value='published' AND r.status='active' AND r.config->>'published'='true' OR state_value='draft' AND r.status='active' AND COALESCE(r.config->>'published','false')='false')),
 page AS(SELECT * FROM filtered ORDER BY CASE WHEN sort_value='title' THEN lower(name) END,CASE WHEN sort_value='products' THEN (item->>'productCount')::bigint END DESC,CASE WHEN sort_value='updated' THEN updated_at END DESC,id LIMIT page_size OFFSET (page_number-1)*page_size)
 SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(item ORDER BY CASE WHEN sort_value='title' THEN lower(name) END,CASE WHEN sort_value='products' THEN (item->>'productCount')::bigint END DESC,CASE WHEN sort_value='updated' THEN updated_at END DESC,id) FROM page),'[]'::jsonb),'page',page_number,'pageSize',page_size,'totalCount',(SELECT count(*) FROM filtered),'counts',(SELECT jsonb_build_object('all',count(*) FILTER(WHERE status='active'),'published',count(*) FILTER(WHERE status='active' AND config->>'published'='true'),'draft',count(*) FILTER(WHERE status='active' AND COALESCE(config->>'published','false')='false'),'archived',count(*) FILTER(WHERE status='archived')) FROM all_rows)) INTO payload;
 RETURN QUERY SELECT 'listed',payload;
END $f$;

CREATE FUNCTION saas.catalog_admin_get_collection(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_collection_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;payload jsonb;
BEGIN
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 payload:=saas.catalog_collection_projection(p_store_id,p_collection_id,true);
 IF payload IS NULL THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',payload;
END $f$;

CREATE FUNCTION saas.catalog_admin_collection_members(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_collection_id uuid,p_config jsonb,p_query jsonb
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;config jsonb;selected_ids uuid[];page_number integer;page_size integer;search_value text;mode_value text;payload jsonb;
BEGIN
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_collection_id IS NOT NULL THEN
  SELECT saas.catalog_collection_config_normalized(r.config) INTO config FROM saas.catalog_admin_resources r WHERE r.store_id=p_store_id AND r.id=p_collection_id AND r.resource_kind='collection';
  IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb;RETURN;END IF;
 END IF;
 IF p_config IS NOT NULL THEN config:=p_config;END IF;
 IF config IS NULL OR NOT saas.catalog_collection_config_valid(p_store_id,config) OR p_query IS NULL OR NOT saas.catalog_onboarding_json_exact(p_query,ARRAY['page','pageSize','mode'],ARRAY['search','categoryId','brandId','tagId','productIds'])
 OR pg_catalog.jsonb_typeof(p_query->'page')<>'number' OR pg_catalog.jsonb_typeof(p_query->'pageSize')<>'number'
 OR p_query->>'page'!~'^[0-9]+$' OR p_query->>'pageSize'!~'^[0-9]+$'
 OR (p_query->>'page')::numeric NOT BETWEEN 1 AND 100001 OR (p_query->>'pageSize')::numeric NOT BETWEEN 1 AND 50
 OR pg_catalog.jsonb_typeof(p_query->'mode')<>'string' OR p_query->>'mode' NOT IN('members','catalog') OR (p_query?'search' AND (pg_catalog.jsonb_typeof(p_query->'search')<>'string' OR char_length(p_query->>'search')>100 OR p_query->>'search'~'[[:cntrl:]]')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 FOR e IN SELECT unnest(ARRAY['categoryId','brandId','tagId']) LOOP
  IF p_query?e AND (pg_catalog.jsonb_typeof(p_query->e)<>'string' OR p_query->>e!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 END LOOP;
 IF p_query?'productIds' THEN
  IF NOT saas.catalog_onboarding_uuid_json_array_valid(p_query->'productIds',CASE WHEN config->>'mode'='automatic' THEN 100000 ELSE 10000 END) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  SELECT COALESCE(array_agg(value::uuid ORDER BY ord),'{}'::uuid[]) INTO selected_ids FROM jsonb_array_elements_text(p_query->'productIds') WITH ORDINALITY x(value,ord);
  IF EXISTS(SELECT 1 FROM unnest(selected_ids) pid WHERE NOT EXISTS(SELECT 1 FROM saas.products p WHERE p.store_id=p_store_id AND p.id=pid AND (p.status<>'archived' OR EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products rp WHERE rp.store_id=p_store_id AND rp.resource_id=p_collection_id AND rp.product_id=p.id)))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 ELSE SELECT COALESCE(array_agg(product_id ORDER BY position),'{}'::uuid[]) INTO selected_ids FROM saas.catalog_admin_resource_products WHERE store_id=p_store_id AND resource_id=p_collection_id;END IF;
 page_number:=(p_query->>'page')::integer;page_size:=(p_query->>'pageSize')::integer;search_value:=COALESCE(p_query->>'search','');mode_value:=p_query->>'mode';
 WITH selected AS MATERIALIZED(SELECT id,ordinality pin FROM unnest(selected_ids) WITH ORDINALITY x(id,ordinality)),
 matching AS MATERIALIZED(
  SELECT product_id FROM saas.catalog_collection_matching_product_ids(p_store_id,config,p_collection_id) WHERE config->>'mode'='automatic'
  UNION ALL SELECT id FROM unnest(selected_ids) id WHERE config->>'mode'='manual'),
 members AS MATERIALIZED(
  SELECT p.*,selected.pin,variant.price_cents,(membership.product_id IS NOT NULL) member
  FROM saas.products p LEFT JOIN selected ON selected.id=p.id LEFT JOIN matching membership ON membership.product_id=p.id LEFT JOIN LATERAL(SELECT v.sku,CASE WHEN effective.outcome='found' THEN effective.price_cents ELSE NULL::bigint END price_cents FROM saas.product_variants v CROSS JOIN LATERAL saas.resolve_effective_variant_price(p_store_id,v.id,'storefront',p_now,NULL::text) effective WHERE config->>'sort' IN('price-asc','price-desc') AND v.store_id=p.store_id AND v.product_id=p.id AND v.status='active' ORDER BY (effective.outcome='found') DESC,(NOT v.stock_tracking OR v.stock_quantity>0) DESC,effective.price_cents ASC NULLS LAST,v.created_at,v.id LIMIT 1) variant ON true
  WHERE p.store_id=p_store_id AND (mode_value='catalog' AND p.status<>'archived' OR membership.product_id IS NOT NULL)),
 eligible AS MATERIALIZED(SELECT * FROM members WHERE (mode_value='catalog' AND status<>'archived' OR mode_value='members' AND member)
  AND (search_value='' OR strpos(lower(title),lower(search_value))>0 OR EXISTS(SELECT 1 FROM saas.product_variants v WHERE v.store_id=p_store_id AND v.product_id=members.id AND v.status='active' AND strpos(lower(COALESCE(v.sku,'')),lower(search_value))>0))
  AND (NOT p_query?'categoryId' OR saas.catalog_collection_rule_matches_product(p_store_id,jsonb_build_object('kind','category','resourceId',p_query->>'categoryId'),id))
  AND (NOT p_query?'brandId' OR saas.catalog_collection_rule_matches_product(p_store_id,jsonb_build_object('kind','brand','resourceId',p_query->>'brandId'),id))
  AND (NOT p_query?'tagId' OR saas.catalog_collection_rule_matches_product(p_store_id,jsonb_build_object('kind','tag','resourceId',p_query->>'tagId'),id))),
 ordered AS MATERIALIZED(SELECT *,row_number() OVER(ORDER BY
  CASE WHEN config->>'sort'='custom' THEN pin END NULLS LAST,
  CASE WHEN config->>'sort'='newest' THEN created_at END DESC,
  CASE WHEN config->>'sort'='title' THEN lower(title) END,
  CASE WHEN config->>'sort'='price-asc' THEN price_cents END ASC NULLS LAST,
  CASE WHEN config->>'sort'='price-desc' THEN price_cents END DESC NULLS LAST,created_at,id) rank FROM eligible),
 page AS MATERIALIZED(SELECT * FROM ordered ORDER BY rank LIMIT page_size OFFSET (page_number-1)*page_size),
 rich_page AS(SELECT p.id,p.title,p.status,p.rank,variant.sku,variant.price_cents,media.image FROM page p LEFT JOIN LATERAL(SELECT v.sku,CASE WHEN effective.outcome='found' THEN effective.price_cents ELSE NULL::bigint END price_cents FROM saas.product_variants v CROSS JOIN LATERAL saas.resolve_effective_variant_price(p_store_id,v.id,'storefront',p_now,NULL::text) effective WHERE v.store_id=p.store_id AND v.product_id=p.id AND v.status='active' ORDER BY (effective.outcome='found') DESC,(NOT v.stock_tracking OR v.stock_quantity>0) DESC,effective.price_cents ASC NULLS LAST,v.created_at,v.id LIMIT 1) variant ON true
  LEFT JOIN LATERAL(SELECT jsonb_build_object('url',m.public_url,'altText',m.alt_text,'mediaType',m.media_type,'width',m.width,'height',m.height) image FROM saas.product_media m WHERE m.store_id=p.store_id AND m.product_id=p.id AND m.status='active' ORDER BY m.sort_order,m.id LIMIT 1) media ON true)
 SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',id,'title',title,'status',status,'sku',sku,'priceCents',price_cents,'image',image)) ORDER BY rank) FROM rich_page),'[]'::jsonb),'page',page_number,'pageSize',page_size,'totalCount',(SELECT count(*) FROM eligible),'orderedIds',COALESCE((SELECT jsonb_agg(id ORDER BY CASE WHEN config->>'sort'='custom' THEN pin END NULLS LAST,CASE WHEN config->>'sort'='newest' THEN created_at END DESC,CASE WHEN config->>'sort'='title' THEN lower(title) END,CASE WHEN config->>'sort'='price-asc' THEN price_cents END ASC NULLS LAST,CASE WHEN config->>'sort'='price-desc' THEN price_cents END DESC NULLS LAST,created_at,id) FROM members WHERE member),'[]'::jsonb)) INTO payload;
 IF jsonb_array_length(payload->'orderedIds')>100000 THEN RETURN QUERY SELECT 'capacity_exceeded',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'listed',payload;
END $f$;

CREATE FUNCTION saas.catalog_admin_restore_collection(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_resource_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;op saas.catalog_admin_operations%ROWTYPE;r saas.catalog_admin_resources%ROWTYPE;payload jsonb;
BEGIN
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.archive');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 SELECT * INTO op FROM saas.catalog_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id;
 IF FOUND THEN IF op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload;END IF;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO r FROM saas.catalog_admin_resources WHERE store_id=p_store_id AND id=p_resource_id AND resource_kind='collection' FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb;RETURN;END IF;
 IF r.status<>'archived' OR r.version<>p_expected_version THEN RETURN QUERY SELECT CASE WHEN r.status<>'archived' THEN 'invalid_transition' ELSE 'version_conflict' END,NULL::jsonb;RETURN;END IF;
 UPDATE saas.catalog_admin_resources SET status='active',archived_at=NULL,config=jsonb_set(saas.catalog_collection_config_normalized(config),'{published}','false'),version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_resource_id RETURNING saas.catalog_admin_mutation_projection(id,version,status,updated_at) INTO payload;
 -- Distinct audit kind while retaining the generic recovery and immutable operation log.
 INSERT INTO saas.catalog_admin_operations VALUES(p_operation_id,p_store_id,'restore_resource',p_fingerprint,payload,p_now);
 RETURN QUERY SELECT 'restored',payload;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
END $f$;

DO $position_bound$
DECLARE c record;
BEGIN
 SELECT conname,pg_get_constraintdef(oid) definition INTO c FROM pg_constraint WHERE conrelid='saas.catalog_admin_resource_products'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%position%';
 IF c.conname IS NULL OR position('9999' IN c.definition)=0 THEN RAISE EXCEPTION 'COLLECTION_POSITION_BOUND_PREDECESSOR_INVALID';END IF;
 INSERT INTO saas.catalog_collections_182_backup VALUES('constraint:positions',format('ALTER TABLE saas.catalog_admin_resource_products DROP CONSTRAINT %I; ALTER TABLE saas.catalog_admin_resource_products ADD CONSTRAINT %I %s',c.conname,c.conname,c.definition),(SELECT oid FROM pg_roles WHERE rolname='celebix_saas_owner'),NULL,NULL,false);
 EXECUTE format('ALTER TABLE saas.catalog_admin_resource_products DROP CONSTRAINT %I',c.conname);
 EXECUTE format('ALTER TABLE saas.catalog_admin_resource_products ADD CONSTRAINT %I CHECK(position BETWEEN 0 AND 99999)',c.conname);
END $position_bound$;

CREATE FUNCTION saas.guard_catalog_collection_position_bound()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF NEW.position>9999 AND NOT EXISTS(SELECT 1 FROM saas.catalog_admin_resources r WHERE r.store_id=NEW.store_id AND r.id=NEW.resource_id AND r.resource_kind='collection' AND r.config->>'mode'='automatic') THEN
  RAISE check_violation USING MESSAGE='CATALOG_RESOURCE_POSITION_LIMIT_EXCEEDED';
 END IF;
 RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION saas.guard_catalog_collection_position_bound() FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;
CREATE TRIGGER catalog_collection_position_bound BEFORE INSERT OR UPDATE ON saas.catalog_admin_resource_products FOR EACH ROW EXECUTE FUNCTION saas.guard_catalog_collection_position_bound();

DO $audit_kind$
DECLARE c record;
BEGIN
 SELECT conname,pg_get_constraintdef(oid) definition INTO c FROM pg_constraint WHERE conrelid='saas.catalog_admin_operations'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%operation_kind%';
 IF c.conname IS NULL THEN RAISE EXCEPTION 'COLLECTION_OPERATION_CONSTRAINT_MISSING';END IF;
 INSERT INTO saas.catalog_collections_182_backup VALUES('constraint:operations',format('ALTER TABLE saas.catalog_admin_operations DROP CONSTRAINT %I; ALTER TABLE saas.catalog_admin_operations ADD CONSTRAINT %I %s',c.conname,c.conname,c.definition),(SELECT oid FROM pg_roles WHERE rolname='celebix_saas_owner'),NULL,NULL,false);
 EXECUTE format('ALTER TABLE saas.catalog_admin_operations DROP CONSTRAINT %I',c.conname);
 EXECUTE format('ALTER TABLE saas.catalog_admin_operations ADD CONSTRAINT %I CHECK (operation_kind IN(''save_resource'',''archive_resource'',''restore_resource'',''moderate_review'',''import_products''))',c.conname);
END $audit_kind$;

CREATE FUNCTION saas.public_catalog_collection_query(
 p_hostname text,p_now timestamptz,p_slug text,p_query text,p_filter text,p_order text,p_limit integer,p_offset integer
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid;collection saas.catalog_admin_resources%ROWTYPE;collection_payload jsonb;items jsonb;total_count bigint;page_count bigint;sort_value text;
BEGIN
 IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true
 OR p_slug IS NULL OR p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(p_slug)>120
 OR p_query IS NULL OR p_query<>btrim(p_query) OR octet_length(p_query)>100 OR p_query~'[[:cntrl:]]'
 OR p_filter IS NULL OR p_filter NOT IN('all','available','discounted') OR p_order IS NULL OR p_order NOT IN('featured','title-asc','price-asc','price-desc')
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 48 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_store:=saas.store_policy_public_store(p_hostname,p_now);
 IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT * INTO collection FROM saas.catalog_admin_resources r WHERE r.store_id=selected_store AND r.resource_kind='collection' AND r.slug=p_slug AND r.status='active' AND r.config->>'published'='true';
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT jsonb_strip_nulls(jsonb_build_object('id',collection.id,'name',collection.name,'slug',collection.slug,'description',collection.description,'cover',CASE WHEN a.id IS NOT NULL THEN jsonb_build_object('url',a.public_url,'altText',a.alt_text,'mediaType',a.media_type,'width',a.width,'height',a.height) END)) INTO collection_payload
 FROM (SELECT 1) one LEFT JOIN saas.storefront_assets a ON a.store_id=selected_store AND a.id=(collection.config->>'coverAssetId')::uuid AND a.asset_kind='collection' AND a.status='active';
 sort_value:=CASE p_order WHEN 'featured' THEN COALESCE(collection.config->>'sort','custom') WHEN 'title-asc' THEN 'title' ELSE p_order END;
 WITH candidates AS MATERIALIZED(
  SELECT p.id,p.title,p.created_at,rp.position pin,saas.public_effective_product_projection(selected_store,p.id,p_now) payload
  FROM saas.catalog_collection_matching_product_ids(selected_store,collection.config,collection.id) matching JOIN saas.products p ON p.store_id=selected_store AND p.id=matching.product_id AND p.status='active' LEFT JOIN saas.catalog_admin_resource_products rp ON rp.store_id=p.store_id AND rp.resource_id=collection.id AND rp.product_id=p.id
  WHERE true
  AND (p_query='' OR strpos(lower(p.title),lower(p_query))>0)),
 eligible AS MATERIALIZED(SELECT *,(payload->>'priceCents')::bigint price FROM candidates WHERE payload IS NOT NULL AND (p_filter='all' OR p_filter='available' AND (payload->>'available')::boolean OR p_filter='discounted' AND payload?'compareAtCents' AND (payload->>'compareAtCents')::bigint>(payload->>'priceCents')::bigint)),
 ordered AS(SELECT *,row_number() OVER(ORDER BY CASE WHEN sort_value='custom' THEN pin END NULLS LAST,CASE WHEN sort_value='newest' THEN created_at END DESC,CASE WHEN sort_value='title' THEN lower(title) END,CASE WHEN sort_value='price-asc' THEN price END ASC NULLS LAST,CASE WHEN sort_value='price-desc' THEN price END DESC NULLS LAST,created_at,id) rank FROM eligible),
 page AS(SELECT * FROM ordered ORDER BY rank LIMIT p_limit OFFSET p_offset)
 SELECT COALESCE((SELECT jsonb_agg(payload ORDER BY rank) FROM page),'[]'::jsonb),(SELECT count(*) FROM eligible),(SELECT count(*) FROM page) INTO items,total_count,page_count;
 RETURN QUERY SELECT 'found',jsonb_build_object('collection',collection_payload,'items',items,'total',total_count,'nextOffset',CASE WHEN p_offset+page_count<total_count AND p_offset+page_count<=10000 THEN p_offset+page_count ELSE NULL::bigint END);
END $f$;

DO $authority$
DECLARE row record;
BEGIN
 FOR row IN SELECT * FROM saas.catalog_collections_182_backup WHERE identity NOT LIKE 'constraint:%' LOOP
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=row.identity::regprocedure AND (proowner<>row.owner_id OR proacl IS DISTINCT FROM row.acl OR proconfig IS DISTINCT FROM row.settings OR prosecdef IS DISTINCT FROM row.security_definer)) THEN RAISE EXCEPTION 'COLLECTION_PREDECESSOR_AUTHORITY_CHANGED:%',row.identity;END IF;
 END LOOP;
END $authority$;
REVOKE ALL ON FUNCTION
 saas.catalog_collection_config_normalized(jsonb),saas.catalog_collection_config_valid(uuid,jsonb),saas.catalog_collection_rule_matches_product(uuid,jsonb,uuid),saas.catalog_collection_config_matches_product(uuid,jsonb,uuid),saas.catalog_collection_matches_product(uuid,uuid,uuid),saas.catalog_collection_matching_product_ids(uuid,jsonb,uuid),saas.catalog_collection_projection(uuid,uuid,boolean),
 saas.catalog_admin_list_collections(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.catalog_admin_get_collection(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.catalog_admin_collection_members(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,jsonb),saas.catalog_admin_restore_collection(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),saas.public_catalog_collection_query(text,timestamptz,text,text,text,text,integer,integer)
 FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.catalog_admin_list_collections(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.catalog_admin_get_collection(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.catalog_admin_collection_members(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,jsonb),saas.catalog_admin_restore_collection(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.public_catalog_collection_query(text,timestamptz,text,text,text,text,integer,integer) TO celebix_saas_host_resolver;
COMMIT;
