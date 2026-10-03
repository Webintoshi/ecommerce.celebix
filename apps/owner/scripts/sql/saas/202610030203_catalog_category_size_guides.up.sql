-- Merchant-authored category guides reuse Extras and the public sizeGuide shape.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $precondition$
BEGIN
 IF to_regclass('saas.catalog_size_guides_203_backup') IS NOT NULL
  OR to_regclass('saas.catalog_categories') IS NULL
  OR to_regclass('saas.catalog_product_categories') IS NULL
  OR to_regprocedure('saas.public_starter_product_merchandising(uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_PREREQUISITE_INVALID'; END IF;
END $precondition$;

CREATE TABLE saas.catalog_size_guides_203_backup(
 identity text PRIMARY KEY,definition text NOT NULL,owner_id oid,acl aclitem[],settings text[],security_definer boolean
);
ALTER TABLE saas.catalog_size_guides_203_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_size_guides_203_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.catalog_size_guides_203_backup FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability;
INSERT INTO saas.catalog_size_guides_203_backup
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proowner,p.proacl,p.proconfig,p.prosecdef
 FROM pg_proc p WHERE p.oid IN(
  'saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])'::regprocedure,
  'saas.public_starter_product_merchandising(uuid,uuid)'::regprocedure
 );

INSERT INTO saas.catalog_size_guides_203_backup
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proowner,p.proacl,p.proconfig,p.prosecdef
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname IN(
  'catalog_get_onboarding_options','catalog_get_onboarding_choices','catalog_get_product_choices','catalog_onboard_product','catalog_update_merchandising'
 );

-- JavaScript's public contract measures UTF-16 units; supplementary characters
-- count twice here as well so SQL cannot publish a body its reader rejects.
CREATE FUNCTION saas.catalog_size_guide_text_length(p_value text)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $f$
 SELECT char_length(p_value)+char_length(regexp_replace(p_value,U&'[^\+010000-\+10FFFF]','','g'))
$f$;
CREATE FUNCTION saas.catalog_size_guide_config_valid(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE heading text;body text;category jsonb;
 trim_chars CONSTANT text:=U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF p_config IS NULL OR NOT saas.catalog_onboarding_json_exact(p_config,ARRAY['schemaVersion','type','heading','body','categoryIds','includeDescendants','enabled'],ARRAY[]::text[])
  OR p_config->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR p_config->>'type' IS DISTINCT FROM 'size_guide'
  OR jsonb_typeof(p_config->'heading') IS DISTINCT FROM 'string' OR jsonb_typeof(p_config->'body') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_config->'includeDescendants') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_config->'enabled') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(p_config->'categoryIds') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 heading:=p_config->>'heading';body:=p_config->>'body';
 IF heading<>btrim(heading,trim_chars) OR saas.catalog_size_guide_text_length(heading) NOT BETWEEN 1 AND 120 OR heading~'[[:cntrl:]]'
  OR saas.catalog_size_guide_text_length(body) NOT BETWEEN 1 AND 10000 OR btrim(body,trim_chars)='' OR translate(body,E'\t\r\n','')~'[[:cntrl:]]'
  OR jsonb_array_length(p_config->'categoryIds') NOT BETWEEN 1 AND 64 THEN RETURN false; END IF;
 FOR category IN SELECT value FROM jsonb_array_elements(p_config->'categoryIds') LOOP
  IF jsonb_typeof(category) IS DISTINCT FROM 'string' OR category#>>'{}'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN false; END IF;
 END LOOP;
 RETURN (SELECT count(DISTINCT value)=jsonb_array_length(p_config->'categoryIds') FROM jsonb_array_elements_text(p_config->'categoryIds'));
END $f$;
REVOKE ALL ON FUNCTION saas.catalog_size_guide_text_length(text),saas.catalog_size_guide_config_valid(jsonb) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability;

-- Only typed, structurally valid extra guides receive the larger body envelope.
DO $constraint$
DECLARE row record;matches integer;
BEGIN
 SELECT count(*) INTO matches FROM pg_constraint WHERE conrelid='saas.catalog_admin_resources'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%pg_column_size(config)%';
 IF matches<>1 THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_CONFIG_CONSTRAINT_DRIFT'; END IF;
 SELECT conname,pg_get_constraintdef(oid) definition INTO STRICT row FROM pg_constraint WHERE conrelid='saas.catalog_admin_resources'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%pg_column_size(config)%';
 INSERT INTO saas.catalog_size_guides_203_backup(identity,definition) VALUES('constraint:'||row.conname,format('ALTER TABLE saas.catalog_admin_resources ADD CONSTRAINT %I %s',row.conname,row.definition));
 EXECUTE format('ALTER TABLE saas.catalog_admin_resources DROP CONSTRAINT %I',row.conname);
 EXECUTE format('ALTER TABLE saas.catalog_admin_resources ADD CONSTRAINT %I CHECK(jsonb_typeof(config)=''object'' AND CASE WHEN config->>''type''=''size_guide'' THEN resource_kind=''extra'' AND saas.catalog_size_guide_config_valid(config) AND pg_column_size(config)<=65536 ELSE pg_column_size(config)<=8192 END)',row.conname);
END $constraint$;

-- Patch the actual predecessor, retaining collection/attribute behavior and ACLs.
DO $save_patch$
DECLARE row record;changed text;anchor text;
BEGIN
 SELECT * INTO STRICT row FROM saas.catalog_size_guides_203_backup WHERE identity LIKE 'saas.catalog_admin_save_resource(%';changed:=row.definition;
 anchor:=E'  SELECT *\n  INTO op';
 IF (length(changed)-length(replace(changed,anchor,'')))<>length(anchor) THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_SAVE_REPLAY_DRIFT'; END IF;
 changed:=replace(changed,anchor,$code$  IF p_kind='extra' THEN
    -- Match the existing operation -> store lock order used by catalog writers.
    PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog_admin.operation:'||p_operation_id::text,0));
    PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  END IF;
$code$||anchor);
 anchor:='OR pg_catalog.pg_column_size(p_config)>8192';
 IF (length(changed)-length(replace(changed,anchor,'')))<>length(anchor) THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_SAVE_CONFIG_DRIFT'; END IF;
 changed:=replace(changed,anchor,'OR (CASE WHEN p_config->>''type''=''size_guide'' THEN p_kind<>''extra'' OR NOT saas.catalog_size_guide_config_valid(p_config) OR pg_catalog.pg_column_size(p_config)>65536 ELSE pg_catalog.pg_column_size(p_config)>8192 END)');
 anchor:='  IF p_kind=''collection'' AND p_expected_version IS NOT NULL AND p_slug='''' THEN';
 IF (length(changed)-length(replace(changed,anchor,'')))<>length(anchor) THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_SAVE_CATEGORY_DRIFT'; END IF;
 changed:=replace(changed,anchor,$code$  IF p_config->>'type'='size_guide' THEN
    IF p_kind IS DISTINCT FROM 'extra' OR p_resource_id IS NULL OR p_operation_id IS NULL
      OR NOT saas.catalog_size_guide_config_valid(p_config) OR cardinality(p_product_ids) IS DISTINCT FROM 0
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
    -- Active category rows are locked so a concurrent archive cannot slip past
    -- the same-store validation before this guide commits.
    PERFORM 1 FROM saas.catalog_categories c WHERE c.store_id=p_store_id AND c.status='active'
      AND c.id IN(SELECT value::uuid FROM jsonb_array_elements_text(p_config->'categoryIds')) ORDER BY c.id FOR SHARE;
    IF (SELECT count(*) FROM saas.catalog_categories c WHERE c.store_id=p_store_id AND c.status='active'
      AND c.id IN(SELECT value::uuid FROM jsonb_array_elements_text(p_config->'categoryIds')))<>jsonb_array_length(p_config->'categoryIds')
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
    IF p_config->'enabled'='true'::jsonb AND EXISTS(
      SELECT 1 FROM saas.catalog_admin_resources r WHERE r.store_id=p_store_id AND r.id<>p_resource_id
        AND r.resource_kind='extra' AND r.status='active' AND r.config->>'type'='size_guide' AND r.config->'enabled'='true'::jsonb
        AND r.config->'categoryIds' ?| ARRAY(SELECT value FROM jsonb_array_elements_text(p_config->'categoryIds'))
    ) THEN RETURN QUERY SELECT 'category_guide_conflict',NULL::jsonb;RETURN;END IF;
  END IF;
  IF p_kind='extra' AND p_config->>'type' IS DISTINCT FROM 'size_guide' AND EXISTS(
    SELECT 1 FROM saas.catalog_admin_resources r WHERE r.store_id=p_store_id AND r.id=p_resource_id
      AND r.resource_kind='extra' AND r.config->>'type'='size_guide'
  ) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
$code$||anchor);
 EXECUTE changed;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=row.identity::regprocedure AND (proowner<>row.owner_id OR proacl IS DISTINCT FROM row.acl OR proconfig IS DISTINCT FROM row.settings OR prosecdef IS DISTINCT FROM row.security_definer)) THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_SAVE_AUTHORITY_CHANGED';END IF;
END $save_patch$;

-- Automatic guides are not selectable product options. Base functions are
-- patched, so their versioned wrappers and older callers inherit the same rule.
DO $product_choices$
DECLARE row record;changed text;anchor text;
BEGIN
 FOR row IN SELECT * FROM saas.catalog_size_guides_203_backup WHERE identity LIKE 'saas.catalog_get_%' OR identity LIKE 'saas.catalog_onboard_product(%' OR identity LIKE 'saas.catalog_update_merchandising(%' LOOP
  changed:=row.definition;
  IF row.identity LIKE 'saas.catalog_get_%' THEN anchor:='WHERE resource.store_id=p_store_id AND resource.status=''active''';
  ELSE anchor:='AND resource.resource_kind=requested.kind AND resource.status=''active''';END IF;
  IF (length(changed)-length(replace(changed,anchor,'')))<>length(anchor) THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_PRODUCT_CHOICES_DRIFT: %',row.identity;END IF;
  changed:=replace(changed,anchor,anchor||' AND (resource.resource_kind<>''extra'' OR resource.config->>''type'' IS DISTINCT FROM ''size_guide'')');
  EXECUTE changed;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=row.identity::regprocedure AND (proowner<>row.owner_id OR proacl IS DISTINCT FROM row.acl OR proconfig IS DISTINCT FROM row.settings OR prosecdef IS DISTINCT FROM row.security_definer)) THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_PRODUCT_CHOICES_AUTHORITY_CHANGED';END IF;
 END LOOP;
END $product_choices$;

-- A final integrity boundary covers every product write path, including older
-- APIs that insert relations without calling the resource save function.
CREATE FUNCTION saas.guard_catalog_size_guide_product_relation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE resource saas.catalog_admin_resources%ROWTYPE;
BEGIN
 SELECT * INTO resource FROM saas.catalog_admin_resources WHERE store_id=NEW.store_id AND id=NEW.resource_id FOR SHARE;
 IF resource.resource_kind='extra' AND resource.config->>'type'='size_guide' THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_DIRECT_PRODUCT_ASSIGNMENT_INVALID';END IF;
 RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION saas.guard_catalog_size_guide_product_relation() FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability;
CREATE TRIGGER catalog_size_guide_product_relation BEFORE INSERT OR UPDATE ON saas.catalog_admin_resource_products FOR EACH ROW EXECUTE FUNCTION saas.guard_catalog_size_guide_product_relation();

-- Resolve categories at read time, keeping all unrelated merchandising intact.
DO $projection_patch$
DECLARE row record;changed text;anchor text;
BEGIN
 SELECT * INTO STRICT row FROM saas.catalog_size_guides_203_backup WHERE identity='saas.public_starter_product_merchandising(uuid,uuid)';changed:=row.definition;
 anchor:=' WITH linked AS';
 IF (length(changed)-length(replace(changed,anchor,'')))<>length(anchor) THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_PROJECTION_WITH_DRIFT';END IF;
 changed:=replace(changed,anchor,' WITH RECURSIVE linked AS');
 anchor:=$old$ guide AS (SELECT (SELECT pg_catalog.jsonb_build_object('heading',config->>'heading','body',config->>'body') FROM linked WHERE resource_kind='definition' AND saas.campaign_starter_exact_keys(config,ARRAY['role','heading','body']) AND config->>'role'='size_guide' AND saas.campaign_starter_text_valid(config->'heading',1,120) AND saas.campaign_starter_text_valid(config->'body',1,4000) ORDER BY name,id LIMIT 1) value)$old$;
 IF (length(changed)-length(replace(changed,anchor,'')))<>length(anchor) THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_PROJECTION_FALLBACK_DRIFT';END IF;
 changed:=replace(changed,anchor,$new$ category_paths AS (
  SELECT c.id,c.parent_id,r.position category_position,0 distance
  FROM saas.catalog_product_categories r JOIN saas.catalog_categories c ON c.store_id=r.store_id AND c.id=r.category_id AND c.status='active'
  JOIN saas.products p ON p.store_id=r.store_id AND p.id=r.product_id AND p.status='active'
  WHERE r.store_id=p_store_id AND r.product_id=p_product_id
  UNION ALL
  SELECT parent.id,parent.parent_id,path.category_position,path.distance+1
  FROM category_paths path JOIN saas.catalog_categories parent ON parent.store_id=p_store_id AND parent.id=path.parent_id AND parent.status='active'
  WHERE path.distance<8
 ),
 category_guide AS (
  SELECT jsonb_build_object('heading',r.config->>'heading','body',r.config->>'body') value
  FROM category_paths path JOIN saas.catalog_admin_resources r ON r.store_id=p_store_id AND r.resource_kind='extra' AND r.status='active'
   AND r.config->>'type'='size_guide' AND r.config->'enabled'='true'::jsonb AND r.config->'categoryIds' ? path.id::text
  WHERE saas.catalog_size_guide_config_valid(r.config) AND (path.distance=0 OR r.config->'includeDescendants'='true'::jsonb)
  ORDER BY path.distance,path.category_position,path.id,r.id LIMIT 1
 ),
 guide AS (SELECT COALESCE((SELECT value FROM category_guide),(SELECT pg_catalog.jsonb_build_object('heading',config->>'heading','body',config->>'body') FROM linked WHERE resource_kind='definition' AND saas.campaign_starter_exact_keys(config,ARRAY['role','heading','body']) AND config->>'role'='size_guide' AND saas.campaign_starter_text_valid(config->'heading',1,120) AND saas.campaign_starter_text_valid(config->'body',1,4000) ORDER BY name,id LIMIT 1)) value)$new$);
 EXECUTE changed;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=row.identity::regprocedure AND (proowner<>row.owner_id OR proacl IS DISTINCT FROM row.acl OR proconfig IS DISTINCT FROM row.settings OR prosecdef IS DISTINCT FROM row.security_definer)) THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_PROJECTION_AUTHORITY_CHANGED';END IF;
END $projection_patch$;
COMMIT;
