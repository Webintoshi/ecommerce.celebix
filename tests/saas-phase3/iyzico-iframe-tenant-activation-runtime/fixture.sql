BEGIN;
SET LOCAL ROLE celebix_saas_owner;

INSERT INTO saas.principals(
  id,issuer,subject,email,email_verified,created_at,updated_at
) VALUES(
  '20000000-0000-4000-8000-000000000061',
  'https://id.test','iyzico-runtime-owner','iyzico-runtime@test.invalid',true,
  '2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z'
);

INSERT INTO saas.stores(
  id,name,slug,status,locale,currency,theme_key,created_at,updated_at
) VALUES
  ('10000000-0000-4000-8000-000000000061','Iyzico Runtime A','iyzico-runtime-a',
   'active','tr','TRY','default','2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z'),
  ('10000000-0000-4000-8000-000000000062','Iyzico Runtime B','iyzico-runtime-b',
   'active','tr','TRY','default','2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z');

INSERT INTO saas.memberships(
  id,principal_id,store_id,role,status,created_at,updated_at
) VALUES
  ('30000000-0000-4000-8000-000000000061','20000000-0000-4000-8000-000000000061',
   '10000000-0000-4000-8000-000000000061','store_owner','active',
   '2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z'),
  ('30000000-0000-4000-8000-000000000062','20000000-0000-4000-8000-000000000061',
   '10000000-0000-4000-8000-000000000062','store_owner','active',
   '2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z');

INSERT INTO saas.subscriptions(
  id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at
) VALUES
  ('31000000-0000-4000-8000-000000000061','10000000-0000-4000-8000-000000000061',
   '00000000-0000-4000-8000-000000000001','free_starter',1,'active',
   '2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z'),
  ('31000000-0000-4000-8000-000000000062','10000000-0000-4000-8000-000000000062',
   '00000000-0000-4000-8000-000000000001','free_starter',1,'active',
   '2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z');

ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;
UPDATE saas.plan_features SET enabled=true
WHERE plan_id='00000000-0000-4000-8000-000000000001'
  AND feature_key IN('integrations','payment_setting');
ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;

-- Test-only platform build authority. 061 must only consume this tuple.
INSERT INTO saas.merchant_provider_execution_authorities(
  provider_code,capability,environment,adapter_version,evidence_digest,
  readiness,enabled,approved_at
) VALUES
  ('iyzico_iframe','payment_processing','test',7,
   'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   'sandbox_ready',true,'2026-07-28T14:00:00.000Z'),
  ('paytr_iframe','payment_processing','test',1,
   'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
   'sandbox_ready',true,'2026-07-28T14:00:00.000Z');

INSERT INTO saas.merchant_provider_profiles(
  id,store_id,provider_code,capability,public_config,masked_account_reference,
  sealed_credentials,credential_digest,credential_key_id,credential_schema_version,
  credential_version,status,version,last_validated_at,
  validation_lease_id,validation_lease_owner,validation_lease_expires_at,
  created_at,updated_at,revoked_at,
  execution_environment,execution_adapter_version,execution_evidence_digest,
  validation_environment,validation_adapter_version
) VALUES
  ('40000000-0000-4000-8000-000000000061','10000000-0000-4000-8000-000000000061',
   'iyzico_iframe','payment_processing','{"environment":"test"}','iyzico test',
   '{"algorithm":"A256GCM","ciphertext":"AQ","iv":"AAAAAAAAAAAAAAAA","keyId":"provider.current","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}',
   repeat('1',64),'provider.current',1,1,'active',1,'2026-07-28T14:00:00.000Z',
   NULL,NULL,NULL,'2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z',NULL,
   NULL,NULL,NULL,'test',7),
  ('40000000-0000-4000-8000-000000000062','10000000-0000-4000-8000-000000000062',
   'iyzico_iframe','payment_processing','{"environment":"test"}','iyzico other test',
   '{"algorithm":"A256GCM","ciphertext":"AQ","iv":"AAAAAAAAAAAAAAAA","keyId":"provider.current","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}',
   repeat('2',64),'provider.current',1,1,'active',1,'2026-07-28T14:00:00.000Z',
   NULL,NULL,NULL,'2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z',NULL,
   NULL,NULL,NULL,'test',7),
  ('40000000-0000-4000-8000-000000000063','10000000-0000-4000-8000-000000000061',
   'paytr_iframe','payment_processing','{"environment":"test"}','paytr test',
   '{"algorithm":"A256GCM","ciphertext":"AQ","iv":"AAAAAAAAAAAAAAAA","keyId":"provider.current","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}',
   repeat('3',64),'provider.current',1,1,'active',1,'2026-07-28T14:00:00.000Z',
   NULL,NULL,NULL,'2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z',NULL,
   'test',1,'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
   'test',1);

INSERT INTO saas.payment_methods(
  id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
  position,config,version,created_at,updated_at
) VALUES
  ('50000000-0000-4000-8000-000000000061','10000000-0000-4000-8000-000000000061',
   'provider','40000000-0000-4000-8000-000000000063','paytr_iframe','PayTR',
   'disabled',NULL,0,'{"environment":"test"}',1,'2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z'),
  ('50000000-0000-4000-8000-000000000062','10000000-0000-4000-8000-000000000061',
   'cash_on_delivery',NULL,NULL,'Kapıda Ödeme','active',NULL,1,'{}',1,
   '2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z'),
  ('50000000-0000-4000-8000-000000000063','10000000-0000-4000-8000-000000000061',
   'bank_transfer',NULL,NULL,'Banka Havalesi','active',NULL,2,'{}',1,
   '2026-07-28T14:00:00.000Z','2026-07-28T14:00:00.000Z');

COMMIT;
