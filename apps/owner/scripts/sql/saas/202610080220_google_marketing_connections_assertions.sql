-- Isolated database only. All synthetic rows roll back.
BEGIN;
DO $test$
DECLARE t text;signature regprocedure;principal uuid:='22000000-0000-4000-8000-000000000001';store_a uuid:='22000000-0000-4000-8000-000000000002';store_b uuid:='22000000-0000-4000-8000-000000000003';member_a uuid:='22000000-0000-4000-8000-000000000004';member_b uuid:='22000000-0000-4000-8000-000000000005';plan record;r record;s record;token text;payload jsonb;selection jsonb:='{"accountId":"123","resourceId":"456","resourceName":"Purchase","tagId":"AW-987654","conversionLabel":"real_Label"}';moment timestamptz:=clock_timestamp();
BEGIN
 FOREACH t IN ARRAY ARRAY['google_marketing_connections','google_marketing_oauth_states','google_marketing_operations','google_marketing_events'] LOOP
  IF has_table_privilege('celebix_saas_app','saas.'||t,'SELECT') OR has_table_privilege('celebix_saas_host_resolver','saas.'||t,'SELECT') THEN RAISE EXCEPTION 'GOOGLE_PRIVATE_TABLE_LEAK:%',t;END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('saas.'||t)::regclass AND tgname='platform_support_atomic_journal') THEN RAISE EXCEPTION 'GOOGLE_SUPPORT_JOURNAL_MISSING:%',t;END IF;
 END LOOP;
 FOR signature IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('google_marketing_command','google_marketing_oauth_return','public_google_marketing_projection','public_google_marketing_purchase') LOOP
  IF has_function_privilege('public',signature,'EXECUTE') THEN RAISE EXCEPTION 'GOOGLE_PUBLIC_EXECUTE_LEAK:%',signature;END IF;
 END LOOP;
 IF has_function_privilege('celebix_saas_host_resolver','saas.google_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'GOOGLE_HOST_WRITER_LEAK';END IF;
 SELECT p.id,p.plan_code,p.version INTO plan FROM saas.plans p JOIN saas.plan_features f ON f.plan_id=p.id AND f.feature_key='integrations' AND f.enabled WHERE p.status='active' AND p.valid_from<=moment AND (p.valid_until IS NULL OR p.valid_until>moment) ORDER BY p.version DESC LIMIT 1;
 IF plan.id IS NULL THEN RAISE EXCEPTION 'GOOGLE_FIXTURE_PLAN_MISSING';END IF;
 INSERT INTO saas.principals VALUES(principal,'https://google-fixture.invalid','google220','google220@example.test',true,moment,moment);
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES(store_a,'Google fixture A','google-fixture-220-a','active','tr','TRY','base',moment,moment),(store_b,'Google fixture B','google-fixture-220-b','active','tr','TRY','base',moment,moment);
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES(member_a,principal,store_a,'store_owner','active',moment,moment),(member_b,principal,store_b,'store_owner','active',moment,moment);
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('22000000-0000-4000-8000-000000000006',store_a,plan.id,plan.plan_code,plan.version,'active',moment-interval '1 day',moment,moment),('22000000-0000-4000-8000-000000000007',store_b,plan.id,plan.plan_code,plan.version,'active',moment-interval '1 day',moment,moment);
 INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at) VALUES('22000000-0000-4000-8000-000000000008',store_a,'google220a.example.test','custom_domain','active',true,moment,moment,moment),('22000000-0000-4000-8000-000000000009',store_b,'google220b.example.test','custom_domain','active',true,moment,moment,moment);
 payload:=jsonb_build_object('service','ads','operationId','22000000-0000-4000-8000-000000000010','stateHash',repeat('a',64),'sessionHash',repeat('b',64),'returnOrigin','https://google-fixture-220-a.admin.saas-staging.celebix.net');
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'start_oauth',payload);IF r.outcome<>'started' THEN RAISE EXCEPTION 'GOOGLE_STATE_BEGIN_FAILED:%',r.outcome;END IF;
 SELECT * INTO r FROM saas.google_marketing_command(store_b,principal,member_b,plan.id,plan.plan_code,plan.version,moment,'consume_state',jsonb_build_object('stateHash',repeat('a',64),'sessionHash',repeat('b',64)));IF r.outcome<>'oauth_state_invalid' THEN RAISE EXCEPTION 'GOOGLE_STATE_CROSS_STORE';END IF;
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'consume_state',jsonb_build_object('stateHash',repeat('a',64),'sessionHash',repeat('c',64)));IF r.outcome<>'oauth_state_invalid' THEN RAISE EXCEPTION 'GOOGLE_STATE_CROSS_SESSION';END IF;
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'consume_state',jsonb_build_object('stateHash',repeat('a',64),'sessionHash',repeat('b',64)));IF r.outcome<>'consumed' THEN RAISE EXCEPTION 'GOOGLE_STATE_CONSUME_FAILED';END IF;
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'consume_state',jsonb_build_object('stateHash',repeat('a',64),'sessionHash',repeat('b',64)));IF r.outcome<>'oauth_state_invalid' THEN RAISE EXCEPTION 'GOOGLE_STATE_REPLAY';END IF;
 IF saas.google_marketing_oauth_return(repeat('a',64),moment) IS NOT NULL THEN RAISE EXCEPTION 'GOOGLE_CONSUMED_RETURN_EXPOSED';END IF;
 payload:=jsonb_build_object('service','ads','operationId','22000000-0000-4000-8000-000000000011','fingerprint',repeat('f',64),'expectedVersion',0,'selection',selection,'kind','apply');
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'claimed' THEN RAISE EXCEPTION 'GOOGLE_CLAIM_FAILED:%',r.outcome;END IF;token:=r.result_payload->>'leaseToken';
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'operation_busy' THEN RAISE EXCEPTION 'GOOGLE_CONCURRENT_OPERATION';END IF;
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'finalize',jsonb_build_object('service','ads','operationId','22000000-0000-4000-8000-000000000011','leaseToken',token,'selection',selection));IF r.outcome<>'saved' OR r.result_payload->>'version'<>'1' THEN RAISE EXCEPTION 'GOOGLE_FINALIZE_FAILED:%',r.outcome;END IF;
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'operation_replayed' THEN RAISE EXCEPTION 'GOOGLE_RETRY_DUPLICATED';END IF;
 SELECT * INTO r FROM saas.google_marketing_command(store_b,principal,member_b,plan.id,plan.plan_code,plan.version,moment,'claim',payload);IF r.outcome<>'operation_mismatch' THEN RAISE EXCEPTION 'GOOGLE_OPERATION_CROSS_STORE';END IF;
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',payload||'{"operationId":"22000000-0000-4000-8000-000000000012"}');IF r.outcome<>'version_conflict' THEN RAISE EXCEPTION 'GOOGLE_VERSION_STALE';END IF;
 IF saas.public_google_marketing_projection(store_a)#>>'{ads,tagId}'<>'AW-987654' OR saas.public_google_marketing_projection(store_b)->'ads'<>'null'::jsonb OR saas.public_google_marketing_projection(store_a)?'credential' THEN RAISE EXCEPTION 'GOOGLE_PUBLIC_PROJECTION_INVALID';END IF;
 INSERT INTO saas.google_marketing_connections(store_id,service,status,verification_token) VALUES(store_a,'search_console','error','pending-meta220');
 IF saas.public_google_marketing_projection(store_a)->>'verificationToken'<>'pending-meta220' THEN RAISE EXCEPTION 'GOOGLE_PENDING_META_MISSING';END IF;
 SELECT * INTO r FROM saas.public_google_marketing_purchase('google220a.example.test',moment,'[{"keyId":"fixture","digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]');IF r.outcome='found' AND r.result_payload IS NOT NULL THEN RAISE EXCEPTION 'GOOGLE_PURCHASE_FALSE_SUCCESS';END IF;
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'disconnect',jsonb_build_object('service','ads','operationId','22000000-0000-4000-8000-000000000013','fingerprint',repeat('d',64),'expectedVersion',1));IF r.outcome<>'saved' THEN RAISE EXCEPTION 'GOOGLE_DISCONNECT_FAILED';END IF;
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'credential',jsonb_build_object('service','ads','stateHash',repeat('a',64),'subject','late-google-actor','email','late@example.test','credential',jsonb_build_object('algorithm','A256GCM','version',1,'keyId','fixture','iv','a','tag','a','ciphertext','aaaa')));IF r.outcome<>'oauth_state_invalid' OR (SELECT credential FROM saas.google_marketing_connections WHERE store_id=store_a AND service='ads') IS NOT NULL THEN RAISE EXCEPTION 'GOOGLE_CONSUMED_CALLBACK_REATTACHED_AFTER_DISCONNECT';END IF;
 RAISE NOTICE 'Google220 state binding, replay, lease, version, public projection and ACL assertions passed';
END $test$;
-- Native purchase proof uses real captured live rows only on this isolated clone.
-- Observation timestamps and negative cases change only inside this rolled-back transaction.
DO $purchase_truth$
DECLARE original saas.storefront_hosted_checkout_sessions;order_original saas.orders;host_name text;candidates jsonb;r record;moment timestamptz:=date_trunc('milliseconds',clock_timestamp());hold_delta interval;
BEGIN
 SELECT s.* INTO original FROM saas.storefront_hosted_checkout_sessions s JOIN saas.payment_attempts a ON a.store_id=s.store_id AND a.id=s.payment_attempt_id JOIN saas.stores store ON store.id=s.store_id
 WHERE s.environment='live' AND s.status='captured' AND a.environment='live' AND a.status='captured' AND a.amount_minor=s.total_minor AND a.currency=s.currency AND store.status='active' AND EXISTS(SELECT 1 FROM saas.store_domains d WHERE d.store_id=s.store_id AND d.status='active' AND d.is_primary) ORDER BY s.created_at DESC LIMIT 1;
 IF original.id IS NULL THEN RAISE EXCEPTION 'GOOGLE_CAPTURED_LIVE_SESSION_FIXTURE_UNAVAILABLE';END IF;
 SELECT hostname INTO host_name FROM saas.store_domains WHERE store_id=original.store_id AND status='active' AND is_primary LIMIT 1;
 candidates:=jsonb_build_array(jsonb_build_object('keyId',original.payment_session_key_id,'digest',original.payment_session_credential_digest));hold_delta:=original.hold_expires_at-original.created_at;
 ALTER TABLE saas.storefront_hosted_checkout_sessions DISABLE TRIGGER USER;
 ALTER TABLE saas.orders DISABLE TRIGGER USER;
 ALTER TABLE saas.payment_attempts DISABLE TRIGGER USER;
 -- The snapshot retained the captured provider/session proof after historic storefront order deletion.
 -- Recreate a minimum valid, clearly synthetic order only for this rollback-only acceptance test.
 INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,paid_at) VALUES(original.order_id,original.store_id,'GOOGLE220-ROLLBACK-FIXTURE','storefront','Google220 isolated fixture','google220@example.invalid',original.currency,original.subtotal_minor,original.shipping_minor,original.discount_minor,original.total_minor,'confirmed','completed','{}',moment-interval '1 hour',moment,moment-interval '10 minutes') ON CONFLICT(id) DO NOTHING;
 SELECT * INTO order_original FROM saas.orders WHERE store_id=original.store_id AND id=original.order_id;

 UPDATE saas.storefront_hosted_checkout_sessions SET created_at=moment-interval '1 hour',updated_at=moment,hold_expires_at=moment-interval '1 hour'+hold_delta,payment_session_expires_at=moment-interval '1 hour'+hold_delta,receipt_expires_at=moment+interval '30 minutes',customer_expires_at=moment+interval '1 day',terminal_at=moment-interval '10 minutes',presentation_expires_at=CASE WHEN presentation_expires_at IS NOT NULL THEN moment-interval '55 minutes' ELSE NULL END WHERE id=original.id;
 SELECT * INTO r FROM saas.public_google_marketing_purchase(host_name,moment,candidates);IF r.outcome<>'found' OR r.result_payload->>'transactionId'<>original.order_id::text OR (r.result_payload->>'valueCents')::bigint<>order_original.total_cents OR r.result_payload->>'currency'<>order_original.currency OR r.result_payload-ARRAY['transactionId','valueCents','currency']<>'{}' THEN RAISE EXCEPTION 'GOOGLE_CAPTURED_WEB_PURCHASE_PROOF_INVALID';END IF;
 UPDATE saas.orders SET payment_status='pending',paid_at=NULL WHERE id=original.order_id;
 SELECT * INTO r FROM saas.public_google_marketing_purchase(host_name,moment,candidates);IF r.result_payload IS NOT NULL THEN RAISE EXCEPTION 'GOOGLE_PENDING_ORDER_CONVERTED';END IF;
 UPDATE saas.orders SET payment_status='completed',paid_at=order_original.paid_at,source='in_store' WHERE id=original.order_id;
 SELECT * INTO r FROM saas.public_google_marketing_purchase(host_name,moment,candidates);IF r.result_payload IS NOT NULL THEN RAISE EXCEPTION 'GOOGLE_POS_ORDER_CONVERTED';END IF;
 UPDATE saas.orders SET source='storefront' WHERE id=original.order_id;
 UPDATE saas.storefront_hosted_checkout_sessions SET environment='test' WHERE id=original.id;
 SELECT * INTO r FROM saas.public_google_marketing_purchase(host_name,moment,candidates);IF r.result_payload IS NOT NULL THEN RAISE EXCEPTION 'GOOGLE_SANDBOX_SESSION_CONVERTED';END IF;
 UPDATE saas.storefront_hosted_checkout_sessions SET environment='live' WHERE id=original.id;
 UPDATE saas.payment_attempts SET status='submitted' WHERE id=original.payment_attempt_id;
 SELECT * INTO r FROM saas.public_google_marketing_purchase(host_name,moment,candidates);IF r.result_payload IS NOT NULL THEN RAISE EXCEPTION 'GOOGLE_UNCAPTURED_ATTEMPT_CONVERTED';END IF;
 UPDATE saas.payment_attempts SET status='captured' WHERE id=original.payment_attempt_id;
 UPDATE saas.storefront_hosted_checkout_sessions SET receipt_expires_at=moment-interval '10 minutes' WHERE id=original.id;
 SELECT * INTO r FROM saas.public_google_marketing_purchase(host_name,moment,candidates);IF r.outcome<>'not_found' OR r.result_payload IS NOT NULL THEN RAISE EXCEPTION 'GOOGLE_EXPIRED_RECEIPT_CONVERTED';END IF;
 RAISE NOTICE 'Google220 native live captured WEB purchase positive, pending, POS, sandbox, uncaptured and expired proof assertions passed';
END $purchase_truth$;
ROLLBACK;
