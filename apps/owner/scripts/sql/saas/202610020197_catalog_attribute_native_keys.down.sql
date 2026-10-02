BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Preserve resources, source records and product links written by this migration.
DO $restore$
DECLARE signature regprocedure; original text; changed text; anchor text; original_owner oid; original_acl aclitem[];
BEGIN
 signature:='saas.catalog_migration_import_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,jsonb)'::regprocedure;
 SELECT pg_get_functiondef(oid),proowner,proacl INTO original,original_owner,original_acl FROM pg_proc WHERE oid=signature;
 anchor:=E'    -- migration197-native-attributes-start\n    PERFORM saas.catalog_migration_link_native_attributes(p_store_id,selected_product,jsonb_build_array(p->''variant'')||coalesce(p->''additionalVariants'',''[]''::jsonb),p_now);\n    -- migration197-native-attributes-end\n';
 IF (length(original)-length(replace(original,anchor,'')))<>length(anchor) THEN RAISE EXCEPTION 'MIGRATION197_IMPORT_ROLLBACK_DRIFT'; END IF;
 changed:=replace(original,anchor,''); EXECUTE changed;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=signature AND (proowner<>original_owner OR proacl IS DISTINCT FROM original_acl OR NOT prosecdef)) THEN RAISE EXCEPTION 'MIGRATION197_IMPORT_ROLLBACK_AUTHORITY'; END IF;

 signature:='saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])'::regprocedure;
 SELECT pg_get_functiondef(oid),proowner,proacl INTO original,original_owner,original_acl FROM pg_proc WHERE oid=signature;
 anchor:='p_kind IN(''brand'',''collection'',''attribute'')';
 IF (length(original)-length(replace(original,anchor,'')))<>2*length(anchor) THEN RAISE EXCEPTION 'MIGRATION197_RESOURCE_ROLLBACK_DRIFT'; END IF;
 changed:=replace(original,anchor,'p_kind IN(''brand'',''collection'')'); EXECUTE changed;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=signature AND (proowner<>original_owner OR proacl IS DISTINCT FROM original_acl OR NOT prosecdef)) THEN RAISE EXCEPTION 'MIGRATION197_RESOURCE_ROLLBACK_AUTHORITY'; END IF;

 signature:='saas.catalog_create_variants_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb)'::regprocedure;
 SELECT pg_get_functiondef(oid),proowner,proacl INTO original,original_owner,original_acl FROM pg_proc WHERE oid=signature;
 IF strpos(original,'saas.catalog_attribute_native_key(resource.config,resource.slug)=selected.key')=0
  OR strpos(original,'saas.catalog_attribute_native_key(resource.config,resource.slug)=attribute_record.key')=0 THEN RAISE EXCEPTION 'MIGRATION197_VARIANT_ROLLBACK_DRIFT'; END IF;
 changed:=replace(replace(original,'saas.catalog_attribute_native_key(resource.config,resource.slug)=selected.key','resource.slug=selected.key'),
  'saas.catalog_attribute_native_key(resource.config,resource.slug)=attribute_record.key','resource.slug=attribute_record.key'); EXECUTE changed;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=signature AND (proowner<>original_owner OR proacl IS DISTINCT FROM original_acl OR NOT prosecdef)) THEN RAISE EXCEPTION 'MIGRATION197_VARIANT_ROLLBACK_AUTHORITY'; END IF;
END $restore$;
DROP FUNCTION saas.catalog_migration_link_native_attributes(uuid,uuid,jsonb,timestamptz);
DROP FUNCTION saas.catalog_attribute_native_key(jsonb,text);
COMMIT;
