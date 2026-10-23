BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.trendyol.release267',0));

CREATE TABLE saas.trendyol267_backup(signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,owner_id oid NOT NULL,acl aclitem[],config text[]);
ALTER TABLE saas.trendyol267_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.trendyol267_backup FORCE ROW LEVEL SECURITY;
CREATE POLICY trendyol267_owner ON saas.trendyol267_backup TO celebix_saas_owner USING(true)WITH CHECK(true);
REVOKE ALL ON saas.trendyol267_backup FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability;
CREATE INDEX trendyol_jobs_pending_batch ON saas.trendyol_jobs(store_id)WHERE kind='batch'AND state IN('queued','leased');

CREATE FUNCTION saas.trendyol_variant_pending_batch(p_store uuid,p_variant uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.trendyol_jobs q WHERE q.store_id=p_store AND q.kind='batch'AND q.state IN('queued','leased')AND q.payload->'items'@>jsonb_build_array(jsonb_build_object('variantId',p_variant)))
$f$;

-- Reconnect only polls the retained remote batch. Its old accepted payload is not
-- evidence that the current price/stock target has ever been submitted.
CREATE FUNCTION saas.trendyol_rebase_batches(p_store uuid,p_now timestamptz)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE c saas.trendyol_connections;BEGIN
 SELECT * INTO c FROM saas.trendyol_connections WHERE store_id=p_store;
 UPDATE saas.trendyol_jobs q SET state='queued',connection_version=c.version,generation=c.generation,lease_id=NULL,lease_until=NULL,next_at=least(q.next_at,p_now),updated_at=p_now,
 payload=jsonb_set(jsonb_set(q.payload,'{items}',coalesce((SELECT jsonb_agg((x-'fingerprint')||jsonb_build_object('mappingVersion',l.version,'requiresInventory',true))FROM jsonb_array_elements(coalesce(q.payload->'items','[]'))x JOIN saas.trendyol_listings l ON l.store_id=q.store_id AND l.variant_id=(x->>'variantId')::uuid),'[]')),'{outcomes}',coalesce((SELECT jsonb_agg((x-'fingerprint')||jsonb_build_object('mappingVersion',l.version,'requiresInventory',true))FROM jsonb_array_elements(coalesce(q.payload->'outcomes','[]'))x JOIN saas.trendyol_listings l ON l.store_id=q.store_id AND l.variant_id=(x->>'variantId')::uuid),'[]'))
 WHERE q.store_id=p_store AND q.kind='batch'AND(q.state IN('queued','leased','cancelled')OR(q.state='failed'AND nullif(btrim(q.payload->>'batchId'),'')IS NOT NULL));
 UPDATE saas.trendyol_listings l SET last_payload_fingerprint=NULL WHERE l.store_id=p_store AND saas.trendyol_variant_pending_batch(l.store_id,l.variant_id);
END $f$;
REVOKE ALL ON FUNCTION saas.trendyol_variant_pending_batch(uuid,uuid),saas.trendyol_rebase_batches(uuid,timestamptz)FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability;

DO $patch$
DECLARE sig text;source text;old_fragment text;new_fragment text;fragments text[];n integer;r record;expected text;
BEGIN
 FOREACH sig IN ARRAY ARRAY['saas.trendyol_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)','saas.trendyol_workflow(text,jsonb,timestamptz)']LOOP
  SELECT pg_get_functiondef(p.oid)definition,p.proowner,p.proacl,p.proconfig INTO r FROM pg_proc p WHERE p.oid=sig::regprocedure;
  expected:=CASE WHEN sig LIKE 'saas.trendyol_command%'THEN '21ec3c05995bfcac47f5cd5663c5f0da97446398d8c2aa8e96910f8ccf7b9f00'ELSE '8b1003b71ac507789a43698893a8590e528fb72354eb22dd7e3b639a13d8221c'END;
  IF encode(sha256(convert_to(r.definition,'UTF8')),'hex')IS DISTINCT FROM expected OR r.proowner<>'celebix_saas_owner'::regrole OR r.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]THEN RAISE EXCEPTION 'TRENDYOL267_PREDECESSOR_DRIFT';END IF;
  INSERT INTO saas.trendyol267_backup VALUES(sig,r.definition,expected,NULL,r.proowner,r.proacl,r.proconfig);
  source:=r.definition;
  IF sig LIKE 'saas.trendyol_command%'THEN
   fragments:=ARRAY[
    $o$WHERE store_id=p_store_id AND state IN('queued','leased');$o$,$n$WHERE store_id=p_store_id AND state IN('queued','leased')AND kind<>'batch';$n$,
    $o$provider_submitted=CASE WHEN status='submitted'THEN false ELSE provider_submitted END$o$,$n$provider_submitted=provider_submitted$n$,
    $o$PERFORM saas.trendyol_enqueue(p_store_id,'orders','{}',p_now);PERFORM saas.trendyol_enqueue(p_store_id,'catalog','{}',p_now);PERFORM saas.trendyol_enqueue(p_store_id,'setup','{}',p_now);$o$,$n$PERFORM saas.trendyol_rebase_batches(p_store_id,p_now);PERFORM saas.trendyol_enqueue(p_store_id,'orders','{}',p_now);PERFORM saas.trendyol_enqueue(p_store_id,'catalog','{}',p_now);PERFORM saas.trendyol_enqueue(p_store_id,'setup','{}',p_now);$n$,
    $o$IF previous.mapping->>'barcode'IS DISTINCT FROM p_input->>'barcode'AND((previous.provider_submitted$o$,$n$IF previous.mapping->>'barcode'IS DISTINCT FROM p_input->>'barcode'AND(previous.issue='provider_outcome_unknown'OR saas.trendyol_variant_pending_batch(p_store_id,v.id)OR(previous.provider_submitted$n$,
    $o$version=saas.trendyol_listings.version+1,issue=NULL,updated_at=p_now;$o$,$n$version=saas.trendyol_listings.version+1,issue=CASE WHEN saas.trendyol_listings.issue='provider_outcome_unknown'THEN saas.trendyol_listings.issue ELSE NULL END,updated_at=p_now;$n$
   ];
  ELSE
   fragments:=ARRAY[
    $o$WHERE store_id=j.store_id AND status='queued'ORDER BY variant_id LIMIT 50$o$,$n$WHERE store_id=j.store_id AND status='queued'AND NOT saas.trendyol_variant_pending_batch(store_id,variant_id)ORDER BY variant_id LIMIT 50$n$,
    $o$j.payload:=jsonb_build_object('items',items);$o$,$n$IF jsonb_array_length(items)=0 THEN
     IF EXISTS(SELECT 1 FROM saas.trendyol_listings WHERE store_id=j.store_id AND status='queued')THEN
      SELECT min(CASE WHEN state='leased'THEN lease_until ELSE next_at END)INTO next_time FROM saas.trendyol_jobs WHERE store_id=j.store_id AND kind='batch'AND state IN('queued','leased');
      UPDATE saas.trendyol_jobs SET next_at=CASE WHEN next_time IS NULL OR next_time<=p_now THEN p_now+interval '60 seconds'ELSE least(next_time,p_now+interval '60 seconds')END,updated_at=p_now WHERE id=j.id;
     ELSE UPDATE saas.trendyol_jobs SET state='completed',lease_id=NULL,lease_until=NULL,updated_at=p_now WHERE id=j.id;END IF;
     CONTINUE;
    END IF;
    j.payload:=jsonb_build_object('items',items);$n$,
    $o$IF p_action IN('read','dispatch')AND j.kind='catalog'AND EXISTS$o$,$n$IF p_action IN('read','dispatch')AND j.kind='catalog'AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(j.payload->'items','[]'))x WHERE saas.trendyol_variant_pending_batch(j.store_id,(x->>'variantId')::uuid))THEN
  UPDATE saas.trendyol_jobs SET state='queued',lease_id=NULL,lease_until=NULL,next_at=p_now+interval '60 seconds',updated_at=p_now WHERE id=j.id;
  RETURN QUERY SELECT 'stale',NULL::jsonb;RETURN;
 END IF;
 IF p_action IN('read','dispatch')AND j.kind='catalog'AND EXISTS$n$,
    $o$UPDATE saas.trendyol_jobs SET payload=payload||jsonb_build_object('dispatchStarted',true),updated_at=p_now WHERE id=j.id;$o$,$n$UPDATE saas.trendyol_listings SET last_payload_fingerprint=NULL WHERE store_id=j.store_id AND variant_id IN(SELECT(x->>'variantId')::uuid FROM jsonb_array_elements(coalesce(j.payload->'items','[]'))x);UPDATE saas.trendyol_jobs SET payload=payload||jsonb_build_object('dispatchStarted',true),updated_at=p_now WHERE id=j.id;$n$,
    $o$ELSIF p_action='defer'THEN
  UPDATE$o$,$n$ELSIF p_action='defer'THEN
  IF j.kind='batch'AND p_input->>'code'IN('provider_outcome_unknown','provider_rejected','provider_denied','invalid_input','needs_reconnect','order_evidence_invalid')THEN p_input:=jsonb_set(p_input,'{code}','"provider_outcome_unknown"');END IF;
  UPDATE$n$,
    $o$AND version_value IS NOT NULL AND version=version_value;$o$,$n$AND version_value IS NOT NULL AND(version=version_value OR(row->>'status'='failed'AND row->>'issue'='provider_outcome_unknown'));$n$
   ];
  END IF;
  FOR n IN 1..array_length(fragments,1)BY 2 LOOP
   old_fragment:=fragments[n];new_fragment:=fragments[n+1];
   IF (length(source)-length(replace(source,old_fragment,'')))/length(old_fragment)<>(CASE WHEN sig LIKE 'saas.trendyol_command%'AND n=1 THEN 2 ELSE 1 END)THEN RAISE EXCEPTION 'TRENDYOL267_PATCH_FRAGMENT_%_%',sig,n;END IF;
   source:=replace(source,old_fragment,new_fragment);
  END LOOP;
  -- Disconnect suspends remote read reconciliation but retains its evidence.
  IF sig LIKE 'saas.trendyol_command%'THEN
   old_fragment:=$o$ELSIF p_action='disconnect'THEN UPDATE saas.trendyol_connections SET connected=false,generation=generation+1,updated_at=p_now WHERE store_id=p_store_id;UPDATE saas.trendyol_jobs SET state='cancelled',lease_id=NULL,lease_until=NULL WHERE store_id=p_store_id AND state IN('queued','leased')AND kind<>'batch';$o$;
   new_fragment:=replace(old_fragment,$o$ELSIF p_action='disconnect'THEN $o$,$n$ELSIF p_action='disconnect'THEN UPDATE saas.trendyol_listings SET issue='provider_outcome_unknown',status='failed',updated_at=p_now WHERE store_id=p_store_id AND variant_id IN(SELECT(x->>'variantId')::uuid FROM saas.trendyol_jobs q CROSS JOIN LATERAL jsonb_array_elements(coalesce(q.payload->'items','[]'))x WHERE q.store_id=p_store_id AND q.kind='catalog'AND q.state='leased'AND q.payload->>'dispatchStarted'='true');$n$)||$n$UPDATE saas.trendyol_jobs SET state='queued',lease_id=NULL,lease_until=NULL,updated_at=p_now WHERE store_id=p_store_id AND kind='batch'AND state IN('queued','leased');$n$;
   IF strpos(source,old_fragment)=0 THEN RAISE EXCEPTION 'TRENDYOL267_DISCONNECT_FRAGMENT';END IF;source:=replace(source,old_fragment,new_fragment);
  END IF;
  EXECUTE source;
  UPDATE saas.trendyol267_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex')WHERE signature=sig;
 END LOOP;
END $patch$;
COMMIT;
