import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { applyBaseline } from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import { startDisposablePostgres } from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir = import.meta.dirname;
const name = '202611160507_iyzico_live_activation';
const read = (file) => readFileSync(path.join(dir, file), 'utf8');
const { sql, stop } = startDisposablePostgres({ database: 'iyzico_live_activation507' });
const owner = (source) => sql(`SET ROLE celebix_saas_owner;${source}`);
const id = (number) => `50700000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const now = '2026-11-16T12:00:00Z';
const plan = '00000000-0000-4000-8000-000000000006';
const digest = 'sha256:' + 'a'.repeat(64);
const config = '{"environment":"live","locale":"tr","threeDSecure":"provider_managed","installmentMode":"single_payment","maxInstallment":0}';
const sealed = '{"algorithm":"A256GCM","ciphertext":"AA","iv":"AAAAAAAAAAAAAAAA","keyId":"fixture","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}';
const app = (query) => sql(`SET ROLE celebix_saas_app;${query}`);
const tenant = (store) => `'${id(store)}','${id(store + 30)}','${id(store + 40)}','${plan}','professional',1,'${now}'`;
const fingerprint = 'c'.repeat(64);
const bind = (store, profile, version = 2, credential = 1, evidence = digest) =>
  `SELECT saas.iyzico_live_bind_profile('${id(store)}','${id(profile)}',${version},${credential},'${evidence}','${now}')`;

try {
  applyBaseline(sql, dir);
  for (const file of readdirSync(dir).filter((file) => /^\d{12}/.test(file)
    && Number(file.slice(8, 12)) > 227 && Number(file.slice(8, 12)) < 507
    && /(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file))
    .sort((a, b) => Number(a.slice(8, 12)) - Number(b.slice(8, 12)) || a.localeCompare(b))) {
    try { sql(read(file)); }
    catch (cause) { throw new Error(`Could not apply ${file}`, { cause }); }
  }
  assert.equal(owner('SELECT saas.iyzico_iframe_tenant_activation_runtime_preflight()'), 't');
  if (!process.argv.includes('--before-migration')) {
    sql(read(name + '.up.sql'));
    sql(read(name + '_assertions.sql'));
    sql(read(name + '.down.sql'));
    assert.equal(owner('SELECT saas.iyzico_iframe_tenant_activation_runtime_preflight()'), 't');
    sql(read(name + '.up.sql'));
  }
  assert.equal(sql("SELECT to_regprocedure('saas.iyzico_live_bind_profile(uuid,uuid,bigint,bigint,text,timestamptz)') IS NOT NULL"), 't');

  for (const [store, profile, environment] of [[1, 11, 'live'], [2, 12, 'live'], [3, 13, 'test']]) {
    owner(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
      VALUES('${id(store)}','iyzico fixture','iyzico-fixture-${store}','active','tr','TRY','starter','${now}','${now}');
      INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
      VALUES('${id(store + 30)}','https://fixture.example.test','fixture-${store}',
        'fixture-${store}@example.test',true,'${now}','${now}');
      INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
      VALUES('${id(store + 40)}','${id(store + 30)}','${id(store)}','store_owner','active','${now}','${now}');
      INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
      VALUES('${id(store + 50)}','${id(store)}','${plan}','professional',1,'active','2026-01-01','${now}','${now}');
      INSERT INTO saas.merchant_provider_profiles(
        id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,
        credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,
        validation_lease_id,validation_lease_owner,validation_lease_expires_at,created_at,updated_at,
        validation_environment,validation_adapter_version)
      VALUES('${id(profile)}','${id(store)}','iyzico_iframe','payment_processing','{"environment":"${environment}"}',
        'iyzico fixture','${sealed}','${'b'.repeat(64)}','fixture',1,1,'pending_validation',1,
        '${id(profile + 20)}','worker.fixture','2026-11-16T12:10:00Z','${now}','${now}','${environment}',1);`);
  }
  assert.equal(owner(`SELECT saas.merchant_provider_execution_authority_approve(
    'iyzico_iframe','payment_processing','live',1,'${digest}','production_ready','${now}')`), 't');
  assert.equal(owner(bind(1, 11, 1)), 'f', 'pending keys cannot bind');
  for (const [profile, environment] of [[11, 'live'], [12, 'live'], [13, 'test']]) {
    assert.equal(sql(`SET ROLE celebix_saas_workflow;
      SELECT outcome FROM saas.merchant_provider_profile_mark_verification(
        '${id(profile)}','iyzico_iframe','payment_processing','${environment}',1,'worker.fixture','${now}',
        '${id(profile + 20)}',1,1,'validated','validated')`), 'validated');
  }
  assert.equal(owner(bind(2, 11)), 'f', 'another store cannot bind the profile');
  assert.equal(owner(bind(1, 11, 3)), 'f', 'profile version must match');
  assert.equal(owner(bind(1, 11, 2, 2)), 'f', 'credential version must match');
  assert.equal(owner(bind(1, 11, 2, 1, 'sha256:' + 'f'.repeat(64))), 'f', 'digest must match');
  assert.equal(owner(bind(3, 13)), 'f', 'test profile must stay on the test evidence flow');
  assert.throws(() => sql(`SET ROLE celebix_saas_app;${bind(1, 11)}`), /permission denied/u);
  assert.throws(() => sql(`SET ROLE celebix_saas_workflow;${bind(1, 11)}`), /permission denied/u);
  assert.equal(owner(bind(1, 11)), 't');
  assert.equal(owner(bind(1, 11)), 't', 'same binding can be retried');
  assert.equal(sql(`SELECT execution_evidence_digest FROM saas.merchant_provider_profiles WHERE id='${id(11)}'`), digest);
  assert.equal(sql(`SELECT execution_evidence_digest IS NULL FROM saas.merchant_provider_profiles WHERE id='${id(12)}'`), 't');

  const insertMethod = (store, profile, method) => `INSERT INTO saas.payment_methods(
    id,store_id,kind,profile_id,provider_code,label,state,position,config,version,created_at,updated_at)
    VALUES('${id(method)}','${id(store)}','provider','${id(profile)}','iyzico_iframe','Card','active',0,'${config}',1,'${now}','${now}')`;
  assert.throws(() => owner(insertMethod(2, 12, 22)), /IYZICO_IFRAME_TENANT_LIVE_METHOD_UNAUTHORIZED/u);
  const save = (store, profile, method, operation) => app(`SELECT outcome FROM saas.payment_method_save(
    ${tenant(store)},'${id(operation)}','${fingerprint}','${id(method)}',0,
    'provider','${id(profile)}','iyzico_iframe','Kredi veya banka kartı','${config}')`);
  const setState = (store, method, operation, version, state) => app(`SELECT outcome FROM saas.payment_method_set_state(
    ${tenant(store)},'${id(operation)}','${fingerprint}','${id(method)}',${version},'${state}',NULL)`);
  assert.equal(save(2, 12, 22, 61), 'provider_disabled');
  assert.equal(owner(`SELECT coalesce(saas.merchant_admin_authority_error(${tenant(1)},'payment_setting',true),'allowed')`), 'allowed');
  assert.equal(save(1, 11, 21, 62), 'saved');
  assert.equal(sql(`SELECT state FROM saas.payment_methods WHERE id='${id(21)}'`), 'disabled');
  assert.equal(setState(1, 21, 63, 1, 'active'), 'state_changed');
  assert.equal(owner('SELECT saas.iyzico_iframe_tenant_activation_runtime_preflight()'), 't');
  assert.match(owner(`SELECT saas.storefront_payment_methods_projection('${id(1)}')`), /"providerCode": "iyzico_iframe"/u);

  assert.equal(app(`SELECT outcome FROM saas.merchant_provider_profile_save_verification(
    ${tenant(1)},'${id(64)}','${fingerprint}','${id(11)}','iyzico_iframe','payment_processing',
    '{"environment":"live"}','iyzico fixture','${sealed}','${'d'.repeat(64)}','fixture',1,'live',1,3)`), 'saved');
  assert.equal(sql(`SELECT state FROM saas.payment_methods WHERE id='${id(21)}'`), 'disabled');
  assert.equal(sql(`SELECT execution_evidence_digest IS NULL FROM saas.merchant_provider_profiles WHERE id='${id(11)}'`), 't');
  assert.equal(owner(bind(1, 11, 4, 2)), 'f', 'rotated credentials must complete verification');
  const lease = id(65);
  assert.equal(sql(`SET ROLE celebix_saas_workflow;
    SELECT outcome FROM saas.merchant_provider_profile_claim_verification(
      'worker.fixture','iyzico_iframe','payment_processing','live',1,'${now}','2026-11-16T12:10:00Z','${lease}')`), 'claimed');
  const leasedProfileVersion = Number(sql(`SELECT version FROM saas.merchant_provider_profiles WHERE id='${id(11)}'`));
  assert.equal(sql(`SET ROLE celebix_saas_workflow;
    SELECT outcome FROM saas.merchant_provider_profile_mark_verification(
      '${id(11)}','iyzico_iframe','payment_processing','live',1,'worker.fixture','${now}',
      '${lease}',2,${leasedProfileVersion},'validated','validated')`), 'validated');
  assert.equal(owner(bind(1, 11, leasedProfileVersion + 1, 1)), 'f', 'superseded credential cannot bind');
  assert.equal(owner(bind(1, 11, leasedProfileVersion + 1, 2)), 't');
  assert.equal(setState(1, 21, 66, 3, 'active'), 'state_changed');

  assert.equal(owner(`SELECT saas.merchant_provider_execution_authority_revoke(
    'iyzico_iframe','payment_processing','live',1,'${digest}','${now}')`), 't');
  assert.equal(sql(`SELECT state FROM saas.payment_methods WHERE id='${id(21)}'`), 'disabled');
  assert.equal(owner('SELECT saas.iyzico_iframe_tenant_activation_runtime_preflight()'), 't');
  assert.throws(() => sql(read(name + '.down.sql')), /IYZICO_LIVE_ACTIVATION507_USED/u);
  console.log('Native iyzico live activation passed');
} finally {
  stop();
}
