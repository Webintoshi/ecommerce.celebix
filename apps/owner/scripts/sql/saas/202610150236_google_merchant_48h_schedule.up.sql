-- Private per-offer status cadence; first uploads and changed offers remain immediate.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE saas.google_merchant_236_backup(
 signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,
 function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE saas.google_merchant_236_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.google_merchant_236_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.google_merchant_236_backup FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
INSERT INTO saas.google_merchant_236_backup(signature,definition,original_sha256,function_oid,function_owner,function_acl)
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),p.oid,p.proowner,p.proacl
 FROM pg_proc p WHERE p.oid IN('saas.google_merchant_claim(timestamptz,integer,uuid)'::regprocedure,'saas.google_merchant_finish(uuid,uuid,bigint,bigint,uuid,timestamptz,text,text,jsonb)'::regprocedure);
ALTER TABLE saas.google_merchant_outbox ADD COLUMN next_status_check_at timestamptz CHECK(next_status_check_at IS NULL OR isfinite(next_status_check_at));
DO $patch$
DECLARE saved record;definition text;old_piece text;new_piece text;
 old_claim text:=$old_claim$  IF coalesce(same,false) THEN
   IF candidate.last_google_state='approved' THEN
    -- Exact acknowledged approval needs no network request until renewal.
    UPDATE saas.google_merchant_outbox SET state='approved',next_action='upsert',next_attempt_at=last_submitted_at+interval '25 days',attempts=0,updated_at=moment WHERE store_id=candidate.store_id AND variant_id=candidate.variant_id;
    CONTINUE;
   END IF;
   -- Reconcile a due submitted/limited/disapproved offer without resending it.
   -- The finish function schedules four hours only after an actual pending GET.
   UPDATE saas.google_merchant_outbox SET next_action='status',next_attempt_at=moment,attempts=0,updated_at=moment WHERE store_id=candidate.store_id AND variant_id=candidate.variant_id;
  END IF;$old_claim$;
 new_claim text:=$new_claim$  IF coalesce(same,false) THEN
   status_due:=least(coalesce(candidate.next_status_check_at,candidate.last_submitted_at+interval '48 hours'),candidate.last_submitted_at+interval '25 days');
   UPDATE saas.google_merchant_outbox SET state=coalesce(last_google_state,'submitted'),next_action='status',next_attempt_at=status_due,attempts=CASE WHEN status_due>moment THEN 0 ELSE attempts END,updated_at=moment WHERE store_id=candidate.store_id AND variant_id=candidate.variant_id;
   IF status_due>moment THEN CONTINUE;END IF;
  ELSE
   -- New, changed, reconnected and expiring offers keep the immediate upsert path.
   -- The existing job projection converts an invalidated offer into deletion.
   UPDATE saas.google_merchant_outbox SET next_action='upsert' WHERE store_id=candidate.store_id AND variant_id=candidate.variant_id;
  END IF;$new_claim$;
 old_action text:=$old_action$ next_action=CASE WHEN p_result='submitted' THEN 'status' WHEN p_result IN('approved','limited') THEN 'upsert' WHEN p_result IN('pending','disapproved') AND q.last_submitted_at IS NOT NULL AND q.last_submitted_at+interval '25 days'>moment THEN 'status' ELSE 'upsert' END,$old_action$;
 new_action text:=$new_action$ next_action=CASE WHEN p_result IN('submitted','pending','approved','limited','disapproved') THEN 'status' ELSE 'upsert' END,$new_action$;
 old_attempt text:=$old_attempt$ next_attempt_at=CASE WHEN p_result='submitted' THEN moment+interval '15 minutes' WHEN p_result IN('approved','limited') THEN coalesce(q.last_submitted_at+interval '25 days',moment) WHEN p_result='pending' THEN least(moment+interval '4 hours',coalesce(q.last_submitted_at+interval '25 days',moment)) WHEN p_result='disapproved' THEN least(moment+interval '1 day',coalesce(q.last_submitted_at+interval '25 days',moment)) ELSE moment+interval '25 days' END,updated_at=moment WHERE store_id=p_store AND variant_id=p_variant;$old_attempt$;
 new_attempt text:=$new_attempt$ next_attempt_at=CASE WHEN p_result='submitted' THEN moment+interval '48 hours' WHEN p_result IN('pending','approved','limited','disapproved') THEN least(moment+interval '48 hours',coalesce(q.last_submitted_at+interval '25 days',moment)) ELSE moment+interval '25 days' END,updated_at=moment WHERE store_id=p_store AND variant_id=p_variant;$new_attempt$;
 old_submission text:=$old_submission$ last_submitted_at=CASE WHEN p_result='submitted' THEN moment ELSE last_submitted_at END,$old_submission$;
 new_submission text:=$new_submission$ last_submitted_at=CASE WHEN p_result='submitted' THEN moment ELSE last_submitted_at END,
 next_status_check_at=CASE WHEN p_result IN('submitted','pending','approved','limited','disapproved') THEN moment+interval '48 hours' ELSE NULL END,$new_submission$;
BEGIN
 IF (SELECT count(*) FROM saas.google_merchant_236_backup)<>2 THEN RAISE EXCEPTION 'MERCHANT236_BACKUP_INVALID';END IF;
 FOR saved IN SELECT * FROM saas.google_merchant_236_backup LOOP
  definition:=saved.definition;
  IF position('lease_catalog_revision' IN definition)=0 OR position('p_connection_version' IN definition)=0 AND saved.signature LIKE 'saas.google_merchant_finish(%'
  THEN RAISE EXCEPTION 'MERCHANT236_LEASE_FENCE_DRIFT';END IF;
  IF saved.signature LIKE 'saas.google_merchant_claim(%' THEN
   IF position('google_merchant_delivery_control' IN definition)=0 OR position('saas.google_merchant_advance_catalog_batches(moment)' IN definition)=0
    OR position('LIMIT 100 FOR UPDATE OF q SKIP LOCKED LOOP' IN definition)=0 OR position('EXIT WHEN jsonb_array_length(claimed_keys)>=p_limit;' IN definition)=0
    OR position('c.version=q.connection_version AND c.credential IS NOT NULL' IN definition)=0
   THEN RAISE EXCEPTION 'MERCHANT236_CLAIM_FENCE_DRIFT';END IF;
   FOR old_piece,new_piece IN SELECT * FROM (VALUES
    ('candidate record;projection jsonb;same boolean;','candidate record;projection jsonb;same boolean;status_due timestamptz;'),
    ('same:=candidate.next_action=''upsert'' AND candidate.last_submission_connection_version=candidate.connection_version','same:=candidate.last_submission_connection_version=candidate.connection_version'),
    (old_claim,new_claim)) AS changes(old_value,new_value) LOOP
    IF (length(definition)-length(replace(definition,old_piece,'')))/length(old_piece)<>1 THEN RAISE EXCEPTION 'MERCHANT236_CLAIM_SOURCE_DRIFT';END IF;
    definition:=replace(definition,old_piece,new_piece);
   END LOOP;
  ELSE
   FOR old_piece,new_piece IN SELECT * FROM (VALUES(old_submission,new_submission),(old_action,new_action),(old_attempt,new_attempt)) AS changes(old_value,new_value) LOOP
    IF (length(definition)-length(replace(definition,old_piece,'')))/length(old_piece)<>1 THEN RAISE EXCEPTION 'MERCHANT236_FINISH_SOURCE_DRIFT';END IF;
    definition:=replace(definition,old_piece,new_piece);
   END LOOP;
  END IF;
  EXECUTE definition;
 END LOOP;
 UPDATE saas.google_merchant_236_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(function_oid),'UTF8')),'hex');
END $patch$;
-- This is a new scheduled deadline, not a fabricated Google read timestamp.
-- Dirty pending jobs and live leases keep their due time and generation.
DO $schedule$
DECLARE moment timestamptz:=clock_timestamp();
BEGIN
 UPDATE saas.google_merchant_outbox SET next_status_check_at=moment+interval '48 hours'
 WHERE last_submitted_at IS NOT NULL AND google_product_id IS NOT NULL AND last_export_fingerprint IS NOT NULL
  AND last_submission_connection_version=connection_version;
 UPDATE saas.google_merchant_outbox SET next_action='status',next_attempt_at=least(next_status_check_at,last_submitted_at+interval '25 days')
 WHERE state IN('submitted','approved','limited','disapproved') AND next_status_check_at IS NOT NULL;
END $schedule$;
COMMIT;
