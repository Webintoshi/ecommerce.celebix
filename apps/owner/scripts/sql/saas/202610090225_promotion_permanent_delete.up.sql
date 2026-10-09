-- Unnumbered candidate. Permanently removes an operational discount, preserving
-- immutable settlement evidence under existing foreign keys. No history purge.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE TABLE saas.promotion_deletions(
 store_id uuid NOT NULL,promotion_id uuid NOT NULL,operation_id uuid NOT NULL,
 principal_id uuid NOT NULL,membership_id uuid NOT NULL,expected_version bigint NOT NULL CHECK(expected_version BETWEEN 1 AND 9007199254740991),
 fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),deleted_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,promotion_id),UNIQUE(store_id,operation_id),
 FOREIGN KEY(store_id,promotion_id) REFERENCES saas.promotions(store_id,id),
 FOREIGN KEY(principal_id) REFERENCES saas.principals(id),
 FOREIGN KEY(store_id,membership_id) REFERENCES saas.memberships(store_id,id),
 CHECK(isfinite(deleted_at) AND date_trunc('milliseconds',deleted_at)=deleted_at)
);
ALTER TABLE saas.promotion_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.promotion_deletions FORCE ROW LEVEL SECURITY;
CREATE POLICY promotion_deletions_owner ON saas.promotion_deletions TO celebix_saas_owner USING(true) WITH CHECK(true);
REVOKE ALL ON saas.promotion_deletions FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;

CREATE FUNCTION saas.promotion_is_deleted_v1(p_store uuid,p_promotion uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.promotion_deletions WHERE store_id=p_store AND promotion_id=p_promotion)
$f$;
CREATE FUNCTION saas.promotion_delete_fingerprint_v1(p_store uuid,p_promotion uuid,p_version bigint)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_store IS NOT NULL AND p_promotion IS NOT NULL AND p_version BETWEEN 1 AND 9007199254740991 THEN
 encode(sha256(convert_to(saas.promotion_fingerprint_canonical_json(jsonb_build_object('kind','delete','storeId',p_store,'payload',jsonb_build_object('id',p_promotion,'expectedVersion',p_version)),NULL),'UTF8')),'hex') END
$f$;
CREATE FUNCTION saas.promotion_delete_impact_projection_v1(p_store uuid,p_promotion uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 WITH facts AS (
 SELECT p.id,p.version,p.name,
 (SELECT count(*) FROM saas.promotion_codes WHERE store_id=p_store AND promotion_id=p_promotion) code_count,
 (SELECT count(*) FROM saas.promotion_redemptions WHERE store_id=p_store AND promotion_id=p_promotion) redemption_count,
 -- Expiry alone does not terminalize a checkout's durable payment obligation.
 (SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id=p_store AND promotion_id=p_promotion AND status='reserved') reserved_count,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'name',name,'enabled',enabled) ORDER BY created_at,id),'[]'::jsonb)
 FROM saas.store_engagement_campaigns WHERE store_id=p_store AND config->>'promotionId'=p_promotion::text) tools,
 EXISTS(SELECT 1 FROM saas.store_engagement_campaigns WHERE store_id=p_store AND enabled AND config->>'promotionId'=p_promotion::text) active_tool
 FROM saas.promotions p WHERE p.store_id=p_store AND p.id=p_promotion AND NOT saas.promotion_is_deleted_v1(p_store,p_promotion)
 ) SELECT jsonb_build_object('id',id,'version',version,'name',name,'codeCount',code_count,'preservedRedemptionCount',redemption_count,
 'pendingReservationCount',reserved_count,'linkedTools',tools,'canDelete',reserved_count=0 AND NOT active_tool) FROM facts
$f$;
CREATE FUNCTION saas.promotion_delete_impact_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_promotion_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;j jsonb;BEGIN
 e:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.archive');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_promotion_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 j:=saas.promotion_delete_impact_projection_v1(p_store_id,p_promotion_id);
 RETURN QUERY SELECT CASE WHEN j IS NULL THEN 'not_found' ELSE 'found' END,j;
END $f$;
CREATE FUNCTION saas.promotion_delete_recover_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;d saas.promotion_deletions;BEGIN
 e:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.archive');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO d FROM saas.promotion_deletions WHERE store_id=p_store_id AND operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;
 ELSIF d.principal_id<>p_principal_id OR d.membership_id<>p_membership_id OR d.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
 ELSE RETURN QUERY SELECT 'operation_replayed',jsonb_build_object('id',d.promotion_id,'deletedAt',to_char(d.deleted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));END IF;
END $f$;
CREATE FUNCTION saas.promotion_delete_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_promotion_id uuid,p_expected_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;p saas.promotions;d saas.promotion_deletions;j jsonb;BEGIN
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'promotion_delete_v1');
 IF p_operation_id IS NULL OR p_promotion_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
 OR p_now IS NULL OR NOT isfinite(p_now) OR date_trunc('milliseconds',p_now)<>p_now
 OR p_fingerprint IS DISTINCT FROM saas.promotion_delete_fingerprint_v1(p_store_id,p_promotion_id,p_expected_version)
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 e:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,'promotions.archive');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 -- Shared with campaign save/enable. Prevents enable-after-preview races.
 PERFORM pg_advisory_xact_lock(hashtextextended('store-engagement-save:'||p_store_id::text,215));
 SELECT * INTO d FROM saas.promotion_deletions WHERE store_id=p_store_id AND operation_id=p_operation_id;
 IF FOUND THEN
  IF d.principal_id<>p_principal_id OR d.membership_id<>p_membership_id OR d.promotion_id<>p_promotion_id OR d.expected_version<>p_expected_version OR d.fingerprint<>p_fingerprint
  THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',jsonb_build_object('id',d.promotion_id,'deletedAt',to_char(d.deleted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));END IF;RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 SELECT * INTO p FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id FOR UPDATE;
 IF NOT FOUND OR saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF p.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id);RETURN;END IF;
 IF p_now<p.updated_at OR p.version=9007199254740991 OR EXISTS(SELECT 1 FROM saas.promotion_code_batches WHERE store_id=p_store_id AND promotion_id=p_promotion_id AND status<>'revoked' AND version=9007199254740991)
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 j:=saas.promotion_delete_impact_projection_v1(p_store_id,p_promotion_id);
 IF (j->>'canDelete')::boolean IS DISTINCT FROM true THEN RETURN QUERY SELECT 'deletion_blocked',NULL::jsonb;RETURN;END IF;
 -- Checkout takes this same promotion row lock before reserving. History stays
 -- byte-for-byte intact; only live selectors and coupon availability end.
 UPDATE saas.promotions SET status='archived',version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_promotion_id;
 UPDATE saas.promotion_code_batches SET status='revoked',version=version+1,updated_at=GREATEST(updated_at,date_trunc('milliseconds',p_now)) WHERE store_id=p_store_id AND promotion_id=p_promotion_id AND status<>'revoked';
 UPDATE saas.promotion_codes SET status='revoked' WHERE store_id=p_store_id AND promotion_id=p_promotion_id AND status<>'revoked';
 DELETE FROM saas.promotion_targets WHERE store_id=p_store_id AND promotion_id=p_promotion_id;
 INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,actor_principal_id,event_kind,payload,created_at)
 VALUES(p_operation_id,p_store_id,p_promotion_id,p_principal_id,'permanently_deleted',jsonb_build_object('fromVersion',p_expected_version,'toVersion',p_expected_version+1),p_now);
 INSERT INTO saas.promotion_deletions VALUES(p_store_id,p_promotion_id,p_operation_id,p_principal_id,p_membership_id,p_expected_version,p_fingerprint,p_now);
 RETURN QUERY SELECT 'deleted',jsonb_build_object('id',p_promotion_id,'deletedAt',to_char(p_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $f$;

-- Guard the evidence parent and all ways to restore operational coupon state.
CREATE FUNCTION saas.promotion_deletion_write_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE st uuid;pid uuid;old_pid uuid;BEGIN
 IF TG_TABLE_NAME='promotion_operations' THEN
  IF EXISTS(SELECT 1 FROM saas.promotion_deletions WHERE store_id=NEW.store_id AND operation_id=NEW.operation_id) THEN RAISE EXCEPTION 'PROMOTION_DELETION_OPERATION_COLLISION';END IF;
 ELSIF TG_TABLE_NAME='promotion_deletions' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'PROMOTION_DELETION_IMMUTABLE';END IF;
  PERFORM 1 FROM saas.promotions WHERE store_id=NEW.store_id AND id=NEW.promotion_id AND status='archived' AND version=NEW.expected_version+1 FOR UPDATE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM saas.promotion_operations WHERE store_id=NEW.store_id AND operation_id=NEW.operation_id)
  OR EXISTS(SELECT 1 FROM saas.promotion_codes WHERE store_id=NEW.store_id AND promotion_id=NEW.promotion_id AND status<>'revoked')
  OR EXISTS(SELECT 1 FROM saas.promotion_code_batches WHERE store_id=NEW.store_id AND promotion_id=NEW.promotion_id AND status<>'revoked')
  OR EXISTS(SELECT 1 FROM saas.promotion_targets WHERE store_id=NEW.store_id AND promotion_id=NEW.promotion_id)
  OR EXISTS(SELECT 1 FROM saas.promotion_usage_reservations WHERE store_id=NEW.store_id AND promotion_id=NEW.promotion_id AND status='reserved')
  OR EXISTS(SELECT 1 FROM saas.store_engagement_campaigns WHERE store_id=NEW.store_id AND enabled AND config->>'promotionId'=NEW.promotion_id::text)
  THEN RAISE EXCEPTION 'PROMOTION_DELETION_NOT_TERMINAL';END IF;
 ELSE
  st:=CASE WHEN TG_OP='DELETE' THEN OLD.store_id ELSE NEW.store_id END;
  IF TG_TABLE_NAME='promotions' THEN
   pid:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
   IF TG_OP='UPDATE' THEN old_pid:=OLD.id;END IF;
  ELSE
   pid:=CASE WHEN TG_OP='DELETE' THEN OLD.promotion_id ELSE NEW.promotion_id END;
   IF TG_OP='UPDATE' THEN old_pid:=OLD.promotion_id;END IF;
  END IF;
  IF saas.promotion_is_deleted_v1(st,pid) THEN RAISE EXCEPTION 'PROMOTION_PERMANENTLY_DELETED';END IF;
  IF TG_OP='UPDATE' AND saas.promotion_is_deleted_v1(OLD.store_id,old_pid) THEN RAISE EXCEPTION 'PROMOTION_PERMANENTLY_DELETED';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $f$;
CREATE TRIGGER promotion_deletion_operation_namespace BEFORE INSERT ON saas.promotion_operations FOR EACH ROW EXECUTE FUNCTION saas.promotion_deletion_write_guard_v1();
CREATE TRIGGER promotion_deletion_immutable BEFORE INSERT OR UPDATE OR DELETE ON saas.promotion_deletions FOR EACH ROW EXECUTE FUNCTION saas.promotion_deletion_write_guard_v1();
CREATE TRIGGER promotion_deleted_parent BEFORE INSERT OR UPDATE OR DELETE ON saas.promotions FOR EACH ROW EXECUTE FUNCTION saas.promotion_deletion_write_guard_v1();
CREATE TRIGGER promotion_deleted_codes BEFORE INSERT OR UPDATE OR DELETE ON saas.promotion_codes FOR EACH ROW EXECUTE FUNCTION saas.promotion_deletion_write_guard_v1();
CREATE TRIGGER promotion_deleted_batches BEFORE INSERT OR UPDATE OR DELETE ON saas.promotion_code_batches FOR EACH ROW EXECUTE FUNCTION saas.promotion_deletion_write_guard_v1();
CREATE TRIGGER promotion_deleted_targets BEFORE INSERT OR UPDATE OR DELETE ON saas.promotion_targets FOR EACH ROW EXECUTE FUNCTION saas.promotion_deletion_write_guard_v1();


-- Saved exact native bodies make rollback possible before any real deletion.
-- Existing owner/BYPASSRLS and ACLs remain exact; explicit guards enforce hiding.
CREATE TABLE saas.promotion_deletion_function_baseline(identity text PRIMARY KEY,definition text NOT NULL,original_hash text NOT NULL,patched_hash text NOT NULL,owner_oid oid NOT NULL,acl text);
ALTER TABLE saas.promotion_deletion_function_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.promotion_deletion_function_baseline FORCE ROW LEVEL SECURITY;
CREATE POLICY promotion_deletion_baseline_owner ON saas.promotion_deletion_function_baseline TO celebix_saas_owner USING(true) WITH CHECK(true);
REVOKE ALL ON saas.promotion_deletion_function_baseline FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;
DO $patch$ DECLARE r record;f oid;d text;orig text;pair jsonb;o oid;acl text;BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('saas.promotion_analytics_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)','b33f32e6a9b7db067d85fc94206debef','[["  IF NOT EXISTS(SELECT 1 FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id)","  IF saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) OR NOT EXISTS(SELECT 1 FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id)"]]'::jsonb),
 ('saas.promotion_analytics_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,integer)','ba73a308bd2209dd5a53d5956807e6eb','[["  IF NOT EXISTS(SELECT 1 FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=p_promotion_id)","  IF saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) OR NOT EXISTS(SELECT 1 FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=p_promotion_id)"]]'::jsonb),
 ('saas.promotion_code_batch_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,integer,timestamp with time zone,timestamp with time zone,uuid)','975a8ad30e5cadec09e0e7e8e96ab95d','[["  IF NOT EXISTS(SELECT 1 FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=p_promotion_id)","  IF saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) OR NOT EXISTS(SELECT 1 FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=p_promotion_id)"]]'::jsonb),
 ('saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)','9cc1422b24f55002e9ab66a0eea30976','[["  SELECT batch.version,batch.status INTO v_version,v_current_status FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=p_batch_id;","  IF EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=p_batch_id AND saas.promotion_is_deleted_v1(p_store_id,batch.promotion_id)) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  SELECT batch.version,batch.status INTO v_version,v_current_status FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=p_batch_id;"]]'::jsonb),
 ('saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)','53824f15b111f20dc3f53e8c85df2d53','[["  SELECT * INTO v_operation FROM saas.promotion_operations","  IF EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=p_batch_id AND saas.promotion_is_deleted_v1(p_store_id,batch.promotion_id)) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  IF EXISTS(SELECT 1 FROM saas.promotion_deletions WHERE store_id=p_store_id AND operation_id=p_operation_id) THEN RETURN QUERY SELECT ''operation_mismatch'',NULL::jsonb; RETURN; END IF;\n  IF EXISTS(SELECT 1 FROM saas.promotion_operations op WHERE op.store_id=p_store_id AND op.operation_id=p_operation_id AND ((op.result_entity_kind=''promotion'' AND saas.promotion_is_deleted_v1(p_store_id,op.result_entity_id)) OR (op.result_entity_kind=''code_batch'' AND EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=op.result_entity_id AND saas.promotion_is_deleted_v1(p_store_id,batch.promotion_id))))) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  SELECT * INTO v_operation FROM saas.promotion_operations"],["  SELECT promotion.status INTO v_promotion_status FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=v_promotion_id FOR UPDATE;\n","  SELECT promotion.status INTO v_promotion_status FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=v_promotion_id FOR UPDATE;\n  IF saas.promotion_is_deleted_v1(p_store_id,v_promotion_id) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n"]]'::jsonb),
 ('saas.promotion_codes_csv_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)','271d3f2c518093d819a78ca2a455b3d8','[["  SELECT * INTO v_batch FROM saas.promotion_code_batches WHERE store_id=p_store_id AND id=p_batch_id;","  IF EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=p_batch_id AND saas.promotion_is_deleted_v1(p_store_id,batch.promotion_id)) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  SELECT * INTO v_batch FROM saas.promotion_code_batches WHERE store_id=p_store_id AND id=p_batch_id;"]]'::jsonb),
 ('saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,integer,text,integer,integer,timestamp with time zone)','25fb16c56467fc5d97c1ae44070629e3','[["  SELECT * INTO v_operation FROM saas.promotion_operations","  IF saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  IF EXISTS(SELECT 1 FROM saas.promotion_deletions WHERE store_id=p_store_id AND operation_id=p_operation_id) THEN RETURN QUERY SELECT ''operation_mismatch'',NULL::jsonb; RETURN; END IF;\n  IF EXISTS(SELECT 1 FROM saas.promotion_operations op WHERE op.store_id=p_store_id AND op.operation_id=p_operation_id AND ((op.result_entity_kind=''promotion'' AND saas.promotion_is_deleted_v1(p_store_id,op.result_entity_id)) OR (op.result_entity_kind=''code_batch'' AND EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=op.result_entity_id AND saas.promotion_is_deleted_v1(p_store_id,batch.promotion_id))))) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  SELECT * INTO v_operation FROM saas.promotion_operations"],["  SELECT * INTO v_promotion FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=p_promotion_id FOR UPDATE;\n","  SELECT * INTO v_promotion FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=p_promotion_id FOR UPDATE;\n  IF saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n"]]'::jsonb),
 ('saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb)','8bc22d877c8dac092384df6ed708d9c4','[["  SELECT * INTO v_operation FROM saas.promotion_operations","  IF saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  IF EXISTS(SELECT 1 FROM saas.promotion_deletions WHERE store_id=p_store_id AND operation_id=p_operation_id) THEN RETURN QUERY SELECT ''operation_mismatch'',NULL::jsonb; RETURN; END IF;\n  IF EXISTS(SELECT 1 FROM saas.promotion_operations op WHERE op.store_id=p_store_id AND op.operation_id=p_operation_id AND ((op.result_entity_kind=''promotion'' AND saas.promotion_is_deleted_v1(p_store_id,op.result_entity_id)) OR (op.result_entity_kind=''code_batch'' AND EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=op.result_entity_id AND saas.promotion_is_deleted_v1(p_store_id,batch.promotion_id))))) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  SELECT * INTO v_operation FROM saas.promotion_operations"]]'::jsonb),
 ('saas.promotion_duplicate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text,text[])','9d2fe23d75f43b268e875c10bc6ec950','[["  SELECT * INTO v_operation FROM saas.promotion_operations","  IF saas.promotion_is_deleted_v1(p_store_id,p_source_id) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  IF EXISTS(SELECT 1 FROM saas.promotion_deletions WHERE store_id=p_store_id AND operation_id=p_operation_id) THEN RETURN QUERY SELECT ''operation_mismatch'',NULL::jsonb; RETURN; END IF;\n  IF EXISTS(SELECT 1 FROM saas.promotion_operations op WHERE op.store_id=p_store_id AND op.operation_id=p_operation_id AND ((op.result_entity_kind=''promotion'' AND saas.promotion_is_deleted_v1(p_store_id,op.result_entity_id)) OR (op.result_entity_kind=''code_batch'' AND EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=op.result_entity_id AND saas.promotion_is_deleted_v1(p_store_id,batch.promotion_id))))) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  SELECT * INTO v_operation FROM saas.promotion_operations"],["  SELECT * INTO v_source FROM saas.promotions WHERE store_id=p_store_id AND id=p_source_id FOR SHARE;\n","  SELECT * INTO v_source FROM saas.promotions WHERE store_id=p_store_id AND id=p_source_id FOR SHARE;\n  IF saas.promotion_is_deleted_v1(p_store_id,p_source_id) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n"]]'::jsonb),
 ('saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)','fbe05ab2910d6420cf98639a5f41264a','[["WHERE record.store_id=p_store_id AND record.record_kind=''discount'' LIMIT 101","WHERE record.store_id=p_store_id AND record.record_kind=''discount'' AND NOT EXISTS(SELECT 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=record.id AND saas.promotion_is_deleted_v1(p_store_id,adopted.id)) LIMIT 101"],["WHERE r.store_id=p_store_id AND r.record_kind=''discount''","WHERE r.store_id=p_store_id AND r.record_kind=''discount'' AND NOT EXISTS(SELECT 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=r.id AND saas.promotion_is_deleted_v1(p_store_id,adopted.id))"]]'::jsonb),
 ('saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,timestamp with time zone,uuid)','5000b32aad746b61efce62d6063cdb87','[["WHERE record.store_id=p_store_id AND record.record_kind=''discount''","WHERE record.store_id=p_store_id AND record.record_kind=''discount'' AND NOT EXISTS(SELECT 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=record.id AND saas.promotion_is_deleted_v1(p_store_id,adopted.id))"]]'::jsonb),
 ('saas.promotion_legacy_resolve_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)','13eb43f25a3a8da180a99d7b79564511','[["  IF p_legacy_record_id IS NULL THEN RETURN QUERY SELECT ''invalid_input'',NULL::jsonb; RETURN; END IF;","  IF p_legacy_record_id IS NULL THEN RETURN QUERY SELECT ''invalid_input'',NULL::jsonb; RETURN; END IF;\n  IF EXISTS(SELECT 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=p_legacy_record_id AND saas.promotion_is_deleted_v1(p_store_id,adopted.id)) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;"]]'::jsonb),
 ('saas.promotion_lifecycle_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)','0de0b834be781e3c5cd7003c6080c47c','[["  SELECT * INTO v_operation FROM saas.promotion_operations","  IF saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  IF EXISTS(SELECT 1 FROM saas.promotion_deletions WHERE store_id=p_store_id AND operation_id=p_operation_id) THEN RETURN QUERY SELECT ''operation_mismatch'',NULL::jsonb; RETURN; END IF;\n  IF EXISTS(SELECT 1 FROM saas.promotion_operations op WHERE op.store_id=p_store_id AND op.operation_id=p_operation_id AND ((op.result_entity_kind=''promotion'' AND saas.promotion_is_deleted_v1(p_store_id,op.result_entity_id)) OR (op.result_entity_kind=''code_batch'' AND EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=op.result_entity_id AND saas.promotion_is_deleted_v1(p_store_id,batch.promotion_id))))) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  SELECT * INTO v_operation FROM saas.promotion_operations"],["  SELECT * INTO v_current FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id FOR UPDATE;\n","  SELECT * INTO v_current FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id FOR UPDATE;\n  IF saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n"]]'::jsonb),
 ('saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text[],integer)','4e9fc0758df05e4414a56d2d04a61c33','[["FROM saas.promotions WHERE store_id=p_store_id AND (p_search","FROM saas.promotions WHERE store_id=p_store_id AND NOT saas.promotion_is_deleted_v1(p_store_id,id) AND (p_search"]]'::jsonb),
 ('saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text[],text[],text[],text[],timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,timestamp with time zone,uuid)','ec852976d103473402840a2721cbe5bc','[["WHERE p.store_id=p_store_id AND p.created_at<=v_snapshot","WHERE p.store_id=p_store_id AND p.created_at<=v_snapshot AND NOT saas.promotion_is_deleted_v1(p_store_id,p.id)"]]'::jsonb),
 ('saas.promotion_projection(uuid,uuid)','d5781f0ae5436a91ba6dde7a6b5515cc','[["AND p.id=p_id","AND p.id=p_id AND NOT saas.promotion_is_deleted_v1(p_store_id,p_id)"]]'::jsonb),
 ('saas.promotion_recover_operation_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)','9b8f14a8cedcfa7203a7a65758d243c0','[["  IF v_operation.operation_kind<>p_kind THEN","  IF (v_operation.result_entity_kind=''promotion'' AND saas.promotion_is_deleted_v1(p_store_id,v_operation.result_entity_id)) OR (v_operation.result_entity_kind=''code_batch'' AND EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=v_operation.result_entity_id AND saas.promotion_is_deleted_v1(p_store_id,batch.promotion_id))) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  IF v_operation.operation_kind<>p_kind THEN"]]'::jsonb),
 ('saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)','c8c33a3fb1760ff63e18aa5d4f419003','[["  SELECT * INTO v_operation FROM saas.promotion_operations","  IF saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  IF EXISTS(SELECT 1 FROM saas.promotion_deletions WHERE store_id=p_store_id AND operation_id=p_operation_id) THEN RETURN QUERY SELECT ''operation_mismatch'',NULL::jsonb; RETURN; END IF;\n  IF EXISTS(SELECT 1 FROM saas.promotion_operations op WHERE op.store_id=p_store_id AND op.operation_id=p_operation_id AND ((op.result_entity_kind=''promotion'' AND saas.promotion_is_deleted_v1(p_store_id,op.result_entity_id)) OR (op.result_entity_kind=''code_batch'' AND EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=op.result_entity_id AND saas.promotion_is_deleted_v1(p_store_id,batch.promotion_id))))) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n  SELECT * INTO v_operation FROM saas.promotion_operations"],["  SELECT * INTO v_current FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id FOR UPDATE;\n","  SELECT * INTO v_current FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id FOR UPDATE;\n  IF saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) THEN RETURN QUERY SELECT ''not_found'',NULL::jsonb; RETURN; END IF;\n"]]'::jsonb),
 ('saas.store_engagement_campaign_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,boolean,jsonb)','a1534c7d6032e72e43d2f2925da21dce','[["  IF NOT EXISTS(SELECT 1 FROM saas.promotions WHERE store_id=p_store AND id=(p_config->>''promotionId'')::uuid) THEN RETURN QUERY SELECT ''invalid_reference'',NULL::jsonb;RETURN;END IF;","  IF NOT EXISTS(SELECT 1 FROM saas.promotions WHERE store_id=p_store AND id=(p_config->>''promotionId'')::uuid AND NOT saas.promotion_is_deleted_v1(p_store,(p_config->>''promotionId'')::uuid))\n  AND NOT(p_enabled=false AND p_campaign IS NOT NULL AND EXISTS(SELECT 1 FROM saas.store_engagement_campaigns prior WHERE prior.store_id=p_store AND prior.id=p_campaign AND prior.kind=p_kind AND prior.version=p_expected_version AND prior.config->''promotionId''=p_config->''promotionId''))\n  THEN RETURN QUERY SELECT ''invalid_reference'',NULL::jsonb;RETURN;END IF;"]]'::jsonb),
 ('saas.merchant_admin_archive_before_content_bodies(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)','25da0efbbb81d69a688431c175ed1b71','[["  IF r.id<>p_record_id OR op.payload_fingerprint<>p_fingerprint THEN","  IF r.record_kind=''discount'' THEN\n   PERFORM 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=r.id FOR SHARE;\n   IF EXISTS(SELECT 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=r.id AND saas.promotion_is_deleted_v1(p_store_id,adopted.id)) THEN RETURN QUERY SELECT ''record_not_found'',NULL::jsonb; RETURN; END IF;\n  END IF;\n  IF r.id<>p_record_id OR op.payload_fingerprint<>p_fingerprint THEN"],[" IF r.status=''archived'' OR r.version<>p_expected_version THEN","  IF r.record_kind=''discount'' THEN\n   PERFORM 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=r.id FOR SHARE;\n   IF EXISTS(SELECT 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=r.id AND saas.promotion_is_deleted_v1(p_store_id,adopted.id)) THEN RETURN QUERY SELECT ''record_not_found'',NULL::jsonb; RETURN; END IF;\n  END IF;\n IF r.status=''archived'' OR r.version<>p_expected_version THEN"]]'::jsonb),
 ('saas.merchant_admin_get_record_without_starter_theme(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid)','04220ce70fa66947be412878c6423ddf','[["    AND record.record_kind=p_kind;","    AND record.record_kind=p_kind\n    AND (p_kind IS DISTINCT FROM ''discount'' OR NOT EXISTS(SELECT 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=record.id AND saas.promotion_is_deleted_v1(p_store_id,adopted.id)));"]]'::jsonb),
 ('saas.merchant_admin_list_without_starter_theme(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)','f49750ab67adffb27cf2980599d9b8f0','[["WHERE store_id=p_store_id AND record_kind=p_kind AND status<>''archived'' ORDER BY updated_at DESC,id DESC LIMIT 200","WHERE store_id=p_store_id AND record_kind=p_kind AND status<>''archived'' AND (p_kind IS DISTINCT FROM ''discount'' OR NOT EXISTS(SELECT 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=merchant_admin_records.id AND saas.promotion_is_deleted_v1(p_store_id,adopted.id))) ORDER BY updated_at DESC,id DESC LIMIT 200"]]'::jsonb),
 ('saas.merchant_admin_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)','73478cceb975be1d270b31bd1eba1c79','[[" IF op.payload_fingerprint<>p_fingerprint THEN"," IF r.record_kind=''discount'' AND EXISTS(SELECT 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=r.id AND saas.promotion_is_deleted_v1(p_store_id,adopted.id)) THEN RETURN QUERY SELECT ''record_not_found'',NULL::jsonb; RETURN; END IF; IF op.payload_fingerprint<>p_fingerprint THEN"]]'::jsonb),
 ('saas.merchant_admin_save_without_category_showcase(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)','c4edd26d09dd20ede8b316fd9a75cba7','[["  IF current_record.id<>p_record_id OR op.payload_fingerprint<>p_fingerprint THEN","  IF current_record.record_kind=''discount'' THEN\n   PERFORM 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=current_record.id FOR SHARE;\n   IF EXISTS(SELECT 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=current_record.id AND saas.promotion_is_deleted_v1(p_store_id,adopted.id)) THEN RETURN QUERY SELECT ''record_not_found'',NULL::jsonb; RETURN; END IF;\n  END IF;\n  IF current_record.id<>p_record_id OR op.payload_fingerprint<>p_fingerprint THEN"],[" IF FOUND THEN IF current_record.record_kind<>p_kind THEN"," IF FOUND THEN\n  IF current_record.record_kind=''discount'' THEN\n   PERFORM 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=current_record.id FOR SHARE;\n   IF EXISTS(SELECT 1 FROM saas.promotions adopted WHERE adopted.store_id=p_store_id AND adopted.legacy_record_id=current_record.id AND saas.promotion_is_deleted_v1(p_store_id,adopted.id)) THEN RETURN QUERY SELECT ''record_not_found'',NULL::jsonb; RETURN; END IF;\n  END IF;\n IF current_record.record_kind<>p_kind THEN"]]'::jsonb)
 ) v(identity,expected_hash,pairs) LOOP
 f:=to_regprocedure(r.identity);IF f IS NULL THEN RAISE EXCEPTION 'PROMOTION_DELETE_NATIVE_MISSING:%',r.identity;END IF;
 SELECT pg_get_functiondef(f),proowner,proacl::text INTO orig,o,acl FROM pg_proc WHERE oid=f;
 IF md5(orig)<>r.expected_hash THEN RAISE EXCEPTION 'PROMOTION_DELETE_NATIVE_DRIFT:%',r.identity;END IF;
 d:=orig;
 FOR pair IN SELECT value FROM jsonb_array_elements(r.pairs) LOOP
  IF (length(d)-length(replace(d,pair->>0,'')))/length(pair->>0)<>1 THEN RAISE EXCEPTION 'PROMOTION_DELETE_PATCH_AMBIGUOUS:%',r.identity;END IF;
  d:=replace(d,pair->>0,pair->>1);
 END LOOP;
 EXECUTE d;
 IF(SELECT proowner<>o OR proacl::text IS DISTINCT FROM acl FROM pg_proc WHERE oid=f) THEN RAISE EXCEPTION 'PROMOTION_DELETE_NATIVE_AUTH_DRIFT:%',r.identity;END IF;
 INSERT INTO saas.promotion_deletion_function_baseline VALUES(r.identity,orig,r.expected_hash,md5(pg_get_functiondef(f)),o,acl);
 END LOOP;
END $patch$;
DO $access$ DECLARE r record;BEGIN
 FOR r IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('promotion_is_deleted_v1','promotion_delete_fingerprint_v1','promotion_delete_impact_projection_v1','promotion_delete_impact_v1','promotion_delete_recover_v1','promotion_delete_v1','promotion_deletion_write_guard_v1') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow',r.signature);
  IF r.proname IN('promotion_delete_impact_v1','promotion_delete_recover_v1','promotion_delete_v1') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',r.signature);END IF;
 END LOOP;
END $access$;
COMMIT;
