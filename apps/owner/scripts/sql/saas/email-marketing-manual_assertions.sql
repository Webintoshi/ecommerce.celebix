-- A finite manual export; all data is synthetic and the transaction rolls back.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $manual$
DECLARE p record;r record;input jsonb;lease text;seq bigint;jid uuid;job jsonb;ok jsonb;saved_job jsonb;phase_name text;before_jobs integer;
 principal uuid:='23000000-0000-4000-8000-000000000001';store_a uuid:='23000000-0000-4000-8000-000000000002';member uuid:='23000000-0000-4000-8000-000000000003';conn uuid:='23000000-0000-4000-8000-000000000004';token uuid:='23000000-0000-4000-8000-000000000099';
 envelope jsonb:='{"algorithm":"A256GCM","version":1,"keyId":"fixture","iv":"aaaa","tag":"aaaa","ciphertext":"aaaa"}';
BEGIN
 SELECT pl.id,pl.plan_code,pl.version INTO p FROM saas.plans pl JOIN saas.plan_features f ON f.plan_id=pl.id AND f.feature_key='integrations' AND f.enabled WHERE pl.status='active' ORDER BY pl.version DESC LIMIT 1;
 INSERT INTO saas.principals VALUES(principal,'https://manual-email.invalid','manual-email','manual@example.test',true,clock_timestamp(),clock_timestamp());
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES(store_a,'Manual export','manual-email','active','tr','TRY','base',clock_timestamp(),clock_timestamp());
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES(member,principal,store_a,'store_owner','active',clock_timestamp(),clock_timestamp());
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('23000000-0000-4000-8000-000000000005',store_a,p.id,p.plan_code,p.version,'active',clock_timestamp()-interval '1 day',clock_timestamp(),clock_timestamp());
 INSERT INTO saas.email_marketing_connections(id,store_id,provider,account_id,account_name,list_id,list_name,status,sender_status,credential) VALUES(conn,store_a,'klaviyo','manual-account','Fixture','managed','Managed','connected','unknown',envelope);
 seq:=saas.email_marketing_append_event(store_a,'ada@example.test','grant','newsletter','ada','1',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day','newsletter-v1','Ada','Before');
 IF EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs WHERE connection_id=conn AND kind IN('profile','subscribe','bootstrap')) THEN RAISE EXCEPTION 'MANUAL_SOURCE_STARTED_EXPORT';END IF;
 -- Purchase/customer existence without evidence must never become an export grant.
 INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,version,created_at,updated_at) VALUES('23000000-0000-4000-8000-000000000006',store_a,'active','Only','Contract','contract@example.test',1,clock_timestamp(),clock_timestamp()),('23000000-0000-4000-8000-000000000008',store_a,'active','Legacy','Checkbox','checkbox@example.test',1,clock_timestamp(),clock_timestamp());
 INSERT INTO saas.customer_consents VALUES(store_a,'23000000-0000-4000-8000-000000000008','email','granted',clock_timestamp());
 -- Legacy newsletter evidence must be captured too, with no 200-person cap.
 INSERT INTO saas.storefront_newsletter_subscribers(store_id,email_digest,normalized_email,status,consent_version,consented_at,version,created_at,updated_at)
 SELECT store_a,encode(sha256(convert_to('legacy-'||n||'@example.test','UTF8')),'hex'),'legacy-'||n||'@example.test','subscribed','legacy-v1',clock_timestamp()-interval '1 day',1,clock_timestamp()-interval '2 days',clock_timestamp() FROM generate_series(1,205)n;
 input:=jsonb_build_object('kind','sync','operationId','23000000-0000-4000-8000-000000000010','connectionId',conn,'expectedVersion',1,'fingerprint',repeat('a',64));
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member,p.id,p.plan_code,p.version,clock_timestamp(),'claim',input);
 IF r.outcome<>'claimed' THEN RAISE EXCEPTION 'MANUAL_CLAIM:%',r.outcome;END IF;lease:=r.result_payload->>'leaseToken';
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member,p.id,p.plan_code,p.version,clock_timestamp(),'finalize',jsonb_build_object('operationId',input->>'operationId','leaseToken',lease));
 IF r.outcome<>'saved' OR r.result_payload->>'version'<>'2' THEN RAISE EXCEPTION 'MANUAL_FINALIZE:%',r.outcome;END IF;
 IF (SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE connection_id=conn AND kind='profile')<>206 OR EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs WHERE connection_id=conn AND email IN('contract@example.test','checkbox@example.test')) THEN RAISE EXCEPTION 'MANUAL_PROOF_SCOPE';END IF;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member,p.id,p.plan_code,p.version,clock_timestamp(),'claim',input);
 IF r.outcome<>'replayed' OR r.result_payload->>'version'<>'2' OR (SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE connection_id=conn AND kind='profile')<>206 THEN RAISE EXCEPTION 'MANUAL_REPLAY_DUPLICATED';END IF;
 input:=input||jsonb_build_object('operationId','23000000-0000-4000-8000-000000000011','expectedVersion',2);
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member,p.id,p.plan_code,p.version,clock_timestamp(),'claim',input);
 IF r.outcome<>'cleanup_pending' THEN RAISE EXCEPTION 'MANUAL_OVERLAPPING_BATCH:%',r.outcome;END IF;
 -- Later source grants and name corrections wait for the next click.
 PERFORM saas.email_marketing_append_event(store_a,'later@example.test','grant','newsletter','later','1',clock_timestamp(),clock_timestamp(),'newsletter-v1');
 UPDATE saas.email_marketing_audience SET last_name='After' WHERE store_id=store_a AND email='ada@example.test';
 SELECT id INTO jid FROM saas.email_marketing_sync_jobs WHERE connection_id=conn AND email='ada@example.test' AND kind='profile';
 UPDATE saas.email_marketing_sync_jobs SET status='running',lease_token=token,lease_until=clock_timestamp()+interval '90 seconds' WHERE id=jid;
 job:=saas.email_marketing_job_projection(jid);
 IF job->'audience'->>'lastName' IS DISTINCT FROM 'Before' OR EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs WHERE connection_id=conn AND email='later@example.test') THEN RAISE EXCEPTION 'MANUAL_SNAPSHOT_CHANGED';END IF;
 ok:=saas.email_marketing_work('checkpoint',jsonb_build_object('jobId',jid,'leaseToken',token,'result','{"phase":"dispatched","credentialVersion":1,"action":"update_profile","state":{"kind":"known","profileId":"ada","marketingStatus":"subscribed"}}'::jsonb));
 IF ok<>'true'::jsonb THEN RAISE EXCEPTION 'MANUAL_DISPATCH';END IF;
 -- Accepted and unknown effects cannot be reset by another manual request.
 FOREACH phase_name IN ARRAY ARRAY['accepted','unknown'] LOOP
  UPDATE saas.email_marketing_sync_jobs SET phase=phase_name,status='attention' WHERE id=jid;
  SELECT to_jsonb(j) INTO saved_job FROM saas.email_marketing_sync_jobs j WHERE id=jid;
  SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member,p.id,p.plan_code,p.version,clock_timestamp(),'claim',input);
  IF r.outcome IS DISTINCT FROM 'cleanup_pending' OR (SELECT to_jsonb(j) FROM saas.email_marketing_sync_jobs j WHERE id=jid) IS DISTINCT FROM saved_job OR (SELECT export_sequence FROM saas.email_marketing_connections WHERE id=conn)<>1 OR (SELECT version FROM saas.email_marketing_connections WHERE id=conn)<>2 THEN RAISE EXCEPTION 'MANUAL_UNKNOWN_CLAIM_MUTATED';END IF;
 END LOOP;
 UPDATE saas.email_marketing_sync_jobs SET status='running' WHERE id=jid;
 PERFORM saas.email_marketing_work('finish',jsonb_build_object('jobId',jid,'leaseToken',token,'outcome','{"status":"verified","profileUpdated":true}'::jsonb));
 IF (SELECT progress->>'profileUpdated' FROM saas.email_marketing_sync_jobs WHERE id=jid) IS DISTINCT FROM 'true' OR saas.email_marketing_job_projection(jid)->'audience'->>'lastName' IS DISTINCT FROM 'Before' THEN RAISE EXCEPTION 'MANUAL_CONTINUATION_FOLLOWED_LIVE_NAME';END IF;
 -- Live denial still closes a previously requested positive intent.
 PERFORM saas.email_marketing_append_event(store_a,'ada@example.test','deny','customer','ada','2',clock_timestamp(),NULL,NULL);
 UPDATE saas.email_marketing_sync_jobs SET status='running',lease_token=token,lease_until=clock_timestamp()+interval '90 seconds' WHERE id=jid;
 ok:=saas.email_marketing_work('checkpoint',jsonb_build_object('jobId',jid,'leaseToken',token,'result','{"phase":"dispatched","credentialVersion":1,"action":"add_membership"}'::jsonb));
 IF ok<>'false'::jsonb OR NOT EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs WHERE connection_id=conn AND email='ada@example.test' AND kind='unsubscribe') THEN RAISE EXCEPTION 'MANUAL_DENIAL_IGNORED';END IF;
 -- A subsequent explicit run gets new jobs rather than resetting old evidence.
 UPDATE saas.email_marketing_sync_jobs SET status='verified',lease_token=NULL,lease_until=NULL WHERE connection_id=conn;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member,p.id,p.plan_code,p.version,clock_timestamp(),'claim',input);
 IF r.outcome<>'claimed' THEN RAISE EXCEPTION 'MANUAL_SECOND_CLAIM:%',r.outcome;END IF;lease:=r.result_payload->>'leaseToken';
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member,p.id,p.plan_code,p.version,clock_timestamp(),'finalize',jsonb_build_object('operationId',input->>'operationId','leaseToken',lease));
 IF r.outcome<>'saved' OR r.result_payload->>'version'<>'3' OR (SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE connection_id=conn AND email='legacy-1@example.test' AND kind='profile')<>2 OR NOT EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs WHERE connection_id=conn AND email='later@example.test' AND kind='profile') THEN RAISE EXCEPTION 'MANUAL_SECOND_RUN_SKIPPED';END IF;
 -- The final write rechecks uncertainty too, after the command claim.
 UPDATE saas.email_marketing_sync_jobs SET status='verified',lease_token=NULL,lease_until=NULL WHERE connection_id=conn;
 input:=input||jsonb_build_object('operationId','23000000-0000-4000-8000-000000000012','expectedVersion',3);
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member,p.id,p.plan_code,p.version,clock_timestamp(),'claim',input);
 IF r.outcome IS DISTINCT FROM 'claimed' THEN RAISE EXCEPTION 'MANUAL_FINAL_FENCE_CLAIM';END IF;lease:=r.result_payload->>'leaseToken';
 SELECT count(*) INTO before_jobs FROM saas.email_marketing_sync_jobs WHERE connection_id=conn;
 FOREACH phase_name IN ARRAY ARRAY['accepted','unknown'] LOOP
  UPDATE saas.email_marketing_sync_jobs SET phase=phase_name,status='attention' WHERE id=jid;
  SELECT to_jsonb(j) INTO saved_job FROM saas.email_marketing_sync_jobs j WHERE id=jid;
  SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member,p.id,p.plan_code,p.version,clock_timestamp(),'finalize',jsonb_build_object('operationId',input->>'operationId','leaseToken',lease));
  IF r.outcome IS DISTINCT FROM 'cleanup_pending' OR (SELECT to_jsonb(j) FROM saas.email_marketing_sync_jobs j WHERE id=jid) IS DISTINCT FROM saved_job OR (SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE connection_id=conn)<>before_jobs OR (SELECT export_sequence FROM saas.email_marketing_connections WHERE id=conn)<>2 OR (SELECT version FROM saas.email_marketing_connections WHERE id=conn)<>3 THEN RAISE EXCEPTION 'MANUAL_UNKNOWN_FINALIZE_MUTATED';END IF;
 END LOOP;
END $manual$;
ROLLBACK;
