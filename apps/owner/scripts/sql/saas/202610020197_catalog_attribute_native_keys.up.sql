BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- An explicit native key is distinct from the resource's URL slug.
CREATE FUNCTION saas.catalog_attribute_native_key(p_config jsonb,p_slug text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $fn$
 SELECT CASE WHEN p_config ? 'key' THEN
  CASE WHEN jsonb_typeof(p_config->'key')='string' AND p_config->>'key'~'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$' THEN p_config->>'key' END
 ELSE p_slug END
$fn$;
REVOKE ALL ON FUNCTION saas.catalog_attribute_native_key(jsonb,text) FROM PUBLIC,celebix_saas_app;

-- The current Qukasoft compiler exposes these seven native keys. Other source
-- fields continue to be retained by SQL196's unchanged raw source contract.
CREATE FUNCTION saas.catalog_migration_link_native_attributes(p_store_id uuid,p_product_id uuid,p_variants jsonb,p_now timestamptz)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $fn$
DECLARE definition record; selected_value text; merged_values jsonb; resource saas.catalog_admin_resources%ROWTYPE;
 matches integer; next_position integer; next_config jsonb;
BEGIN
 IF p_store_id IS NULL OR p_product_id IS NULL OR p_now IS NULL OR jsonb_typeof(p_variants) IS DISTINCT FROM 'array'
  OR NOT EXISTS(SELECT 1 FROM saas.products WHERE store_id=p_store_id AND id=p_product_id AND status<>'archived')
 THEN RAISE EXCEPTION 'CATALOG_NATIVE_ATTRIBUTES_INPUT_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 FOR definition IN SELECT * FROM (VALUES
  ('maden','Maden','maden'),('birim','Birim','birim'),('kdv_orani','KDV oranı','kdv-orani'),
  ('harf','Harf','harf'),('uzunluk','Uzunluk','uzunluk'),('gram','Gram','gram'),('yuzuk_olcusu','Yüzük Ölçüsü','yuzuk-olcusu')
 ) AS definitions(key,name,slug) LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_variants) v WHERE v.value->'attributes' ? definition.key) THEN CONTINUE; END IF;
  SELECT count(*) INTO matches FROM saas.catalog_admin_resources r
   WHERE r.store_id=p_store_id AND r.resource_kind='attribute'
    AND (saas.catalog_attribute_native_key(r.config,r.slug)=definition.key OR r.slug=definition.slug);
  IF matches>1 THEN RAISE EXCEPTION 'CATALOG_NATIVE_ATTRIBUTE_AMBIGUOUS'; END IF;
  resource:=NULL;
  IF matches=1 THEN
   SELECT * INTO STRICT resource FROM saas.catalog_admin_resources r
    WHERE r.store_id=p_store_id AND r.resource_kind='attribute'
     AND (saas.catalog_attribute_native_key(r.config,r.slug)=definition.key OR r.slug=definition.slug) FOR UPDATE;
   IF resource.status<>'active' OR (resource.config ? 'key' AND saas.catalog_attribute_native_key(resource.config,resource.slug) IS DISTINCT FROM definition.key)
    OR jsonb_typeof(resource.config->'values') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'CATALOG_NATIVE_ATTRIBUTE_RESOURCE_CONFLICT'; END IF;
   merged_values:=resource.config->'values';
  ELSE merged_values:='[]'::jsonb; END IF;
  FOR selected_value IN SELECT v.value->'attributes'->>definition.key
   FROM jsonb_array_elements(p_variants) WITH ORDINALITY v(value,ordinality)
   WHERE v.value->'attributes' ? definition.key ORDER BY v.ordinality
  LOOP
   IF selected_value IS NULL OR selected_value<>btrim(selected_value) OR char_length(selected_value) NOT BETWEEN 1 AND 100 OR selected_value~'[[:cntrl:]]'
   THEN RAISE EXCEPTION 'CATALOG_NATIVE_ATTRIBUTE_VALUE_INVALID'; END IF;
   IF NOT merged_values ? selected_value THEN merged_values:=merged_values||jsonb_build_array(selected_value); END IF;
  END LOOP;
  IF jsonb_array_length(merged_values) NOT BETWEEN 1 AND 64 OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(merged_values) e WHERE jsonb_typeof(e.value)<>'string'
    OR e.value#>>'{}'<>btrim(e.value#>>'{}') OR char_length(e.value#>>'{}') NOT BETWEEN 1 AND 100 OR e.value#>>'{}'~'[[:cntrl:]]'
  ) OR (SELECT count(DISTINCT lower(translate(e.value,'Iİ','ıi'))) FROM jsonb_array_elements_text(merged_values) e(value))<>jsonb_array_length(merged_values)
  THEN RAISE EXCEPTION 'CATALOG_NATIVE_ATTRIBUTE_VALUES_CONFLICT'; END IF;
  next_config:=coalesce(resource.config,'{}'::jsonb)||jsonb_build_object('key',definition.key,'values',merged_values);
  IF pg_column_size(next_config)>8192 THEN RAISE EXCEPTION 'CATALOG_NATIVE_ATTRIBUTE_CONFIG_LIMIT'; END IF;
  IF resource.id IS NULL THEN
   INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,status,version,created_at,updated_at)
   VALUES(gen_random_uuid(),p_store_id,'attribute',definition.name,definition.slug,next_config,'active',1,p_now,p_now) RETURNING * INTO resource;
  ELSIF resource.config IS DISTINCT FROM next_config THEN
   UPDATE saas.catalog_admin_resources SET config=next_config,version=version+1,updated_at=greatest(updated_at,p_now)
    WHERE store_id=p_store_id AND id=resource.id RETURNING * INTO resource;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products WHERE store_id=p_store_id AND resource_id=resource.id AND product_id=p_product_id) THEN
   SELECT coalesce(max(position)+1,0) INTO next_position FROM saas.catalog_admin_resource_products WHERE store_id=p_store_id AND resource_id=resource.id;
   IF next_position>9999 THEN RAISE EXCEPTION 'CATALOG_NATIVE_ATTRIBUTE_PRODUCT_LIMIT'; END IF;
   INSERT INTO saas.catalog_admin_resource_products(store_id,resource_id,product_id,position) VALUES(p_store_id,resource.id,p_product_id,next_position);
  END IF;
 END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION saas.catalog_migration_link_native_attributes(uuid,uuid,jsonb,timestamptz) FROM PUBLIC,celebix_saas_app;

DO $patch$
DECLARE signature regprocedure; original text; changed text; anchor text; original_owner oid; original_acl aclitem[];
BEGIN
 signature:='saas.catalog_create_variants_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb)'::regprocedure;
 SELECT pg_get_functiondef(oid),proowner,proacl INTO original,original_owner,original_acl FROM pg_proc WHERE oid=signature;
 IF (length(original)-length(replace(original,'resource.slug=selected.key','')))<>length('resource.slug=selected.key')
  OR (length(original)-length(replace(original,'resource.slug=attribute_record.key','')))<>length('resource.slug=attribute_record.key')
 THEN RAISE EXCEPTION 'MIGRATION197_VARIANT_PREDECESSOR_DRIFT'; END IF;
 changed:=replace(replace(original,'resource.slug=selected.key','saas.catalog_attribute_native_key(resource.config,resource.slug)=selected.key'),
  'resource.slug=attribute_record.key','saas.catalog_attribute_native_key(resource.config,resource.slug)=attribute_record.key');
 EXECUTE changed;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=signature AND (proowner<>original_owner OR proacl IS DISTINCT FROM original_acl OR NOT prosecdef)) THEN RAISE EXCEPTION 'MIGRATION197_VARIANT_AUTHORITY_CHANGED'; END IF;

 signature:='saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])'::regprocedure;
 SELECT pg_get_functiondef(oid),proowner,proacl INTO original,original_owner,original_acl FROM pg_proc WHERE oid=signature;
 anchor:='p_kind IN(''brand'',''collection'')';
 IF (length(original)-length(replace(original,anchor,'')))<>2*length(anchor) THEN RAISE EXCEPTION 'MIGRATION197_RESOURCE_PREDECESSOR_DRIFT'; END IF;
 -- Preserve large relations and already linked archived products during edits.
 changed:=replace(original,anchor,'p_kind IN(''brand'',''collection'',''attribute'')');
 EXECUTE changed;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=signature AND (proowner<>original_owner OR proacl IS DISTINCT FROM original_acl OR NOT prosecdef)) THEN RAISE EXCEPTION 'MIGRATION197_RESOURCE_AUTHORITY_CHANGED'; END IF;

 signature:='saas.catalog_migration_import_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,jsonb)'::regprocedure;
 SELECT pg_get_functiondef(oid),proowner,proacl INTO original,original_owner,original_acl FROM pg_proc WHERE oid=signature;
 anchor:=E'     shipping_desi_milli=desi::bigint,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND product_id=selected_product;\n';
 IF (length(original)-length(replace(original,anchor,'')))<>length(anchor)
  OR strpos(original,'IF prior_outcome IS DISTINCT FROM ''batch_imported'' THEN')=0
 THEN RAISE EXCEPTION 'MIGRATION197_IMPORT_PREDECESSOR_DRIFT'; END IF;
 changed:=replace(original,anchor,anchor||E'    -- migration197-native-attributes-start\n    PERFORM saas.catalog_migration_link_native_attributes(p_store_id,selected_product,jsonb_build_array(p->''variant'')||coalesce(p->''additionalVariants'',''[]''::jsonb),p_now);\n    -- migration197-native-attributes-end\n');
 EXECUTE changed;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=signature AND (proowner<>original_owner OR proacl IS DISTINCT FROM original_acl OR NOT prosecdef)) THEN RAISE EXCEPTION 'MIGRATION197_IMPORT_AUTHORITY_CHANGED'; END IF;
END $patch$;
COMMIT;
