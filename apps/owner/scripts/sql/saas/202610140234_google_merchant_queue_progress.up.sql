-- Separate bounded local reconciliation from the existing network-job limit.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE saas.google_merchant_234_backup(
 signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,
 function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE saas.google_merchant_234_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.google_merchant_234_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.google_merchant_234_backup FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
INSERT INTO saas.google_merchant_234_backup(signature,definition,original_sha256,function_oid,function_owner,function_acl)
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),p.oid,p.proowner,p.proacl
 FROM pg_proc p WHERE p.oid='saas.google_merchant_claim(timestamptz,integer,uuid)'::regprocedure;
DO $patch$
DECLARE definition text;old_scan text:='LIMIT p_limit FOR UPDATE OF q SKIP LOCKED LOOP';
 old_same text:=$old$  IF coalesce(same,false) THEN
   -- A tracked quantity change such as 12→11 with unchanged in_stock export costs no Google request.
   UPDATE saas.google_merchant_outbox SET state=coalesce(last_google_state,'submitted'),next_action=CASE WHEN last_google_state IN('approved','limited') THEN 'upsert' ELSE 'status' END,next_attempt_at=CASE WHEN last_google_state IN('approved','limited') THEN last_submitted_at+interval '25 days' ELSE least(moment+interval '4 hours',last_submitted_at+interval '25 days') END,attempts=0,updated_at=moment WHERE store_id=candidate.store_id AND variant_id=candidate.variant_id;
   CONTINUE;
  END IF;$old$;
 new_same text:=$new$  IF coalesce(same,false) THEN
   IF candidate.last_google_state='approved' THEN
    -- Exact acknowledged approval needs no network request until renewal.
    UPDATE saas.google_merchant_outbox SET state='approved',next_action='upsert',next_attempt_at=last_submitted_at+interval '25 days',attempts=0,updated_at=moment WHERE store_id=candidate.store_id AND variant_id=candidate.variant_id;
    CONTINUE;
   END IF;
   -- Reconcile a due submitted/limited/disapproved offer without resending it.
   -- The finish function schedules four hours only after an actual pending GET.
   UPDATE saas.google_merchant_outbox SET next_action='status',next_attempt_at=moment,attempts=0,updated_at=moment WHERE store_id=candidate.store_id AND variant_id=candidate.variant_id;
  END IF;$new$;
 old_append text:=$append$  claimed_keys:=claimed_keys||jsonb_build_array(jsonb_build_object('storeId',candidate.store_id,'variantId',candidate.variant_id));$append$;
BEGIN
 SELECT b.definition INTO STRICT definition FROM saas.google_merchant_234_backup b;
 IF position('google_merchant_delivery_control' IN definition)=0
  OR position('saas.google_merchant_advance_catalog_batches(moment)' IN definition)=0
  OR position('c.version=q.connection_version AND c.credential IS NOT NULL' IN definition)=0
  OR position('lease_catalog_revision=coalesce((SELECT revision FROM saas.google_merchant_catalog_revisions WHERE store_id=candidate.store_id),0)' IN definition)=0
  OR position('candidate.last_submission_connection_version=candidate.connection_version' IN definition)=0
  OR position('candidate.last_export_fingerprint=md5((projection->''offer'')::text)' IN definition)=0
 THEN RAISE EXCEPTION 'MERCHANT234_CLAIM_FENCE_DRIFT';END IF;
 IF (length(definition)-length(replace(definition,old_scan,'')))/length(old_scan)<>1
  OR (length(definition)-length(replace(definition,old_same,'')))/length(old_same)<>1
  OR (length(definition)-length(replace(definition,old_append,'')))/length(old_append)<>1
 THEN RAISE EXCEPTION 'MERCHANT234_CLAIM_SOURCE_DRIFT';END IF;
 definition:=replace(definition,old_scan,'LIMIT 100 FOR UPDATE OF q SKIP LOCKED LOOP');
 definition:=replace(definition,old_same,new_same);
 definition:=replace(definition,old_append,old_append||E'\n  EXIT WHEN jsonb_array_length(claimed_keys)>=p_limit;');
 EXECUTE definition;
 UPDATE saas.google_merchant_234_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(function_oid),'UTF8')),'hex');
END $patch$;
COMMIT;
