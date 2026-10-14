-- Health metadata writes do not change the Merchant storefront authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE saas.google_merchant_235_backup(
 signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,
 function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE saas.google_merchant_235_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.google_merchant_235_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.google_merchant_235_backup FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
INSERT INTO saas.google_merchant_235_backup(signature,definition,original_sha256,function_oid,function_owner,function_acl)
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),p.oid,p.proowner,p.proacl
 FROM pg_proc p WHERE p.oid='saas.google_merchant_changed()'::regprocedure;
DO $patch$
DECLARE definition text;
 old_domain text:=$old$ ELSIF TG_TABLE_NAME='store_domains' THEN
  FOR row IN SELECT id FROM saas.products WHERE store_id=s LOOP PERFORM saas.google_merchant_enqueue_product(s,row.id);END LOOP;RETURN NULL;$old$;
 new_domain text:=$new$ ELSIF TG_TABLE_NAME='store_domains' THEN
  -- Ignore version, checked/updated timestamps and other health-only metadata.
  IF TG_OP='UPDATE' AND NEW.store_id IS NOT DISTINCT FROM OLD.store_id
   AND NEW.hostname IS NOT DISTINCT FROM OLD.hostname AND NEW.status IS NOT DISTINCT FROM OLD.status
   AND NEW.is_primary IS NOT DISTINCT FROM OLD.is_primary AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at
  THEN RETURN NULL;END IF;
  FOR row IN SELECT id FROM saas.products WHERE store_id=s LOOP PERFORM saas.google_merchant_enqueue_product(s,row.id);END LOOP;RETURN NULL;$new$;
BEGIN
 SELECT b.definition INTO STRICT definition FROM saas.google_merchant_235_backup b;
 IF position('IF TG_TABLE_NAME=''google_marketing_connections'' THEN' IN definition)=0
  OR position('NEW.selection IS NOT DISTINCT FROM OLD.selection AND NEW.version=OLD.version AND NEW.status=OLD.status' IN definition)=0
  OR position('ELSIF TG_TABLE_NAME=''products'' THEN' IN definition)=0
  OR position('ELSIF TG_TABLE_NAME=''product_variants'' THEN' IN definition)=0
 THEN RAISE EXCEPTION 'MERCHANT235_CHANGED_BRANCH_DRIFT';END IF;
 IF (length(definition)-length(replace(definition,old_domain,'')))/length(old_domain)<>1
 THEN RAISE EXCEPTION 'MERCHANT235_CHANGED_SOURCE_DRIFT';END IF;
 EXECUTE replace(definition,old_domain,new_domain);
 UPDATE saas.google_merchant_235_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(function_oid),'UTF8')),'hex');
END $patch$;
COMMIT;
