-- Disposable PostgreSQL16 only. Native synthetic fixture rolls back.
BEGIN;
DO $proof$
DECLARE t text;sig regprocedure;plan record;r record;s record;payload jsonb;token text;c_id uuid;before_rows bigint;operator_row record;support_member uuid:='22400000-0000-4000-8000-000000000033';support_session uuid:='22400000-0000-4000-8000-000000000032';
 principal uuid:='22400000-0000-4000-8000-000000000001';store_a uuid:='22400000-0000-4000-8000-000000000002';store_b uuid:='22400000-0000-4000-8000-000000000003';member_a uuid:='22400000-0000-4000-8000-000000000004';member_b uuid:='22400000-0000-4000-8000-000000000005';moment timestamptz:=clock_timestamp();
 envelope jsonb:='{"algorithm":"A256GCM","version":1,"keyId":"fixture","iv":"aaaa","tag":"aaaa","ciphertext":"aaaa"}';
BEGIN
 IF current_database()<>'email_marketing_isolated' OR current_setting('listen_addresses')<>'' THEN RAISE EXCEPTION 'EMAIL_ISOLATED_ONLY';END IF;
 FOREACH t IN ARRAY ARRAY['email_marketing_connections','email_marketing_candidates','email_marketing_operations','email_marketing_contacts','email_marketing_consent_events','email_marketing_audience','email_marketing_sync_jobs','email_marketing_inbound_events'] LOOP
  IF has_table_privilege('celebix_saas_app','saas.'||t,'SELECT') OR has_table_privilege('celebix_saas_app','saas.'||t,'INSERT') OR has_table_privilege('celebix_saas_workflow','saas.'||t,'SELECT') THEN RAISE EXCEPTION 'EMAIL_PRIVATE_TABLE_LEAK:%',t;END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||t)::regclass AND relrowsecurity AND relforcerowsecurity) OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('saas.'||t)::regclass AND tgname='platform_support_atomic_journal') THEN RAISE EXCEPTION 'EMAIL_TABLE_AUTHORITY:%',t;END IF;
 END LOOP;
 FOR sig IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'email_marketing_%' LOOP
  IF has_function_privilege('public',sig,'EXECUTE') OR has_function_privilege('celebix_saas_host_resolver',sig,'EXECUTE') THEN RAISE EXCEPTION 'EMAIL_FUNCTION_LEAK:%',sig;END IF;
 END LOOP;
 SELECT p.id,p.plan_code,p.version INTO plan FROM saas.plans p JOIN saas.plan_features f ON f.plan_id=p.id AND f.feature_key='integrations' AND f.enabled WHERE p.status='active' AND p.valid_from<=moment AND(p.valid_until IS NULL OR p.valid_until>moment) ORDER BY p.version DESC LIMIT 1;
 IF plan.id IS NULL THEN RAISE EXCEPTION 'EMAIL_FIXTURE_PLAN_MISSING';END IF;
 INSERT INTO saas.principals VALUES(principal,'https://email-fixture.invalid','email-fixture','email-fixture@example.test',true,moment,moment);
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES(store_a,'Email fixture A','email-fixture-a','active','tr','TRY','base',moment,moment),(store_b,'Email fixture B','email-fixture-b','active','tr','TRY','base',moment,moment);
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES(member_a,principal,store_a,'store_owner','active',moment,moment),(member_b,principal,store_b,'store_owner','active',moment,moment);
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('22400000-0000-4000-8000-000000000006',store_a,plan.id,plan.plan_code,plan.version,'active',moment-interval '1 day',moment,moment),('22400000-0000-4000-8000-000000000007',store_b,plan.id,plan.plan_code,plan.version,'active',moment-interval '1 day',moment,moment);
 SELECT count(*) INTO before_rows FROM saas.email_marketing_operations;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'overview','{}');
 IF r.outcome<>'found' OR r.result_payload->'connections'<>'[]'::jsonb OR (SELECT count(*) FROM saas.email_marketing_operations)<>before_rows THEN RAISE EXCEPTION 'EMAIL_OVERVIEW_MUTATED';END IF;
 payload:=jsonb_build_object('kind','validate','operationId','22400000-0000-4000-8000-000000000010','connectionId','22400000-0000-4000-8000-000000000011','candidateId','22400000-0000-4000-8000-000000000012','provider','brevo','sessionHash',repeat('b',64),'fingerprint',repeat('f',64),'expectedVersion',0,'credential',envelope);
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'claimed' THEN RAISE EXCEPTION 'EMAIL_VALIDATION_CLAIM:%',r.outcome;END IF;token:=r.result_payload->>'leaseToken';
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'finalize',jsonb_build_object('operationId',payload->>'operationId','leaseToken',token,'account',jsonb_build_object('id','canonical-org','name','Fixture','senderStatus','unknown'),'lists','[]'::jsonb));IF r.outcome<>'saved' THEN RAISE EXCEPTION 'EMAIL_VALIDATION_FINALIZE:%',r.outcome;END IF;
 SELECT * INTO r FROM saas.email_marketing_command(store_b,principal,member_b,plan.id,plan.plan_code,plan.version,moment,'candidate',jsonb_build_object('candidateId',payload->>'candidateId','sessionHash',repeat('b',64)));IF r.outcome<>'candidate_expired' THEN RAISE EXCEPTION 'EMAIL_CANDIDATE_CROSS_STORE';END IF;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'candidate',jsonb_build_object('candidateId',payload->>'candidateId','sessionHash',repeat('c',64)));IF r.outcome<>'candidate_expired' THEN RAISE EXCEPTION 'EMAIL_CANDIDATE_CROSS_SESSION';END IF;
 payload:=payload||jsonb_build_object('kind','apply','operationId','22400000-0000-4000-8000-000000000013','fingerprint',repeat('e',64));
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'claimed' THEN RAISE EXCEPTION 'EMAIL_APPLY_CLAIM:%',r.outcome;END IF;token:=r.result_payload->>'leaseToken';c_id:=(r.result_payload->>'connectionId')::uuid;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'finalize',jsonb_build_object('operationId',payload->>'operationId','leaseToken',token,'list',jsonb_build_object('id','managed','name','Celebix'),'credential',envelope));IF r.outcome<>'saved' OR r.result_payload->>'status'<>'connected' THEN RAISE EXCEPTION 'EMAIL_APPLY_FINALIZE:%',r.outcome;END IF;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'replayed' OR r.result_payload?'credential' OR(SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE connection_id=c_id AND kind='bootstrap')<>1 THEN RAISE EXCEPTION 'EMAIL_APPLY_DUPLICATED';END IF;
 SELECT * INTO s FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'checkpoint',jsonb_build_object('operationId',payload->>'operationId','leaseToken',token,'progress','{}'::jsonb));IF s.outcome<>'operation_conflict' THEN RAISE EXCEPTION 'EMAIL_COMPLETE_EVIDENCE_MUTABLE:%',s.outcome;END IF;
 SELECT * INTO r FROM saas.email_marketing_command(store_b,principal,member_b,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'operation_conflict' THEN RAISE EXCEPTION 'EMAIL_OPERATION_CROSS_STORE';END IF;
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
 payload:=payload||jsonb_build_object('kind','apply','operationId','22400000-0000-4000-8000-000000000017','fingerprint',repeat('a',64));
 SELECT * INTO r FROM saas.email_marketing_command(store_b,principal,member_b,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'account_in_use' THEN RAISE EXCEPTION 'CROSS_STORE_ACCOUNT_BINDING:%',r.outcome;END IF;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',jsonb_build_object('kind','disconnect','operationId','22400000-0000-4000-8000-000000000018','connectionId',c_id,'expectedVersion',0,'fingerprint',repeat('a',64)));IF r.outcome<>'version_conflict' THEN RAISE EXCEPTION 'EMAIL_STALE_VERSION:%',r.outcome;END IF;
 UPDATE saas.email_marketing_candidates SET created_at=moment-interval '20 minutes',expires_at=moment-interval '5 minutes' WHERE id='22400000-0000-4000-8000-000000000016';
 SELECT * INTO r FROM saas.email_marketing_command(store_b,principal,member_b,plan.id,plan.plan_code,plan.version,moment,'candidate',jsonb_build_object('candidateId','22400000-0000-4000-8000-000000000016','sessionHash',repeat('b',64)));IF r.outcome<>'candidate_expired' THEN RAISE EXCEPTION 'EMAIL_EXPIRED_CANDIDATE:%',r.outcome;END IF;
 UPDATE saas.subscriptions SET valid_until=clock_timestamp()-interval '1 second' WHERE store_id=store_a;
 SELECT * INTO r FROM saas.email_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'overview','{}');IF r.outcome<>'forbidden' THEN RAISE EXCEPTION 'EMAIL_EXPIRED_CURRENT_AUTHORITY:%',r.outcome;END IF;

END $proof$;
ROLLBACK;
