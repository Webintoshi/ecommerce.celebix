BEGIN;
SET LOCAL ROLE celebix_saas_owner;

INSERT INTO saas.principals(
  id,issuer,subject,email,email_verified,created_at,updated_at
) VALUES(
  '20000000-0000-4000-8000-000000000056',
  'https://id.test','owner','owner@test.invalid',true,
  '2026-07-27T12:00:00.000Z','2026-07-27T12:00:00.000Z'
);

INSERT INTO saas.stores(
  id,name,slug,status,locale,currency,theme_key,created_at,updated_at
) VALUES
  ('10000000-0000-4000-8000-000000000056','Provider Keyed','provider-keyed',
   'active','tr','TRY','default','2026-07-27T12:00:00.000Z','2026-07-27T12:00:00.000Z'),
  ('10000000-0000-4000-8000-000000000057','Other','provider-keyed-other',
   'active','tr','TRY','default','2026-07-27T12:00:00.000Z','2026-07-27T12:00:00.000Z');

INSERT INTO saas.memberships(
  id,principal_id,store_id,role,status,created_at,updated_at
) VALUES(
  '30000000-0000-4000-8000-000000000056',
  '20000000-0000-4000-8000-000000000056',
  '10000000-0000-4000-8000-000000000056',
  'store_owner','active','2026-07-27T12:00:00.000Z','2026-07-27T12:00:00.000Z'
);

INSERT INTO saas.subscriptions(
  id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at
) VALUES(
  '31000000-0000-4000-8000-000000000056',
  '10000000-0000-4000-8000-000000000056',
  '00000000-0000-4000-8000-000000000001',
  'free_starter',1,'active','2026-07-27T12:00:00.000Z',
  '2026-07-27T12:00:00.000Z','2026-07-27T12:00:00.000Z'
);

ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;
UPDATE saas.plan_features
SET enabled=true
WHERE plan_id='00000000-0000-4000-8000-000000000001'
  AND feature_key='integrations';
ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;

COMMIT;
