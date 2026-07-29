BEGIN;
SET LOCAL ROLE celebix_saas_owner;

INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
('20000000-0000-4000-8000-000000000057','https://id.test','owner-a','owner-a@test.invalid',true,'2026-07-27','2026-07-27'),
('20000000-0000-4000-8000-000000000058','https://id.test','owner-b','owner-b@test.invalid',true,'2026-07-27','2026-07-27');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('10000000-0000-4000-8000-000000000057','Hosted A','hosted-a','active','tr','TRY','default','2026-07-27','2026-07-27'),
('10000000-0000-4000-8000-000000000058','Hosted B','hosted-b','active','tr','TRY','default','2026-07-27','2026-07-27');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
('30000000-0000-4000-8000-000000000057','20000000-0000-4000-8000-000000000057','10000000-0000-4000-8000-000000000057','store_owner','active','2026-07-27','2026-07-27'),
('30000000-0000-4000-8000-000000000058','20000000-0000-4000-8000-000000000058','10000000-0000-4000-8000-000000000058','store_owner','active','2026-07-27','2026-07-27');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
('31000000-0000-4000-8000-000000000057','10000000-0000-4000-8000-000000000057','00000000-0000-4000-8000-000000000001','free_starter',1,'active','2026-07-27','2026-07-27','2026-07-27'),
('31000000-0000-4000-8000-000000000058','10000000-0000-4000-8000-000000000058','00000000-0000-4000-8000-000000000001','free_starter',1,'active','2026-07-27','2026-07-27','2026-07-27');

INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES
('40000000-0000-4000-8000-000000000057','10000000-0000-4000-8000-000000000057','hosted-product-a','Hosted Product A','active','TRY',1,'2026-07-27','2026-07-27'),
('40000000-0000-4000-8000-000000000058','10000000-0000-4000-8000-000000000058','hosted-product-b','Hosted Product B','active','TRY',1,'2026-07-27','2026-07-27');
ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
('41000000-0000-4000-8000-000000000057','40000000-0000-4000-8000-000000000057','10000000-0000-4000-8000-000000000057','Default',12500,false,0,'active','{}',1,'2026-07-27','2026-07-27'),
('41000000-0000-4000-8000-000000000058','40000000-0000-4000-8000-000000000058','10000000-0000-4000-8000-000000000058','Default',12500,false,0,'active','{}',1,'2026-07-27','2026-07-27');
ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;

INSERT INTO saas.merchant_provider_execution_authorities(
 provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at
) VALUES('iyzico_iframe','payment_processing','test',1,
 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','sandbox_ready',true,'2026-07-27');

INSERT INTO saas.merchant_provider_profiles(
 id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,
 credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,
 last_validated_at,created_at,updated_at,revoked_at,execution_environment,
 execution_adapter_version,execution_evidence_digest,validation_environment,validation_adapter_version
) VALUES
('42000000-0000-4000-8000-000000000057','10000000-0000-4000-8000-000000000057','iyzico_iframe','payment_processing','{"environment":"test"}','iyzico-a',
 '{"algorithm":"A256GCM","ciphertext":"AQ","iv":"AAAAAAAAAAAAAAAA","keyId":"provider.current","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}',
 repeat('1',64),'provider.current',1,1,'active',1,'2026-07-27','2026-07-27','2026-07-27',NULL,'test',1,
 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','test',1),
('42000000-0000-4000-8000-000000000058','10000000-0000-4000-8000-000000000058','iyzico_iframe','payment_processing','{"environment":"test"}','iyzico-b',
 '{"algorithm":"A256GCM","ciphertext":"AQ","iv":"AAAAAAAAAAAAAAAA","keyId":"provider.current","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}',
 repeat('2',64),'provider.current',1,1,'active',1,'2026-07-27','2026-07-27','2026-07-27',NULL,'test',1,
 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','test',1);

INSERT INTO saas.payment_methods(
 id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,position,config,version,created_at,updated_at
) VALUES
('50000000-0000-4000-8000-000000000057','10000000-0000-4000-8000-000000000057','provider','42000000-0000-4000-8000-000000000057','iyzico_iframe','iyzico A','active',NULL,0,'{"environment":"test"}',1,'2026-07-27','2026-07-27'),
('50000000-0000-4000-8000-000000000058','10000000-0000-4000-8000-000000000058','provider','42000000-0000-4000-8000-000000000058','iyzico_iframe','iyzico B','active',NULL,0,'{"environment":"test"}',1,'2026-07-27','2026-07-27');

INSERT INTO saas.checkout_provider_configs(
 id,store_id,provider_key,status,public_origin,configuration_key_id,sealed_configuration,version,created_at,updated_at
) VALUES(
 '52000000-0000-4000-8000-000000000057','10000000-0000-4000-8000-000000000057','paytr','active',
 'https://www.paytr.com','quick.current',
 '{"algorithm":"A256GCM","ciphertext":"AQ","iv":"AAAAAAAAAAAAAAAA","keyId":"quick.current","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}',
 1,'2026-07-27','2026-07-27'
);

COMMIT;
