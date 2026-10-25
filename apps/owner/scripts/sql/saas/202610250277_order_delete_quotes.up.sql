-- Permanent order deletion may remove read-only quote preparation, never shipment authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.order-delete-quotes.release277',0));
DO $preflight$BEGIN
 IF to_regclass('saas.order_delete_quotes277_function_backup')IS NOT NULL THEN RAISE EXCEPTION 'ORDER_DELETE_QUOTES277_ALREADY_INSTALLED';END IF;
END $preflight$;
CREATE TABLE saas.order_delete_quotes277_function_backup(
 signature text PRIMARY KEY,function_oid oid NOT NULL,definition text NOT NULL,
 before_definition_sha text NOT NULL,after_definition_sha text NOT NULL,
 owner_oid oid NOT NULL,acl aclitem[],config text[],security_definer boolean NOT NULL,volatility "char" NOT NULL
);
ALTER TABLE saas.order_delete_quotes277_function_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_delete_quotes277_function_backup FORCE ROW LEVEL SECURITY;
CREATE POLICY order_delete_quotes277_owner ON saas.order_delete_quotes277_function_backup TO celebix_saas_owner USING(true)WITH CHECK(true);
REVOKE ALL ON saas.order_delete_quotes277_function_backup FROM PUBLIC;
DO $privacy$DECLARE role_name text;BEGIN
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
  EXECUTE format('REVOKE ALL ON saas.order_delete_quotes277_function_backup FROM %I',role_name);
 END LOOP;
END $privacy$;
DO $patch$DECLARE reviewed record;proc record;saved record;patched_definition text;anchor text;replacement text;BEGIN
 FOR reviewed IN SELECT *FROM(VALUES
  ('saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)','fb468a3acb086d49fdbc277796315561dc097f7dee3d42cade890c439a62d9ce','4d0aff86c32516560b29838b94b3f912edf2509e71c49b2729cac55814f11a17',true,'v'),
  ('saas.order_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)','17463828e29c9eff02fb559ce9558d61606218e31e3e98f02c238912359a0fae','02f7e8703024041b73d8d91a0d49cd139f6e66702ffd3369840f991ae8d65546',true,'s'),
  ('saas.shipping_fulfillment_guard_immutable()','6f6a3572fa2a865010db8b06c6f7a1e84b489c37e5786ab4b8e9ecc812a28f31','1307a3c5e52e512357adc4c57010284b71632860efd8cf37341c97e63750d66b',false,'v')
 )evidence(signature,sha256,after_sha256,definer,volatility)LOOP
  SELECT p.*,pg_get_functiondef(to_regprocedure(reviewed.signature))definition INTO proc FROM pg_proc p WHERE p.oid=to_regprocedure(reviewed.signature);
  IF proc.definition IS NULL OR encode(sha256(convert_to(proc.definition,'UTF8')),'hex')IS DISTINCT FROM reviewed.sha256
   OR proc.proowner IS DISTINCT FROM 'celebix_saas_owner'::regrole
   OR proc.proacl::text IS DISTINCT FROM(CASE WHEN reviewed.definer THEN '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'ELSE '{celebix_saas_owner=X/celebix_saas_owner}'END)
   OR proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR proc.prosecdef IS DISTINCT FROM reviewed.definer OR proc.provolatile::text IS DISTINCT FROM reviewed.volatility
  THEN RAISE EXCEPTION 'ORDER_DELETE_QUOTES277_PREDECESSOR_DRIFT:%',reviewed.signature;END IF;
  INSERT INTO saas.order_delete_quotes277_function_backup VALUES(reviewed.signature,proc.oid,proc.definition,reviewed.sha256,reviewed.after_sha256,proc.proowner,proc.proacl,proc.proconfig,proc.prosecdef,proc.provolatile);
 END LOOP;
 FOR saved IN SELECT *FROM saas.order_delete_quotes277_function_backup ORDER BY signature LOOP
  patched_definition:=saved.definition;
  IF saved.signature LIKE 'saas.delete_order(%'THEN
   anchor:=$old$  PERFORM pg_catalog.set_config('saas.permanent_delete_order',p_store_id::text||':'||p_order_id::text,true);$old$;
   replacement:=$new$  -- The order row is already locked, as in quote/shipment creation. Reject paid or uncertain shipment evidence before debt closure.
  IF EXISTS(SELECT 1 FROM saas.shipping_shipments WHERE store_id=p_store_id AND order_id=p_order_id)
   OR EXISTS(SELECT 1 FROM saas.shipping_fulfillment_operations WHERE store_id=p_store_id AND order_id=p_order_id AND operation_kind<>'begin_quote')
   OR EXISTS(SELECT 1 FROM saas.shipping_quote_sessions WHERE store_id=p_store_id AND order_id=p_order_id AND status='consumed')
   OR EXISTS(SELECT 1 FROM saas.shipping_fulfillment_jobs j JOIN saas.shipping_quote_sessions q ON q.store_id=j.store_id AND q.id=j.quote_id WHERE q.store_id=p_store_id AND q.order_id=p_order_id AND(j.job_kind<>'quote'OR j.shipment_id IS NOT NULL))
  THEN RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb;RETURN;END IF;
  -- Workers lock job then quote; expiry polling locks quote then job. Never wait on either side of that inversion.
  BEGIN
   PERFORM 1 FROM saas.shipping_fulfillment_jobs j JOIN saas.shipping_quote_sessions q ON q.store_id=j.store_id AND q.id=j.quote_id WHERE q.store_id=p_store_id AND q.order_id=p_order_id AND j.job_kind='quote'AND j.shipment_id IS NULL ORDER BY j.id FOR UPDATE OF j NOWAIT;
   PERFORM 1 FROM saas.shipping_quote_sessions WHERE store_id=p_store_id AND order_id=p_order_id ORDER BY id FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb;RETURN;
  END;
  PERFORM pg_catalog.set_config('saas.permanent_delete_order',p_store_id::text||':'||p_order_id::text,true);
  DELETE FROM saas.shipping_fulfillment_operations WHERE store_id=p_store_id AND order_id=p_order_id AND operation_kind='begin_quote';
  DELETE FROM saas.shipping_fulfillment_jobs WHERE store_id=p_store_id AND job_kind='quote'AND shipment_id IS NULL AND quote_id IN(SELECT id FROM saas.shipping_quote_sessions WHERE store_id=p_store_id AND order_id=p_order_id);
  DELETE FROM saas.shipping_quote_sessions WHERE store_id=p_store_id AND order_id=p_order_id;$new$;
  ELSIF saved.signature LIKE 'saas.order_deletion_impact(%'THEN
   anchor:=$old$'kind','shipping_records','count',(SELECT pg_catalog.count(*) FROM saas.shipping_shipments WHERE store_id=p_store_id AND order_id=p_order_id)$old$;
   replacement:=$new$'kind','shipping_records','count',((SELECT pg_catalog.count(*) FROM saas.shipping_shipments WHERE store_id=p_store_id AND order_id=p_order_id)+(SELECT pg_catalog.count(*) FROM saas.shipping_quote_sessions WHERE store_id=p_store_id AND order_id=p_order_id))$new$;
  ELSE
   anchor:=$old$BEGIN RAISE EXCEPTION 'SHIPPING_FULFILLMENT_IMMUTABLE'; END$old$;
   replacement:=$new$BEGIN
 IF TG_OP='DELETE'AND TG_TABLE_SCHEMA='saas'AND TG_TABLE_NAME='shipping_fulfillment_operations'AND current_user='celebix_saas_owner'THEN
  IF OLD.operation_kind='begin_quote'AND saas.permanent_order_deletion_context(OLD.store_id,OLD.order_id)IS TRUE
   AND NOT EXISTS(SELECT 1 FROM saas.shipping_shipments WHERE store_id=OLD.store_id AND order_id=OLD.order_id)
   AND NOT EXISTS(SELECT 1 FROM saas.shipping_fulfillment_operations WHERE store_id=OLD.store_id AND order_id=OLD.order_id AND operation_kind<>'begin_quote')
   AND NOT EXISTS(SELECT 1 FROM saas.shipping_quote_sessions WHERE store_id=OLD.store_id AND order_id=OLD.order_id AND status='consumed')
   AND NOT EXISTS(SELECT 1 FROM saas.shipping_fulfillment_jobs j JOIN saas.shipping_quote_sessions q ON q.store_id=j.store_id AND q.id=j.quote_id WHERE q.store_id=OLD.store_id AND q.order_id=OLD.order_id AND(j.job_kind<>'quote'OR j.shipment_id IS NOT NULL))
  THEN RETURN OLD;END IF;
 END IF;
 RAISE EXCEPTION 'SHIPPING_FULFILLMENT_IMMUTABLE';
END$new$;
  END IF;
  IF(length(patched_definition)-length(replace(patched_definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'ORDER_DELETE_QUOTES277_PATCH_DRIFT:%',saved.signature;END IF;
  patched_definition:=replace(patched_definition,anchor,replacement);
  IF encode(sha256(convert_to(patched_definition,'UTF8')),'hex')IS DISTINCT FROM saved.after_definition_sha THEN RAISE EXCEPTION 'ORDER_DELETE_QUOTES277_PATCH_RESULT_DRIFT:%:%',saved.signature,encode(sha256(convert_to(patched_definition,'UTF8')),'hex');END IF;
  EXECUTE patched_definition;
 END LOOP;
 FOR saved IN SELECT *FROM saas.order_delete_quotes277_function_backup LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid AND p.oid=to_regprocedure(saved.signature)
   AND encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex')=saved.after_definition_sha
   AND p.proowner=saved.owner_oid AND p.proacl IS NOT DISTINCT FROM saved.acl AND p.proconfig IS NOT DISTINCT FROM saved.config
   AND p.prosecdef=saved.security_definer AND p.provolatile=saved.volatility)
  THEN RAISE EXCEPTION 'ORDER_DELETE_QUOTES277_INSTALLED_FUNCTION_INVALID:%',saved.signature;END IF;
 END LOOP;
END $patch$;
COMMIT;
