-- Apply after native256 and Merchant236, before enabling any restrictive WhatsApp policy.
-- Existing command/worker shapes, offer identities and 48-hour status cadence remain compatible.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE saas.google_merchant_257_backup(
 signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,
 function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE saas.google_merchant_257_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.google_merchant_257_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.google_merchant_257_backup FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
INSERT INTO saas.google_merchant_257_backup(signature,definition,original_sha256,function_oid,function_owner,function_acl)
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),p.oid,p.proowner,p.proacl
 FROM pg_proc p WHERE p.oid IN('saas.google_merchant_projection(uuid,uuid,timestamptz)'::regprocedure,'saas.google_merchant_enqueue(uuid,uuid,uuid)'::regprocedure,'saas.google_merchant_claim(timestamptz,integer,uuid)'::regprocedure,'saas.google_merchant_job_projection(uuid,uuid,timestamptz)'::regprocedure,'saas.google_merchant_advance_catalog_batches(timestamptz)'::regprocedure);

CREATE FUNCTION saas.google_merchant_whatsapp_catalog_only(p_store uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT count(*)>1 OR coalesce(bool_or(r.status<>'active' OR saas.whatsapp_order_config_valid(r.config) IS DISTINCT FROM true OR (r.config->'enabled'='true'::jsonb AND (r.config->'hidePrices'='true'::jsonb OR r.config->'hideAddToCart'='true'::jsonb))),false)
 FROM saas.merchant_admin_records r WHERE r.store_id=p_store AND r.record_kind='whatsapp_order_setting' AND r.status<>'archived'
$f$;

CREATE FUNCTION saas.google_merchant_whatsapp_policy_changed() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE s uuid:=coalesce(NEW.store_id,OLD.store_id);before_blocked boolean;after_blocked boolean;
BEGIN
 IF NEW.record_kind IS DISTINCT FROM 'whatsapp_order_setting' AND OLD.record_kind IS DISTINCT FROM 'whatsapp_order_setting' THEN RETURN NULL;END IF;
 before_blocked:=TG_OP<>'INSERT' AND OLD.record_kind='whatsapp_order_setting' AND OLD.status<>'archived' AND (OLD.status<>'active' OR saas.whatsapp_order_config_valid(OLD.config) IS DISTINCT FROM true OR (OLD.config->'enabled'='true'::jsonb AND (OLD.config->'hidePrices'='true'::jsonb OR OLD.config->'hideAddToCart'='true'::jsonb)));
 after_blocked:=TG_OP<>'DELETE' AND NEW.record_kind='whatsapp_order_setting' AND NEW.status<>'archived' AND (NEW.status<>'active' OR saas.whatsapp_order_config_valid(NEW.config) IS DISTINCT FROM true OR (NEW.config->'enabled'='true'::jsonb AND (NEW.config->'hidePrices'='true'::jsonb OR NEW.config->'hideAddToCart'='true'::jsonb)));
 IF coalesce(before_blocked,false)=coalesce(after_blocked,false) THEN RETURN NULL;END IF;
 -- Invalidate existing leases immediately; bounded batches enqueue this store only.
 -- A record version edit with identical Merchant eligibility needs no offer work.
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||s::text,0));
 INSERT INTO saas.google_merchant_catalog_revisions(store_id,revision) VALUES(s,1)
 ON CONFLICT(store_id) DO UPDATE SET revision=saas.google_merchant_catalog_revisions.revision+1;
 IF EXISTS(SELECT 1 FROM saas.google_marketing_connections WHERE store_id=s AND service='merchant' AND status='connected' AND credential IS NOT NULL) THEN
  INSERT INTO saas.google_merchant_catalog_batches(store_id,include_fixed) VALUES(s,true)
  ON CONFLICT(store_id) DO UPDATE SET include_fixed=true,cursor_variant=NULL,processed=false,updated_at=clock_timestamp();
 END IF;
 RETURN NULL;
END $f$;
CREATE TRIGGER google_merchant_whatsapp_policy_changed AFTER INSERT OR UPDATE OR DELETE ON saas.merchant_admin_records
 FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_whatsapp_policy_changed();

DO $patch$
DECLARE saved record;definition text;old_piece text;new_piece text;
BEGIN
 IF (SELECT count(*) FROM saas.google_merchant_257_backup)<>5 THEN RAISE EXCEPTION 'MERCHANT257_BACKUP_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.google_merchant_outbox'::regclass AND attname='next_status_check_at' AND NOT attisdropped) THEN RAISE EXCEPTION 'MERCHANT257_REQUIRES236';END IF;
 FOR saved IN SELECT * FROM saas.google_merchant_257_backup LOOP
  definition:=saved.definition;
  IF saved.signature LIKE 'saas.google_merchant_projection(%' THEN
   old_piece:=' IF jsonb_array_length(issues)=0 THEN';
   new_piece:=' IF saas.google_merchant_whatsapp_catalog_only(p_store) THEN issues:=issues||jsonb_build_array(jsonb_build_object(''code'',''whatsapp_catalog_only'',''message'',''WhatsApp katalog modunda Google ürün gösterimleri kapalıdır.''));END IF;'||E'\n'||old_piece;
  ELSIF saved.signature LIKE 'saas.google_merchant_enqueue(%' THEN
   old_piece:='DECLARE c saas.google_marketing_connections;';
   new_piece:='DECLARE c saas.google_marketing_connections;blocked boolean:=saas.google_merchant_whatsapp_catalog_only(p_store);';
   IF position(' IF NOT FOUND THEN RETURN;END IF;' IN definition)=0 THEN RAISE EXCEPTION 'MERCHANT257_ENQUEUE_SOURCE_DRIFT';END IF;
   definition:=replace(definition,' IF NOT FOUND THEN RETURN;END IF;',
    ' IF NOT FOUND THEN RETURN;END IF; IF blocked AND EXISTS(SELECT 1 FROM saas.google_merchant_outbox WHERE store_id=p_store AND variant_id=p_variant AND state IN(''excluded'',''withdrawn'') AND google_product_id IS NULL AND last_export_fingerprint IS NULL AND lease_id IS NULL) THEN RETURN;END IF;');
  ELSIF saved.signature LIKE 'saas.google_merchant_claim(%' THEN
   -- Keep the complete236 scheduling branch; only ineligible jobs become deletes.
   IF position('interval ''48 hours''' IN definition)=0 OR position('lease_catalog_revision=' IN definition)=0 OR position('LIMIT 100 FOR UPDATE OF q SKIP LOCKED LOOP' IN definition)=0 THEN RAISE EXCEPTION 'MERCHANT257_CLAIM_FENCE_DRIFT';END IF;
   old_piece:='UPDATE saas.google_merchant_outbox SET next_action=''upsert'' WHERE';
   new_piece:=old_piece; -- Delete is a transient job action; persisted action remains legacy-compatible.
  ELSIF saved.signature LIKE 'saas.google_merchant_job_projection(%' THEN
   old_piece:='projection->''offer''=''null''::jsonb AND q.google_product_id IS NOT NULL';
   new_piece:='projection->''offer''=''null''::jsonb';
  ELSE
   old_piece:='SELECT id,product_id FROM saas.product_variants WHERE store_id=batch.store_id AND(batch.cursor_variant IS NULL OR id>batch.cursor_variant) ORDER BY id LIMIT 101';
   new_piece:='SELECT id,product_id FROM (SELECT id,product_id FROM saas.product_variants WHERE store_id=batch.store_id UNION SELECT variant_id,product_id FROM saas.google_merchant_outbox WHERE store_id=batch.store_id) tracked WHERE batch.cursor_variant IS NULL OR id>batch.cursor_variant ORDER BY id LIMIT 101';
  END IF;
  IF (length(definition)-length(replace(definition,old_piece,'')))/length(old_piece)<>1 THEN RAISE EXCEPTION 'MERCHANT257_SOURCE_DRIFT %',saved.signature;END IF;
  EXECUTE replace(definition,old_piece,new_piece);
 END LOOP;
 UPDATE saas.google_merchant_257_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(function_oid),'UTF8')),'hex');
END $patch$;
REVOKE ALL ON FUNCTION saas.google_merchant_whatsapp_catalog_only(uuid),saas.google_merchant_whatsapp_policy_changed() FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
-- Compatibility install does not modify settings, connection selections or tariff snapshots.
-- If a restriction already exists, fence old leases and schedule its tracked offers.
DO $existing$
DECLARE s uuid;
BEGIN
 FOR s IN SELECT DISTINCT store_id FROM saas.merchant_admin_records WHERE record_kind='whatsapp_order_setting' AND status<>'archived' AND saas.google_merchant_whatsapp_catalog_only(store_id) LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||s::text,0));
  INSERT INTO saas.google_merchant_catalog_revisions(store_id,revision) VALUES(s,1) ON CONFLICT(store_id) DO UPDATE SET revision=saas.google_merchant_catalog_revisions.revision+1;
  IF EXISTS(SELECT 1 FROM saas.google_marketing_connections WHERE store_id=s AND service='merchant' AND status='connected' AND credential IS NOT NULL) THEN
   INSERT INTO saas.google_merchant_catalog_batches(store_id,include_fixed) VALUES(s,true) ON CONFLICT(store_id) DO UPDATE SET include_fixed=true,cursor_variant=NULL,processed=false,updated_at=clock_timestamp();
  END IF;
 END LOOP;
END $existing$;
COMMIT;
