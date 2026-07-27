SET ROLE celebix_saas_owner;

INSERT INTO saas.principals(
  id,issuer,subject,email,email_verified,created_at,updated_at
) VALUES(
  '20000000-0000-4000-8000-000000000054',
  'https://identity.example.test/oidc','evidence-owner',
  'evidence@example.test',true,'2026-01-01','2026-01-01'
);
INSERT INTO saas.stores(
  id,name,slug,status,locale,currency,theme_key,created_at,updated_at
) VALUES(
  '10000000-0000-4000-8000-000000000054',
  'Evidence Store','evidence-store','active','tr','TRY','default',
  '2026-01-01','2026-01-01'
);
INSERT INTO saas.memberships(
  id,principal_id,store_id,role,status,created_at,updated_at
) VALUES(
  '30000000-0000-4000-8000-000000000054',
  '20000000-0000-4000-8000-000000000054',
  '10000000-0000-4000-8000-000000000054',
  'store_owner','active','2026-01-01','2026-01-01'
);
INSERT INTO saas.checkout_provider_configs(
  id,store_id,provider_key,status,public_origin,configuration_key_id,
  sealed_configuration,configuration_digest,version,created_at,updated_at
) VALUES(
  '50000000-0000-4000-8000-000000000054',
  '10000000-0000-4000-8000-000000000054',
  'paytr','active','https://www.paytr.com','key-1',
  '{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}',
  repeat('c',64),7,'2026-01-01','2026-01-01'
);
INSERT INTO saas.quick_order_links(
  id,store_id,creating_membership_id,provider_config_id,status,token_digest,
  token_key_id,sealed_token,customer_name,customer_email,customer_phone,
  shipping_address,billing_address,internal_label,currency,subtotal_cents,
  shipping_cents,discount_cents,total_cents,expires_at,version,created_at,updated_at
) VALUES
  (
    '60000000-0000-4000-8000-000000000051',
    '10000000-0000-4000-8000-000000000054',
    '30000000-0000-4000-8000-000000000054',
    '50000000-0000-4000-8000-000000000054',
    'active',repeat('1',64),'key-1',
    '{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}',
    'Ada Lovelace','ada@example.test','+905551110000',
    '{"recipientName":"Ada Lovelace","phone":"+905551110000","line1":"Test 1","city":"Istanbul","country":"TR"}',
    '{"recipientName":"Ada Lovelace","phone":"+905551110000","line1":"Test 1","city":"Istanbul","country":"TR"}',
    'success','TRY',10000,0,0,10000,'2026-07-28 10:00:00+00',1,
    '2026-07-27 10:00:00+00','2026-07-27 10:00:00+00'
  ),
  (
    '60000000-0000-4000-8000-000000000052',
    '10000000-0000-4000-8000-000000000054',
    '30000000-0000-4000-8000-000000000054',
    '50000000-0000-4000-8000-000000000054',
    'active',repeat('2',64),'key-1',
    '{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}',
    'Ada Lovelace','ada@example.test','+905551110000',
    '{"recipientName":"Ada Lovelace","phone":"+905551110000","line1":"Test 1","city":"Istanbul","country":"TR"}',
    '{"recipientName":"Ada Lovelace","phone":"+905551110000","line1":"Test 1","city":"Istanbul","country":"TR"}',
    'decline','TRY',10000,0,0,10000,'2026-07-28 10:00:00+00',1,
    '2026-07-27 10:00:00+00','2026-07-27 10:00:00+00'
  ),
  (
    '60000000-0000-4000-8000-000000000053',
    '10000000-0000-4000-8000-000000000054',
    '30000000-0000-4000-8000-000000000054',
    '50000000-0000-4000-8000-000000000054',
    'active',repeat('3',64),'key-1',
    '{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}',
    'Ada Lovelace','ada@example.test','+905551110000',
    '{"recipientName":"Ada Lovelace","phone":"+905551110000","line1":"Test 1","city":"Istanbul","country":"TR"}',
    '{"recipientName":"Ada Lovelace","phone":"+905551110000","line1":"Test 1","city":"Istanbul","country":"TR"}',
    'timeout','TRY',10000,0,0,10000,'2026-07-28 10:00:00+00',1,
    '2026-07-27 10:00:00+00','2026-07-27 10:00:00+00'
  );
INSERT INTO saas.quick_order_redemption_sessions(
  id,store_id,quick_order_link_id,cookie_digest,expires_at,version,created_at,updated_at
) VALUES
  (
    '61000000-0000-4000-8000-000000000051',
    '10000000-0000-4000-8000-000000000054',
    '60000000-0000-4000-8000-000000000051',repeat('4',64),
    '2026-07-27 13:00:00+00',1,
    '2026-07-27 11:00:00+00','2026-07-27 11:00:00+00'
  ),
  (
    '61000000-0000-4000-8000-000000000052',
    '10000000-0000-4000-8000-000000000054',
    '60000000-0000-4000-8000-000000000052',repeat('5',64),
    '2026-07-27 13:00:00+00',1,
    '2026-07-27 11:00:00+00','2026-07-27 11:00:00+00'
  ),
  (
    '61000000-0000-4000-8000-000000000053',
    '10000000-0000-4000-8000-000000000054',
    '60000000-0000-4000-8000-000000000053',repeat('6',64),
    '2026-07-27 13:00:00+00',1,
    '2026-07-27 11:00:00+00','2026-07-27 11:00:00+00'
  );
INSERT INTO saas.orders(
  id,store_id,order_number,source,customer_name,customer_email,currency,
  subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
  shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at
) VALUES
  (
    '70000000-0000-4000-8000-000000000051',
    '10000000-0000-4000-8000-000000000054',
    'EVIDENCE-51','quick_link','Ada','ada@example.test','TRY',
    10000,0,0,10000,'confirmed','completed','{}','{}',
    '60000000-0000-4000-8000-000000000051',1,
    '2026-07-27 12:01:00+00','2026-07-27 12:01:00+00'
  ),
  (
    '70000000-0000-4000-8000-000000000053',
    '10000000-0000-4000-8000-000000000054',
    'EVIDENCE-53','quick_link','Ada','ada@example.test','TRY',
    10000,0,0,10000,'confirmed','completed','{}','{}',
    '60000000-0000-4000-8000-000000000053',1,
    '2026-07-27 12:04:00+00','2026-07-27 12:04:00+00'
  );
INSERT INTO saas.checkout_payment_attempts(
  id,store_id,quick_order_link_id,redemption_session_id,provider_config_id,
  provider_config_version,configuration_digest,configuration_key_id,
  sealed_configuration,merchant_oid,expected_subtotal_cents,expected_shipping_cents,
  expected_discount_cents,expected_payment_amount,currency,status,provider_token_digest,
  provider_token_key_id,sealed_provider_token,hold_expires_at,provider_ready_at,
  initiation_unknown_at,succeeded_at,failed_at,settled_order_id,version,created_at,updated_at
) VALUES
  (
    '62000000-0000-4000-8000-000000000051',
    '10000000-0000-4000-8000-000000000054',
    '60000000-0000-4000-8000-000000000051',
    '61000000-0000-4000-8000-000000000051',
    '50000000-0000-4000-8000-000000000054',
    7,repeat('c',64),'key-1',
    '{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}',
    repeat('a',32),10000,0,0,10000,'TRY','succeeded',
    repeat('7',64),'key-1',
    '{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}',
    '2026-07-27 12:05:00+00','2026-07-27 12:00:30+00',NULL,
    '2026-07-27 12:01:00+00',NULL,
    '70000000-0000-4000-8000-000000000051',3,
    '2026-07-27 12:00:00+00','2026-07-27 12:01:00+00'
  ),
  (
    '62000000-0000-4000-8000-000000000052',
    '10000000-0000-4000-8000-000000000054',
    '60000000-0000-4000-8000-000000000052',
    '61000000-0000-4000-8000-000000000052',
    '50000000-0000-4000-8000-000000000054',
    7,repeat('c',64),'key-1',
    '{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}',
    repeat('b',32),10000,0,0,10000,'TRY','failed',
    NULL,NULL,NULL,'2026-07-27 12:07:00+00',NULL,NULL,NULL,
    '2026-07-27 12:02:00+00',NULL,2,
    '2026-07-27 12:02:00+00','2026-07-27 12:02:00+00'
  ),
  (
    '62000000-0000-4000-8000-000000000053',
    '10000000-0000-4000-8000-000000000054',
    '60000000-0000-4000-8000-000000000053',
    '61000000-0000-4000-8000-000000000053',
    '50000000-0000-4000-8000-000000000054',
    7,repeat('c',64),'key-1',
    '{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}',
    repeat('c',32),10000,0,0,10000,'TRY','succeeded',
    NULL,NULL,NULL,'2026-07-27 12:08:00+00',NULL,
    '2026-07-27 12:03:00+00','2026-07-27 12:04:00+00',NULL,
    '70000000-0000-4000-8000-000000000053',3,
    '2026-07-27 12:03:00+00','2026-07-27 12:04:00+00'
  ),
  (
    '62000000-0000-4000-8000-000000000054',
    '10000000-0000-4000-8000-000000000054',
    '60000000-0000-4000-8000-000000000052',
    '61000000-0000-4000-8000-000000000052',
    '50000000-0000-4000-8000-000000000054',
    8,repeat('c',64),'key-1',
    '{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}',
    repeat('d',32),10000,0,0,10000,'TRY','failed',
    NULL,NULL,NULL,'2026-07-27 12:09:00+00',NULL,NULL,NULL,
    '2026-07-27 12:04:30+00',NULL,2,
    '2026-07-27 12:04:00+00','2026-07-27 12:04:30+00'
  );
INSERT INTO saas.checkout_operations(
  operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,
  result_payload,committed_at
) VALUES
  (
    '90000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000054',
    '62000000-0000-4000-8000-000000000051',
    'settle_callback',repeat('1',64),
    '{"status":"success","testMode":1,"totalAmount":10000,"paymentType":"card"}',
    '2026-07-27 12:01:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000054',
    '62000000-0000-4000-8000-000000000052',
    'settle_callback',repeat('2',64),
    '{"status":"failed","testMode":1}','2026-07-27 12:02:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000054',
    '62000000-0000-4000-8000-000000000053',
    'initiation_unknown',repeat('3',64),
    '{"status":"initiation_unknown"}','2026-07-27 12:03:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000054',
    '62000000-0000-4000-8000-000000000053',
    'reconcile_success',repeat('4',64),
    '{"status":"success","testMode":1}','2026-07-27 12:04:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000054',
    '62000000-0000-4000-8000-000000000054',
    'settle_callback',repeat('5',64),
    '{"status":"failed","testMode":1}','2026-07-27 12:04:30+00'
  );
INSERT INTO saas.checkout_callback_receipts(
  id,store_id,attempt_id,callback_digest,currency,callback_status,
  result_payload,received_at
) VALUES
  (
    '90000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000054',
    '62000000-0000-4000-8000-000000000051',
    repeat('d',64),'TRY','success','{}','2026-07-27 12:01:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000054',
    '62000000-0000-4000-8000-000000000052',
    repeat('e',64),'TRY','failed','{}','2026-07-27 12:02:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000054',
    '62000000-0000-4000-8000-000000000054',
    repeat('f',64),'TRY','failed','{}','2026-07-27 12:04:30+00'
  );
INSERT INTO saas.checkout_reconciliation_receipts(
  id,store_id,attempt_id,operation_id,currency,outcome,payload_fingerprint,
  result_payload,committed_at
) VALUES(
  '91000000-0000-4000-8000-000000000054',
  '10000000-0000-4000-8000-000000000054',
  '62000000-0000-4000-8000-000000000053',
  '90000000-0000-4000-8000-000000000004',
  'TRY','succeeded',repeat('6',64),'{}','2026-07-27 12:04:00+00'
);
