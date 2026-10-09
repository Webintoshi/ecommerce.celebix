BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $workflow$ DECLARE p record;batch jsonb;other jsonb;jid uuid;token uuid:='22600000-0000-4000-8000-000000000099';old_token uuid:='22600000-0000-4000-8000-000000000098';r jsonb;cursor text;payload jsonb;attempt int;amount int;
 store_a uuid:='22600000-0000-4000-8000-000000000001';store_b uuid:='22600000-0000-4000-8000-000000000002';conn_a uuid:='22600000-0000-4000-8000-000000000003';conn_b uuid:='22600000-0000-4000-8000-000000000004';envelope jsonb:='{"algorithm":"A256GCM","version":1,"keyId":"old-fixture","iv":"aaaa","tag":"aaaa","ciphertext":"aaaa"}';
BEGIN
 SELECT pl.id,pl.plan_code,pl.version INTO p FROM saas.plans pl JOIN saas.plan_features f ON f.plan_id=pl.id AND f.feature_key='integrations' AND f.enabled WHERE pl.status='active' ORDER BY pl.version DESC LIMIT 1;
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES(store_a,'Workflow A','workflow-email-a','active','tr','TRY','base',clock_timestamp(),clock_timestamp()),(store_b,'Workflow B','workflow-email-b','active','tr','TRY','base',clock_timestamp(),clock_timestamp());
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('22600000-0000-4000-8000-000000000005',store_a,p.id,p.plan_code,p.version,'active',clock_timestamp()-interval '1 day',clock_timestamp(),clock_timestamp()),('22600000-0000-4000-8000-000000000006',store_b,p.id,p.plan_code,p.version,'active',clock_timestamp()-interval '1 day',clock_timestamp(),clock_timestamp());
 INSERT INTO saas.email_marketing_connections(id,store_id,provider,account_id,account_name,list_id,list_name,status,sender_status,credential) VALUES(conn_a,store_a,'klaviyo','workflow-canonical-a','Fixture','list-a','A','connected','unknown',envelope),(conn_b,store_b,'brevo','workflow-canonical-b','Fixture','12','B','connected','unknown',envelope);
 PERFORM saas.email_marketing_append_event(store_a,'ada@example.test','grant','newsletter','source-a','v1',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day','v1');
 PERFORM saas.email_marketing_append_event(store_b,'bea@example.test','grant','newsletter','source-b','v1',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day','v1');
 UPDATE saas.email_marketing_connections SET export_sequence=1 WHERE id IN(conn_a,conn_b);
 PERFORM saas.email_marketing_request_sync(conn_a,1,clock_timestamp());PERFORM saas.email_marketing_request_sync(conn_b,1,clock_timestamp());
 payload:=jsonb_build_object('workerId','owner-net','token',token,'mode','full','limit',25);
 batch:=saas.email_marketing_work('claim',payload);IF jsonb_array_length(batch)<>2 OR (SELECT count(DISTINCT value->>'storeId') FROM jsonb_array_elements(batch))<>2 THEN RAISE EXCEPTION 'EMAIL_GLOBAL_CAP_OR_FAIRNESS';END IF;
 other:=saas.email_marketing_work('claim',payload||'{"workerId":"owner-site"}');IF other<>'[]'::jsonb THEN RAISE EXCEPTION 'EMAIL_SECOND_OWNER_MULTIPLIED_CAP';END IF;
 SELECT (value->>'id')::uuid INTO jid FROM jsonb_array_elements(batch) WHERE value->>'connectionId'=conn_a::text;
 r:=saas.email_marketing_work('checkpoint',jsonb_build_object('jobId',jid,'leaseToken',token,'result',jsonb_build_object('phase','dispatched','credentialVersion',1,'action','subscribe','state',jsonb_build_object('kind','absent','profileId',NULL))));IF r<>'true'::jsonb THEN RAISE EXCEPTION 'EMAIL_DISPATCH_REFUSED';END IF;
 r:=saas.email_marketing_work('checkpoint',jsonb_build_object('jobId',jid,'leaseToken',token,'result','{"phase":"accepted"}'::jsonb));
 UPDATE saas.email_marketing_connections SET credential=envelope||'{"keyId":"new-fixture"}',credential_version=2 WHERE id=conn_a;
 PERFORM saas.email_marketing_append_event(store_a,'ada@example.test','deny','customer','source-a','v2',clock_timestamp(),NULL,NULL);
 IF NOT EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs WHERE connection_id=conn_a AND email='ada@example.test' AND kind='unsubscribe') THEN RAISE EXCEPTION 'EMAIL_ACCEPTED_GRANT_LOST_RET';END IF;
 UPDATE saas.email_marketing_connections SET status='draining',generation=2 WHERE id=conn_a;
 r:=saas.email_marketing_work('finish',jsonb_build_object('jobId',jid,'leaseToken',token,'outcome','{"status":"attention","errorCode":"outcome_unknown"}'::jsonb));
 IF NOT EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs WHERE id=jid AND phase='accepted' AND status='attention' AND credential_snapshot->>'keyId'='old-fixture' AND credential_version=1) THEN RAISE EXCEPTION 'EMAIL_ROTATION_DESTROYED_DISPATCH_SNAPSHOT';END IF;
 UPDATE saas.email_marketing_sync_jobs SET available_at=clock_timestamp()-interval '1 second' WHERE id=jid;
 UPDATE saas.email_marketing_sync_jobs SET status='verified',lease_until=NULL,lease_token=NULL WHERE connection_id=conn_b;
 other:=saas.email_marketing_work('claim',payload||jsonb_build_object('workerId','owner-site','token',old_token,'mode','revoke_only'));
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(other) x WHERE x->>'id'=jid::text AND x->>'phase'='accepted' AND x->>'credentialVersion'='1' AND x->'credential'->>'keyId'='old-fixture') THEN RAISE EXCEPTION 'EMAIL_RECLAIM_REPEATED_OR_REBOUND_EFFECT';END IF;
 r:=saas.email_marketing_work('finish',jsonb_build_object('jobId',jid,'leaseToken',token,'outcome','{"status":"verified"}'::jsonb));IF r<>'false'::jsonb THEN RAISE EXCEPTION 'EMAIL_OLD_TOKEN_WROTE';END IF;
 UPDATE saas.email_marketing_sync_jobs SET lease_until=NULL WHERE id=jid;
 r:=saas.email_marketing_work('finish',jsonb_build_object('jobId',jid,'leaseToken',old_token,'outcome','{"status":"verified"}'::jsonb));IF r<>'false'::jsonb THEN RAISE EXCEPTION 'EMAIL_NULL_LEASE_WROTE';END IF;
 UPDATE saas.email_marketing_sync_jobs SET status='attention',lease_token=NULL,lease_until=NULL WHERE id=jid;
 UPDATE saas.email_marketing_sync_jobs SET status='verified',lease_token=NULL,lease_until=NULL WHERE connection_id=conn_a AND id<>jid;
 INSERT INTO saas.email_marketing_sync_jobs(id,store_id,connection_id,generation,credential_version,kind,status,lease_token,lease_until) VALUES('22600000-0000-4000-8000-000000000010',store_a,conn_a,2,2,'cleanup','running',token,clock_timestamp()+interval '90 seconds');
 r:=saas.email_marketing_work('cleanup',jsonb_build_object('jobId','22600000-0000-4000-8000-000000000010','leaseToken',token));
 IF NOT EXISTS(SELECT 1 FROM saas.email_marketing_connections WHERE id=conn_a AND status='draining' AND credential IS NOT NULL) THEN RAISE EXCEPTION 'EMAIL_UNKNOWN_EFFECT_CLOSED_DRAIN';END IF;
 -- A second finite manual batch imports all 205 legacy proofs without a cap.
 INSERT INTO saas.storefront_newsletter_subscribers(store_id,email_digest,normalized_email,status,consent_version,consented_at,version,created_at,updated_at)
 SELECT store_b,encode(sha256(convert_to('bootstrap-'||lpad(n::text,3,'0')||'@example.test','UTF8')),'hex'),'bootstrap-'||lpad(n::text,3,'0')||'@example.test','subscribed','legacy-proof',clock_timestamp()-interval '1 day',1,clock_timestamp()-interval '2 days',clock_timestamp() FROM generate_series(1,205)n;
 UPDATE saas.email_marketing_connections SET export_sequence=2 WHERE id=conn_b;
 PERFORM saas.email_marketing_request_sync(conn_b,2,clock_timestamp());
 IF (SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE connection_id=conn_b AND kind='profile' AND email LIKE 'bootstrap-%')<>205 THEN RAISE EXCEPTION 'EMAIL_MANUAL_IMPORT_SKIPPED_PROOF';END IF;
 PERFORM saas.email_marketing_request_sync(conn_b,2,clock_timestamp());
 IF (SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE connection_id=conn_b AND kind='profile' AND email LIKE 'bootstrap-%')<>205 THEN RAISE EXCEPTION 'EMAIL_MANUAL_IMPORT_DUPLICATED';END IF;
 -- Partial page advances cursor but never a completed suppression watermark.
 INSERT INTO saas.email_marketing_sync_jobs(id,store_id,connection_id,generation,credential_version,kind,status,lease_token,lease_until,progress) VALUES('22600000-0000-4000-8000-000000000012',store_b,conn_b,1,1,'reconcile','running',token,clock_timestamp()+interval '90 seconds',jsonb_build_object('pollStartedAt',saas.orders_json_timestamp(clock_timestamp()),'fullSweep',true));
 r:=saas.email_marketing_work('poll',jsonb_build_object('jobId','22600000-0000-4000-8000-000000000012','leaseToken',token,'page','{"events":[],"nextCursor":"next-page","completedThrough":null}'::jsonb));
 IF (SELECT suppression_checked_at IS NOT NULL OR poll_watermark IS NOT NULL FROM saas.email_marketing_connections WHERE id=conn_b) THEN RAISE EXCEPTION 'EMAIL_UNFINISHED_POLL_ADVANCED_WATERMARK';END IF;
 UPDATE saas.email_marketing_sync_jobs SET status='running',lease_token=token,lease_until=clock_timestamp()+interval '90 seconds' WHERE id='22600000-0000-4000-8000-000000000012';
 r:=saas.email_marketing_work('poll',jsonb_build_object('jobId','22600000-0000-4000-8000-000000000012','leaseToken',token,'page',jsonb_build_object('events','[]'::jsonb,'completedThrough',saas.orders_json_timestamp(clock_timestamp()))));
 IF NOT EXISTS(SELECT 1 FROM saas.email_marketing_connections WHERE id=conn_b AND suppression_checked_at IS NOT NULL AND poll_watermark IS NOT NULL AND full_sweep_at IS NOT NULL) THEN RAISE EXCEPTION 'EMAIL_FINISHED_POLL_MISSING_WATERMARK';END IF;
 r:=saas.email_marketing_work('event',jsonb_build_object('connectionId',conn_a,'eventId','other-list','eventTime',NULL,'event',jsonb_build_object('scope','list','listId','foreign','profileId','p1','email','ada@example.test','kind','suppressed')));IF r<>'"rejected"'::jsonb THEN RAISE EXCEPTION 'EMAIL_FOREIGN_LIST_RET_ACCEPTED';END IF;

 -- A list-specific denial preserves account consent and cannot queue a global revoke.
 INSERT INTO saas.email_marketing_contacts(store_id,connection_id,email,profile_id,consent_version,state) VALUES(store_b,conn_b,'bea@example.test','42',1,'verified');
 UPDATE saas.email_marketing_connections SET webhook_credential=envelope,webhook_hash=repeat('a',64),webhook_state='verified',webhook_id='123' WHERE id=conn_b;
 payload:=jsonb_build_array(jsonb_build_object('eventId','managed-list-denial','email','bea@example.test','kind','unsubscribe','scope','list','listId','12','eventTime',NULL));
 r:=saas.email_marketing_brevo_hook('panel.saas-staging.celebix.net',conn_b,repeat('b',64),payload);
 IF (r->>'authenticated')::boolean THEN RAISE EXCEPTION 'EMAIL_HOOK_BAD_SECRET';END IF;
 r:=saas.email_marketing_brevo_hook('panel.saas-staging.celebix.net',conn_b,repeat('a',64),payload);
 IF (r->>'recorded')::int<>1 OR (SELECT kind FROM saas.email_marketing_audience WHERE store_id=store_b AND email='bea@example.test')<>'grant' OR EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs WHERE connection_id=conn_b AND email='bea@example.test' AND kind='unsubscribe') OR NOT EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs WHERE connection_id=conn_b AND email='bea@example.test' AND kind='remove_membership') THEN RAISE EXCEPTION 'EMAIL_LIST_DENIAL_BECAME_GLOBAL';END IF;
 r:=saas.email_marketing_brevo_hook('panel.saas-staging.celebix.net',conn_b,repeat('a',64),payload);IF (r->>'recorded')::int<>0 THEN RAISE EXCEPTION 'EMAIL_HOOK_DUPLICATE';END IF;
 -- A stale membership removal read cannot close after a new corrective request.
 SELECT id INTO jid FROM saas.email_marketing_sync_jobs WHERE connection_id=conn_b AND email='bea@example.test' AND kind='remove_membership';
 UPDATE saas.email_marketing_sync_jobs SET status='running',lease_token=token,lease_until=clock_timestamp()+interval '90 seconds',progress=progress||'{"membershipEpoch":1}' WHERE id=jid;
 UPDATE saas.email_marketing_contacts SET membership_epoch=membership_epoch+1 WHERE connection_id=conn_b AND email='bea@example.test';
 r:=saas.email_marketing_work('finish',jsonb_build_object('jobId',jid,'leaseToken',token,'outcome','{"status":"verified"}'::jsonb));IF (SELECT status FROM saas.email_marketing_sync_jobs WHERE id=jid)<>'queued' OR (SELECT state FROM saas.email_marketing_contacts WHERE connection_id=conn_b AND email='bea@example.test')='removed' THEN RAISE EXCEPTION 'EMAIL_STALE_REMOVAL_CLOSED';END IF;
 -- Native dispatch also checks immutable list denial evidence.
 INSERT INTO saas.email_marketing_sync_jobs(id,store_id,connection_id,generation,credential_version,email,consent_version,kind,status,lease_token,lease_until,export_sequence,manual_audience) SELECT '22600000-0000-4000-8000-000000000015',store_b,conn_b,1,1,'bea@example.test',sequence,'subscribe','running',token,clock_timestamp()+interval '90 seconds',2,jsonb_build_object('kind','grant','sequence',sequence,'consentedAt',saas.orders_json_timestamp(consented_at),'source',source,'evidenceVersion',evidence_version) FROM saas.email_marketing_audience WHERE store_id=store_b AND email='bea@example.test';
 r:=saas.email_marketing_work('checkpoint',jsonb_build_object('jobId','22600000-0000-4000-8000-000000000015','leaseToken',token,'result','{"phase":"dispatched","credentialVersion":1,"action":"subscribe","state":{"kind":"absent"}}'::jsonb));IF r<>'false'::jsonb THEN RAISE EXCEPTION 'EMAIL_LIST_DENIAL_GRANT_DISPATCHED';END IF;
 -- A later explicit grant supersedes an unsent revoke under the audience lock.
 PERFORM saas.email_marketing_append_event(store_b,'new-grant@example.test','grant','newsletter','new-grant','1',clock_timestamp()-interval '3 hours',clock_timestamp()-interval '3 hours','v1');
 PERFORM saas.email_marketing_append_event(store_b,'new-grant@example.test','deny','customer','new-grant','2',clock_timestamp()-interval '2 hours',NULL,NULL);
 SELECT id INTO jid FROM saas.email_marketing_sync_jobs WHERE connection_id=conn_b AND email='new-grant@example.test' AND kind='unsubscribe';
 PERFORM saas.email_marketing_append_event(store_b,'new-grant@example.test','grant','newsletter','new-grant','3',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour','v2');
 UPDATE saas.email_marketing_sync_jobs SET status='running',lease_token=token,lease_until=clock_timestamp()+interval '90 seconds' WHERE id=jid;
 r:=saas.email_marketing_work('checkpoint',jsonb_build_object('jobId',jid,'leaseToken',token,'result','{"phase":"dispatched","credentialVersion":1,"action":"unsubscribe"}'::jsonb));IF r<>'false'::jsonb OR (SELECT phase FROM saas.email_marketing_sync_jobs WHERE id=jid)<>'queued' THEN RAISE EXCEPTION 'EMAIL_SUPERSEDED_REVOKE_DISPATCHED';END IF;
 -- The claimed key must still match at dispatch after a concurrent rotation.
 UPDATE saas.email_marketing_connections SET export_sequence=3 WHERE id=conn_b;
 PERFORM saas.email_marketing_request_sync(conn_b,3,clock_timestamp());
 SELECT id INTO jid FROM saas.email_marketing_sync_jobs WHERE connection_id=conn_b AND email='new-grant@example.test' AND kind='profile' ORDER BY consent_version DESC LIMIT 1;
 UPDATE saas.email_marketing_sync_jobs SET status='running',lease_token=token,lease_until=clock_timestamp()+interval '90 seconds' WHERE id=jid;
 UPDATE saas.email_marketing_connections SET credential_version=2,credential=envelope||'{"keyId":"new-fixture"}' WHERE id=conn_b;
 r:=saas.email_marketing_work('checkpoint',jsonb_build_object('jobId',jid,'leaseToken',token,'result','{"phase":"dispatched","credentialVersion":1,"action":"subscribe"}'::jsonb));IF r<>'false'::jsonb THEN RAISE EXCEPTION 'EMAIL_ROTATED_CLAIM_DISPATCHED';END IF;
 IF NOT has_function_privilege('celebix_saas_workflow','saas.email_marketing_work(text,jsonb)','EXECUTE') OR has_function_privilege('celebix_saas_app','saas.email_marketing_work(text,jsonb)','EXECUTE') OR has_table_privilege('celebix_saas_workflow','saas.email_marketing_rate_windows','SELECT') THEN RAISE EXCEPTION 'EMAIL_WORKFLOW_ACL';END IF;
END $workflow$;
ROLLBACK;
