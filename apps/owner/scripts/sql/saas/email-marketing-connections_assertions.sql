-- Disposable PostgreSQL16 only. Native synthetic fixture rolls back.
BEGIN;
DO $proof$
DECLARE t text;sig regprocedure;plan record;r record;s record;payload jsonb;token text;c_id uuid;before_rows bigint;fixture_customer_id uuid:='22400000-0000-4000-8000-000000000080';page jsonb;cursor text;grant_time timestamptz:=clock_timestamp()-interval '1 hour';operator_row record;support_member uuid:='22400000-0000-4000-8000-000000000033';support_session uuid:='22400000-0000-4000-8000-000000000032';
 principal uuid:='22400000-0000-4000-8000-000000000001';store_a uuid:='22400000-0000-4000-8000-000000000002';store_b uuid:='22400000-0000-4000-8000-000000000003';member_a uuid:='22400000-0000-4000-8000-000000000004';member_b uuid:='22400000-0000-4000-8000-000000000005';moment timestamptz:=clock_timestamp();
 envelope jsonb:='{"algorithm":"A256GCM","version":1,"keyId":"fixture","iv":"aaaa","tag":"aaaa","ciphertext":"aaaa"}';
BEGIN
 IF current_database()<>'email_marketing_isolated' OR current_setting('listen_addresses')<>'' THEN RAISE EXCEPTION 'EMAIL_ISOLATED_ONLY';END IF;
 FOREACH t IN ARRAY ARRAY['email_marketing_connections','email_marketing_candidates','email_marketing_operations','email_marketing_contacts','email_marketing_consent_events','email_marketing_audience','email_marketing_sync_jobs','email_marketing_inbound_events','email_marketing_rate_windows'] LOOP
  IF has_table_privilege('celebix_saas_app','saas.'||t,'SELECT') OR has_table_privilege('celebix_saas_app','saas.'||t,'INSERT') OR has_table_privilege('celebix_saas_workflow','saas.'||t,'SELECT') THEN RAISE EXCEPTION 'EMAIL_PRIVATE_TABLE_LEAK:%',t;END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||t)::regclass AND relrowsecurity AND relforcerowsecurity) OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('saas.'||t)::regclass AND tgname='platform_support_atomic_journal') THEN RAISE EXCEPTION 'EMAIL_TABLE_AUTHORITY:%',t;END IF;
 END LOOP;
 FOR sig IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'email_marketing_%' LOOP
  IF has_function_privilege('public',sig,'EXECUTE') OR (has_function_privilege('celebix_saas_host_resolver',sig,'EXECUTE') AND sig::text NOT LIKE 'saas.email_marketing_newsletter_subscribe(%' AND sig::text NOT LIKE 'saas.email_marketing_contact_capture(%' AND sig::text NOT LIKE 'saas.email_marketing_brevo_hook(%') THEN RAISE EXCEPTION 'EMAIL_FUNCTION_LEAK:%',sig;END IF;
 END LOOP;
 SELECT p.id,p.plan_code,p.version INTO plan FROM saas.plans p JOIN saas.plan_features f ON f.plan_id=p.id AND f.feature_key='integrations' AND f.enabled WHERE p.status='active' AND p.valid_from<=moment AND(p.valid_until IS NULL OR p.valid_until>moment) ORDER BY p.version DESC LIMIT 1;
 IF plan.id IS NULL THEN RAISE EXCEPTION 'EMAIL_FIXTURE_PLAN_MISSING';END IF;
 INSERT INTO saas.principals VALUES(principal,'https://email-fixture.invalid','email-fixture','email-fixture@example.test',true,moment,moment);
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES(store_a,'Email fixture A','email-fixture-a','active','tr','TRY','base',moment,moment),(store_b,'Email fixture B','email-fixture-b','active','tr','TRY','base',moment,moment);
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES(member_a,principal,store_a,'store_owner','active',moment,moment),(member_b,principal,store_b,'store_owner','active',moment,moment);
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('22400000-0000-4000-8000-000000000006',store_a,plan.id,plan.plan_code,plan.version,'active',moment-interval '1 day',moment,moment),('22400000-0000-4000-8000-000000000007',store_b,plan.id,plan.plan_code,plan.version,'active',moment-interval '1 day',moment,moment);
 IF to_regprocedure('saas.email_marketing_customers_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,jsonb,jsonb)') IS NULL THEN RAISE EXCEPTION 'EMAIL_CONSENT_WRAPPER_MISSING';END IF;
 SELECT count(*) INTO before_rows FROM saas.email_marketing_operations;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'overview','{}');
 IF r.outcome<>'found' OR r.result_payload->'connections'<>'[]'::jsonb OR (SELECT count(*) FROM saas.email_marketing_operations)<>before_rows THEN RAISE EXCEPTION 'EMAIL_OVERVIEW_MUTATED';END IF;
 payload:=jsonb_build_object('kind','validate','operationId','22400000-0000-4000-8000-000000000010','connectionId','22400000-0000-4000-8000-000000000011','candidateId','22400000-0000-4000-8000-000000000012','provider','brevo','sessionHash',repeat('b',64),'fingerprint',repeat('f',64),'expectedVersion',0,'credential',envelope);
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'claimed' THEN RAISE EXCEPTION 'EMAIL_VALIDATION_CLAIM:%',r.outcome;END IF;token:=r.result_payload->>'leaseToken';
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'finalize',jsonb_build_object('operationId',payload->>'operationId','leaseToken',token,'account',jsonb_build_object('id','canonical-org','name','Fixture','senderStatus','unknown'),'lists','[]'::jsonb));IF r.outcome<>'saved' THEN RAISE EXCEPTION 'EMAIL_VALIDATION_FINALIZE:%',r.outcome;END IF;
 SELECT * INTO r FROM saas.email_marketing_command(store_b,principal,member_b,plan.id,plan.plan_code,plan.version,moment,'candidate',jsonb_build_object('candidateId',payload->>'candidateId','sessionHash',repeat('b',64)));IF r.outcome<>'candidate_expired' THEN RAISE EXCEPTION 'EMAIL_CANDIDATE_CROSS_STORE';END IF;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'candidate',jsonb_build_object('candidateId',payload->>'candidateId','sessionHash',repeat('c',64)));IF r.outcome<>'candidate_expired' THEN RAISE EXCEPTION 'EMAIL_CANDIDATE_CROSS_SESSION';END IF;
 payload:=payload||jsonb_build_object('kind','apply','operationId','22400000-0000-4000-8000-000000000013','fingerprint',repeat('e',64),'progress',jsonb_build_object('selection',jsonb_build_object('kind','create','name','Celebix')));
 SELECT * INTO s FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',payload||jsonb_build_object('operationId','22400000-0000-4000-8000-000000000090','progress',jsonb_build_object('selection',jsonb_build_object('kind','existing','listId','managed'))));IF s.outcome<>'invalid_input' THEN RAISE EXCEPTION 'EMAIL_BREVO_EXISTING_LIST_ACCEPTED';END IF;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'claimed' THEN RAISE EXCEPTION 'EMAIL_APPLY_CLAIM:%',r.outcome;END IF;token:=r.result_payload->>'leaseToken';c_id:=(r.result_payload->>'connectionId')::uuid;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'finalize',jsonb_build_object('operationId',payload->>'operationId','leaseToken',token,'list',jsonb_build_object('id','managed','name','Celebix'),'credential',envelope));IF r.outcome<>'saved' OR r.result_payload->>'status'<>'connected' THEN RAISE EXCEPTION 'EMAIL_APPLY_FINALIZE:%',r.outcome;END IF;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'replayed' OR r.result_payload?'credential' OR(SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE connection_id=c_id AND kind='bootstrap')<>1 THEN RAISE EXCEPTION 'EMAIL_APPLY_DUPLICATED';END IF;
 SELECT * INTO s FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'checkpoint',jsonb_build_object('operationId',payload->>'operationId','leaseToken',token,'progress','{}'::jsonb));IF s.outcome<>'operation_conflict' THEN RAISE EXCEPTION 'EMAIL_COMPLETE_EVIDENCE_MUTABLE:%',s.outcome;END IF;
 SELECT * INTO r FROM saas.email_marketing_command(store_b,principal,member_b,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'operation_conflict' THEN RAISE EXCEPTION 'EMAIL_OPERATION_CROSS_STORE';END IF;
 -- Native source + consent/outbox atomically, including the old-client address-change case.
 SELECT * INTO r FROM saas.email_marketing_customers_save(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,grant_time,'22400000-0000-4000-8000-000000000081',repeat('1',64),fixture_customer_id,NULL,'Ada','Test','old@example.test',NULL,'[]','[{"channel":"email","status":"granted","targetEmail":"old@example.test"}]');
 IF r.outcome<>'committed' OR NOT EXISTS(SELECT 1 FROM saas.email_marketing_audience WHERE store_id=store_a AND email='old@example.test' AND kind='grant' AND consented_at=grant_time) THEN RAISE EXCEPTION 'EMAIL_CUSTOMER_GRANT:%',r.outcome;END IF;
 SELECT count(*) INTO before_rows FROM saas.email_marketing_consent_events WHERE store_id=store_a;
 SELECT * INTO r FROM saas.email_marketing_customers_save(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'22400000-0000-4000-8000-000000000082',repeat('2',64),fixture_customer_id,1,'Ada','Edited','old@example.test',NULL,'[]','[{"channel":"email","status":"granted","targetEmail":"old@example.test"}]');
 IF r.outcome<>'committed' OR (SELECT recorded_at FROM saas.customer_consents WHERE store_id=store_a AND customer_id='22400000-0000-4000-8000-000000000080' AND channel='email')<>grant_time OR (SELECT count(*) FROM saas.email_marketing_consent_events WHERE store_id=store_a)<>before_rows THEN RAISE EXCEPTION 'EMAIL_GENERIC_EDIT_RECONSENT:%',r.outcome;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.email_marketing_audience WHERE store_id=store_a AND email='old@example.test' AND last_name='Edited' AND consented_at=grant_time) THEN RAISE EXCEPTION 'EMAIL_NAME_CORRECTION_NOT_PROPAGATED';END IF;
 SELECT * INTO r FROM saas.email_marketing_customers_save(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'22400000-0000-4000-8000-000000000083',repeat('3',64),fixture_customer_id,2,'Ada','Edited','new@example.test',NULL,'[]','[{"channel":"email","status":"granted"}]');
 IF r.outcome<>'committed' OR EXISTS(SELECT 1 FROM saas.email_marketing_audience WHERE store_id=store_a AND email='new@example.test') OR (SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE connection_id=c_id AND email='old@example.test' AND kind='remove_membership')<>1 OR EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs WHERE connection_id=c_id AND email='new@example.test' AND kind IN('profile','subscribe')) THEN RAISE EXCEPTION 'EMAIL_OLD_CHECKBOX_TRANSFERRED:%',r.outcome;END IF;
 SELECT count(*) INTO before_rows FROM saas.email_marketing_consent_events WHERE store_id=store_a;
 SELECT * INTO r FROM saas.email_marketing_customers_save(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'22400000-0000-4000-8000-000000000083',repeat('3',64),fixture_customer_id,2,'Ada','Edited','new@example.test',NULL,'[]','[{"channel":"email","status":"granted"}]');
 IF r.outcome<>'operation_replayed' OR (SELECT count(*) FROM saas.email_marketing_consent_events WHERE store_id=store_a)<>before_rows THEN RAISE EXCEPTION 'EMAIL_REPLAY_CREATED_CONSENT';END IF;
 -- Failed native source intent creates neither new evidence nor a new customer version.
 SELECT * INTO r FROM saas.email_marketing_customers_save(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'22400000-0000-4000-8000-000000000084',repeat('4',64),fixture_customer_id,2,'Ada','Wrong version','new@example.test',NULL,'[]','[{"channel":"email","status":"granted","targetEmail":"new@example.test"}]');
 IF r.outcome<>'version_conflict' OR (SELECT count(*) FROM saas.email_marketing_consent_events WHERE store_id=store_a)<>before_rows THEN RAISE EXCEPTION 'EMAIL_FAILED_SOURCE_CREATED_GRANT';END IF;
 -- Inject a failing outbox insert. The surrounding exception block must roll back
 -- the source mutation too; no partial customer save survives the failure.
 EXECUTE $ddl$CREATE FUNCTION pg_temp.email_fixture_outbox_failure() RETURNS trigger LANGUAGE plpgsql AS $fn$BEGIN RAISE EXCEPTION 'email_fixture_outbox_failure';END $fn$$ddl$;
 EXECUTE 'CREATE TRIGGER email_fixture_outbox_failure BEFORE INSERT ON saas.email_marketing_consent_events FOR EACH ROW EXECUTE FUNCTION pg_temp.email_fixture_outbox_failure()';
 BEGIN
  PERFORM saas.email_marketing_customers_save(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'22400000-0000-4000-8000-000000000085',repeat('5',64),fixture_customer_id,3,'Ada','Atomic','fault@example.test',NULL,'[]','[{"channel":"email","status":"granted","targetEmail":"fault@example.test"}]');
  RAISE EXCEPTION 'EMAIL_OUTBOX_FAILURE_IGNORED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'email_fixture_outbox_failure' THEN RAISE;END IF;END;
 EXECUTE 'DROP TRIGGER email_fixture_outbox_failure ON saas.email_marketing_consent_events';EXECUTE 'DROP FUNCTION pg_temp.email_fixture_outbox_failure()';
 IF EXISTS(SELECT 1 FROM saas.customer_operations WHERE operation_id='22400000-0000-4000-8000-000000000085') OR NOT EXISTS(SELECT 1 FROM saas.customers WHERE id=fixture_customer_id AND email='new@example.test' AND version=3) THEN RAISE EXCEPTION 'EMAIL_SOURCE_WITHOUT_ATOMIC_OUTBOX';END IF;
 INSERT INTO saas.email_marketing_contacts(store_id,connection_id,email,profile_id) VALUES(store_a,c_id,'new@example.test','mapped-profile');
 IF NOT saas.email_marketing_provider_denial(c_id,'provider-ret-1','new@example.test','mapped-profile','unsubscribe',moment) OR saas.email_marketing_provider_denial(c_id,'provider-ret-1','new@example.test','mapped-profile','unsubscribe',moment) OR saas.email_marketing_provider_denial(c_id,'unknown-profile','stranger@example.test','stranger','unsubscribe',moment) THEN RAISE EXCEPTION 'EMAIL_PROVIDER_DENIAL_SCOPE_OR_REPLAY';END IF;
 IF (SELECT status FROM saas.customer_consents WHERE store_id=store_a AND customer_id=fixture_customer_id AND channel='email')<>'granted' THEN RAISE EXCEPTION 'EMAIL_PROVIDER_DENIAL_CHANGED_CUSTOMER_CHANNEL';END IF;
 SELECT * INTO r FROM saas.email_marketing_customers_archive(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment+interval '1 millisecond','22400000-0000-4000-8000-000000000086',repeat('6',64),fixture_customer_id,3);
 IF r.outcome<>'committed' OR (SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE connection_id=c_id AND email='new@example.test' AND kind='remove_membership')<>1 THEN RAISE EXCEPTION 'EMAIL_ARCHIVE_MEMBERSHIP_CLEANUP';END IF;
 SELECT count(*) INTO before_rows FROM saas.email_marketing_consent_events WHERE store_id=store_a;
 SELECT * INTO r FROM saas.email_marketing_customers_archive(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment+interval '1 millisecond','22400000-0000-4000-8000-000000000086',repeat('6',64),fixture_customer_id,3);
 IF r.outcome<>'operation_replayed' OR (SELECT count(*) FROM saas.email_marketing_consent_events WHERE store_id=store_a)<>before_rows THEN RAISE EXCEPTION 'EMAIL_ARCHIVE_REPLAY_DUPLICATED';END IF;
 -- Existing negative customer evidence wins over an older source grant before installation.
 INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,version,archived_at,created_at,updated_at) VALUES
 ('22400000-0000-4000-8000-000000000091',store_a,'active','Legacy','Denied','legacy-denied@example.test',1,NULL,grant_time,moment),
 ('22400000-0000-4000-8000-000000000092',store_a,'archived','Legacy','Archived','legacy-archived@example.test',1,moment,grant_time,moment);
 INSERT INTO saas.customer_consents VALUES(store_a,'22400000-0000-4000-8000-000000000091','email','denied',moment);
 INSERT INTO saas.storefront_newsletter_subscribers(store_id,email_digest,normalized_email,status,consent_version,consented_at,version,created_at,updated_at)
 SELECT store_a,encode(sha256(convert_to(email,'UTF8')),'hex'),email,'subscribed','newsletter-v1',grant_time,1,grant_time,grant_time FROM unnest(ARRAY['legacy-denied@example.test','legacy-archived@example.test']) email;
 page:=saas.email_marketing_audience_page(store_a,c_id,'legacy-',100);
 IF (SELECT count(*) FROM jsonb_array_elements(page->'items') x WHERE x->>'email' LIKE 'legacy-%' AND x->>'kind' IN('deny','archive'))<>2 THEN RAISE EXCEPTION 'EMAIL_LEGACY_NEGATIVE_EVIDENCE_LOST';END IF;
 -- Historical source imports cannot outrank a later provider denial.
 PERFORM saas.email_marketing_append_event(store_a,'denied@example.test','deny','provider','denial','1',moment,NULL,NULL);
 PERFORM saas.email_marketing_append_event(store_a,'denied@example.test','grant','newsletter','old-proof','1',grant_time,grant_time,'newsletter-v1');
 IF (SELECT kind FROM saas.email_marketing_audience WHERE store_id=store_a AND email='denied@example.test')<>'deny' THEN RAISE EXCEPTION 'EMAIL_LATE_GRANT_UNDID_DENIAL';END IF;
 -- 205 existing proof-bearing newsletter records are paged without the old 200 cap.
 INSERT INTO saas.storefront_newsletter_subscribers(store_id,email_digest,normalized_email,status,consent_version,consented_at,version,created_at,updated_at)
 SELECT store_a,encode(sha256(convert_to('page-'||lpad(n::text,3,'0')||'@example.test','UTF8')),'hex'),'page-'||lpad(n::text,3,'0')||'@example.test','subscribed','newsletter-v1',moment,1,moment,moment FROM generate_series(1,205) n;
 page:=saas.email_marketing_audience_page(store_a,c_id,'page-',100);IF jsonb_array_length(page->'items')<>100 THEN RAISE EXCEPTION 'EMAIL_PAGE_FIRST';END IF;cursor:=page->'items'->99->>'email';
 page:=saas.email_marketing_audience_page(store_a,c_id,cursor,100);IF jsonb_array_length(page->'items')<>100 THEN RAISE EXCEPTION 'EMAIL_PAGE_SECOND';END IF;cursor:=page->'items'->99->>'email';
 page:=saas.email_marketing_audience_page(store_a,c_id,cursor,100);IF jsonb_array_length(page->'items')<>5 THEN RAISE EXCEPTION 'EMAIL_PAGE_THIRD';END IF;
 SELECT count(*) INTO before_rows FROM saas.email_marketing_consent_events;
 SELECT * INTO r FROM saas.email_marketing_newsletter_subscribe('unknown-email-fixture.example.test',moment,'anonymous@example.test','newsletter-v1');
 IF r.outcome<>'subscribed' OR (SELECT count(*) FROM saas.email_marketing_consent_events)<>before_rows THEN RAISE EXCEPTION 'EMAIL_ANTI_ENUMERATION_CREATED_PROOF';END IF;
 -- A consumed candidate cannot be used for another operation, including rotation.
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',payload||jsonb_build_object('kind','rotate','operationId','22400000-0000-4000-8000-000000000020','expectedVersion',1));
 IF r.outcome<>'candidate_expired' THEN RAISE EXCEPTION 'EMAIL_CANDIDATE_REUSED:%',r.outcome;END IF;
 -- A separately verified key from another canonical account cannot rotate this connection.
 INSERT INTO saas.email_marketing_candidates(id,store_id,principal_id,membership_id,session_hash,provider,credential,account_id,account_name,created_at,expires_at)
 VALUES('22400000-0000-4000-8000-000000000021',store_a,principal,member_a,repeat('b',64),'brevo',envelope,'different-account','Different',moment,moment+interval '15 minutes');
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',payload||jsonb_build_object('kind','rotate','candidateId','22400000-0000-4000-8000-000000000021','operationId','22400000-0000-4000-8000-000000000022','expectedVersion',1));
 IF r.outcome<>'account_mismatch' THEN RAISE EXCEPTION 'EMAIL_ROTATION_CHANGED_ACCOUNT:%',r.outcome;END IF;
 -- Support must still be valid at final write, after external validation returned.
 SELECT o.* INTO operator_row FROM saas.platform_operators o WHERE active LIMIT 1;
 IF operator_row.id IS NULL THEN RAISE EXCEPTION 'EMAIL_SUPPORT_FIXTURE_OPERATOR_MISSING';END IF;
 INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,version,created_at,updated_at,management)
 VALUES('22400000-0000-4000-8000-000000000031',store_a,'email-support.admin.example.test','platform_subdomain','active',true,moment,1,moment,moment,'platform');
 INSERT INTO saas.platform_support_sessions(id,operator_id,principal_id,store_id,admin_host,reason,issued_at,expires_at,redeemed_at,handoff_hash,idempotency_key)
 VALUES(support_session,operator_row.id,operator_row.principal_id,store_a,'email-support.admin.example.test','Isolated expiry proof',moment,moment+interval '30 minutes',moment,repeat('9',64),'email-support-fixture');
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at,support_session_id)
 VALUES(support_member,operator_row.principal_id,store_a,'admin','active',moment,moment,support_session);
 SELECT * INTO r FROM saas.email_marketing_command(store_a,operator_row.principal_id,support_member,plan.id,plan.plan_code,plan.version,moment,'claim',
 jsonb_build_object('kind','validate','provider','brevo','operationId','22400000-0000-4000-8000-000000000034','candidateId','22400000-0000-4000-8000-000000000035','connectionId','22400000-0000-4000-8000-000000000036','sessionHash',repeat('b',64),'fingerprint',repeat('f',64),'credential',envelope));
 IF r.outcome<>'claimed' THEN RAISE EXCEPTION 'EMAIL_SUPPORT_CLAIM:%',r.outcome;END IF;token:=r.result_payload->>'leaseToken';
 PERFORM set_config('app.support_session_id','',true);
 UPDATE saas.platform_support_sessions SET issued_at=moment-interval '31 minutes',expires_at=moment-interval '1 minute' WHERE id=support_session;
 SELECT count(*) INTO before_rows FROM saas.platform_support_write_journal WHERE session_id=support_session;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,operator_row.principal_id,support_member,plan.id,plan.plan_code,plan.version,moment,'finalize',jsonb_build_object('operationId','22400000-0000-4000-8000-000000000034','leaseToken',token,'account',jsonb_build_object('id','expired-support-account','name','Expired','senderStatus','unknown')));
 IF r.outcome<>'forbidden' OR (SELECT count(*) FROM saas.platform_support_write_journal WHERE session_id=support_session)<>before_rows OR EXISTS(SELECT 1 FROM saas.email_marketing_candidates WHERE id='22400000-0000-4000-8000-000000000035' AND account_id IS NOT NULL) THEN RAISE EXCEPTION 'EMAIL_SUPPORT_FINAL_WRITE_EXPIRED:%',r.outcome;END IF;
 UPDATE saas.email_marketing_connections SET status='draining' WHERE id=c_id;
 payload:=jsonb_build_object('kind','validate','operationId','22400000-0000-4000-8000-000000000014','connectionId','22400000-0000-4000-8000-000000000015','candidateId','22400000-0000-4000-8000-000000000016','provider','brevo','sessionHash',repeat('b',64),'fingerprint',repeat('d',64),'expectedVersion',0,'credential',envelope);
 SELECT * INTO r FROM saas.email_marketing_command(store_b,principal,member_b,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'claimed' THEN RAISE EXCEPTION 'EMAIL_SECOND_VALIDATION';END IF;token:=r.result_payload->>'leaseToken';
 SELECT * INTO r FROM saas.email_marketing_command(store_b,principal,member_b,plan.id,plan.plan_code,plan.version,moment,'finalize',jsonb_build_object('operationId',payload->>'operationId','leaseToken',token,'account',jsonb_build_object('id','canonical-org','name','Fixture','senderStatus','unknown')));IF r.outcome<>'saved' THEN RAISE EXCEPTION 'EMAIL_SECOND_VALIDATION_FINALIZE';END IF;
 payload:=payload||jsonb_build_object('kind','apply','operationId','22400000-0000-4000-8000-000000000017','fingerprint',repeat('a',64),'progress',jsonb_build_object('selection',jsonb_build_object('kind','create','name','Celebix')));
 SELECT * INTO r FROM saas.email_marketing_command(store_b,principal,member_b,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'account_in_use' THEN RAISE EXCEPTION 'CROSS_STORE_ACCOUNT_BINDING:%',r.outcome;END IF;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',jsonb_build_object('kind','disconnect','operationId','22400000-0000-4000-8000-000000000018','connectionId',c_id,'expectedVersion',0,'fingerprint',repeat('a',64)));IF r.outcome<>'version_conflict' THEN RAISE EXCEPTION 'EMAIL_STALE_VERSION:%',r.outcome;END IF;
 -- Known not-sent effects retry; authenticated key recovery never opens consent blocks.
 UPDATE saas.email_marketing_connections SET status='connected' WHERE id=c_id;
 PERFORM saas.email_marketing_append_event(store_a,'safe-retry@example.test','grant','newsletter','retry-proof','1',grant_time,grant_time,'v1');
 SELECT id INTO fixture_customer_id FROM saas.email_marketing_sync_jobs WHERE connection_id=c_id AND email='safe-retry@example.test' AND kind='profile';
 UPDATE saas.email_marketing_sync_jobs SET status='running',lease_token='22400000-0000-4000-8000-000000000099',lease_until=clock_timestamp()+interval '90 seconds' WHERE id=fixture_customer_id;
 page:=saas.email_marketing_work('checkpoint',jsonb_build_object('jobId',fixture_customer_id,'leaseToken','22400000-0000-4000-8000-000000000099','result','{"phase":"dispatched","credentialVersion":1,"action":"subscribe","state":{"kind":"absent"}}'::jsonb));
 page:=saas.email_marketing_work('finish',jsonb_build_object('jobId',fixture_customer_id,'leaseToken','22400000-0000-4000-8000-000000000099','outcome','{"status":"retry","errorCode":"provider_rate_limited","effectNotApplied":true}'::jsonb));
 IF NOT EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs WHERE id=fixture_customer_id AND status='queued' AND phase='queued' AND credential_snapshot IS NULL) OR (SELECT last_subscribe_at FROM saas.email_marketing_contacts WHERE connection_id=c_id AND email='safe-retry@example.test') IS NOT NULL THEN RAISE EXCEPTION 'EMAIL_KNOWN_REJECTION_STRANDED';END IF;
 UPDATE saas.email_marketing_sync_jobs SET status='running',lease_token='22400000-0000-4000-8000-000000000099',lease_until=clock_timestamp()+interval '90 seconds' WHERE id=fixture_customer_id;
 page:=saas.email_marketing_work('finish',jsonb_build_object('jobId',fixture_customer_id,'leaseToken','22400000-0000-4000-8000-000000000099','outcome','{"status":"blocked","errorCode":"provider_unauthorized","credentialRejected":true}'::jsonb));
 INSERT INTO saas.email_marketing_sync_jobs(store_id,connection_id,generation,credential_version,email,consent_version,kind,status,error_code) VALUES(store_a,c_id,1,1,'auth-revoke@example.test',0,'unsubscribe','blocked','credential_rejected');
 INSERT INTO saas.email_marketing_sync_jobs(store_id,connection_id,generation,credential_version,email,consent_version,kind,status,error_code) VALUES(store_a,c_id,1,1,'consent-block@example.test',0,'profile','blocked','provider_list_denial');
 IF (SELECT status FROM saas.email_marketing_connections WHERE id=c_id)<>'needs_reconnect' THEN RAISE EXCEPTION 'EMAIL_AUTH_FAILURE_HIDDEN';END IF;
 INSERT INTO saas.email_marketing_candidates(id,store_id,principal_id,membership_id,session_hash,provider,credential,account_id,account_name,created_at,expires_at) VALUES('22400000-0000-4000-8000-000000000094',store_a,principal,member_a,repeat('b',64),'brevo',envelope,'canonical-org','Fixture',moment,moment+interval '15 minutes');
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',jsonb_build_object('kind','rotate','operationId','22400000-0000-4000-8000-000000000095','candidateId','22400000-0000-4000-8000-000000000094','sessionHash',repeat('b',64),'connectionId',c_id,'expectedVersion',1,'fingerprint',repeat('1',64)));IF r.outcome<>'claimed' THEN RAISE EXCEPTION 'EMAIL_AUTH_ROTATION_CLAIM:%',r.outcome;END IF;token:=r.result_payload->>'leaseToken';
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'finalize',jsonb_build_object('operationId','22400000-0000-4000-8000-000000000095','leaseToken',token,'credential',envelope));
 IF r.outcome<>'saved' OR r.result_payload->>'status'<>'connected' OR (SELECT status FROM saas.email_marketing_sync_jobs WHERE id=fixture_customer_id)<>'queued' OR (SELECT status FROM saas.email_marketing_sync_jobs WHERE connection_id=c_id AND email='auth-revoke@example.test')<>'queued' OR (SELECT status FROM saas.email_marketing_sync_jobs WHERE connection_id=c_id AND email='consent-block@example.test')<>'blocked' THEN RAISE EXCEPTION 'EMAIL_AUTH_ROTATION_DID_NOT_RECOVER';END IF;
 UPDATE saas.email_marketing_candidates SET created_at=moment-interval '20 minutes',expires_at=moment-interval '5 minutes' WHERE id='22400000-0000-4000-8000-000000000016';
 SELECT * INTO r FROM saas.email_marketing_command(store_b,principal,member_b,plan.id,plan.plan_code,plan.version,moment,'candidate',jsonb_build_object('candidateId','22400000-0000-4000-8000-000000000016','sessionHash',repeat('b',64)));IF r.outcome<>'candidate_expired' THEN RAISE EXCEPTION 'EMAIL_EXPIRED_CANDIDATE:%',r.outcome;END IF;
 UPDATE saas.subscriptions SET valid_until=clock_timestamp()-interval '1 second' WHERE store_id=store_a;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'overview','{}');IF r.outcome<>'forbidden' THEN RAISE EXCEPTION 'EMAIL_EXPIRED_CURRENT_AUTHORITY:%',r.outcome;END IF;

END $proof$;
ROLLBACK;
