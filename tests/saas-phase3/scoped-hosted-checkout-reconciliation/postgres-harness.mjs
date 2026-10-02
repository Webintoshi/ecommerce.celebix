import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { assertSafeEnvironment } from '../../saas-phase2/postgres/disposable-harness.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const SQL = path.join(ROOT, 'apps/owner/scripts/sql/saas');
const BIN = path.join(homedir(), '.codex/tmp/postgresql-16.14-install/bin');
const MIGRATION = '202610020193_scoped_hosted_checkout_reconciliation';
const STORE = '10000000-0000-4000-8000-000000000193';
const NOW = '2026-08-06T12:00:00.000Z';
const TEST_DIGEST = `sha256:${'a'.repeat(64)}`;
const LIVE_DIGEST = `sha256:${'b'.repeat(64)}`;
const IYZICO_DIGEST = `sha256:${'c'.repeat(64)}`;
const PROFILE = { test: '20000000-0000-4000-8000-000000000193', live: '20000000-0000-4000-8000-000000000194', iyzico: '20000000-0000-4000-8000-000000000195' };
const METHOD = { test: '30000000-0000-4000-8000-000000000193', live: '30000000-0000-4000-8000-000000000194', iyzico: '30000000-0000-4000-8000-000000000195' };
const scope = [{ providerCode: 'paytr_iframe', environment: 'live', adapterVersion: 1, evidenceDigest: LIVE_DIGEST }];
const id = (prefix, ordinal) => `${prefix}0000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
const quote = (value) => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
let box;
let passed = 0;
const pass = (name) => console.log(`PASS ${++passed} ${name}`);

function command(name, args, input = '', allowFailure = false) {
  const result = spawnSync(path.join(BIN, name), args, { cwd: ROOT, input, encoding: 'utf8',
    env: { PATH: process.env.PATH, LC_ALL: 'C', LANG: 'C' }, maxBuffer: 64 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0) throw new Error(`${name} failed\n${result.stderr}`);
  if (result.error) throw result.error;
  return result;
}
const sql = (source, allowFailure = false) => command('psql', ['-h', box.socket, '-p', String(box.port),
  '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], source, allowFailure);
const value = (source) => sql(source).stdout.trim();
const apply = (file) => sql(readFileSync(path.join(SQL, file), 'utf8'));
function predecessor() {
  return JSON.parse(value(`SELECT jsonb_build_object('hash',encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex'),
    'owner',proowner::regrole::text,'acl',proacl::text,'stable',provolatile='s','securityDefiner',prosecdef,'config',proconfig)
    FROM pg_proc WHERE oid='saas.storefront_hosted_checkout_reconciliation_candidates(timestamptz,integer)'::regprocedure;`));
}
function snapshot() {
  return value(`SELECT jsonb_build_object(
    'attempts',(SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM saas.payment_attempts row WHERE row.store_id='${STORE}'),
    'sessions',(SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM saas.storefront_hosted_checkout_sessions row WHERE row.store_id='${STORE}'),
    'events',(SELECT jsonb_agg(to_jsonb(row) ORDER BY row.event_id) FROM saas.payment_attempt_events row WHERE row.store_id='${STORE}'),
    'operations',(SELECT jsonb_agg(to_jsonb(row) ORDER BY row.operation_id) FROM saas.payment_attempt_operations row WHERE row.store_id='${STORE}'),
    'reservations',(SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM saas.checkout_inventory_reservations row WHERE row.store_id='${STORE}'));`);
}

function seed() {
  const envelope = JSON.stringify({ algorithm: 'A256GCM', ciphertext: 'AQ', iv: 'AAAAAAAAAAAAAAAA',
    keyId: 'fixture-key', tag: 'AAAAAAAAAAAAAAAAAAAAAA', version: 1 });
  const providerRows = [
    ['test', 'paytr_iframe', 'test', TEST_DIGEST, true],
    ['live', 'paytr_iframe', 'live', LIVE_DIGEST, true],
    ['iyzico', 'iyzico_iframe', 'test', IYZICO_DIGEST, false],
  ];
  let source = `BEGIN; SET LOCAL session_replication_role=replica;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
    VALUES('${STORE}','Scoped Worker Fixture','scoped-worker-fixture','active','tr','TRY','default','2026-08-01','2026-08-01');`;
  for (const [key, provider, environment, digest, enabled] of providerRows) {
    source += `INSERT INTO saas.merchant_provider_execution_authorities(provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at)
      VALUES('${provider}','payment_processing','${environment}',1,'${digest}','${environment === 'live' ? 'production_ready' : 'sandbox_ready'}',${enabled},'2026-08-01')
      ON CONFLICT(provider_code,environment) DO UPDATE SET adapter_version=1,evidence_digest=EXCLUDED.evidence_digest,enabled=EXCLUDED.enabled,approved_at=EXCLUDED.approved_at;
      INSERT INTO saas.merchant_provider_profiles(id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,
        credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,last_validated_at,created_at,updated_at,
        execution_environment,execution_adapter_version,execution_evidence_digest,validation_environment,validation_adapter_version)
      VALUES('${PROFILE[key]}','${STORE}','${provider}','payment_processing','{"environment":"${environment}"}','fixture','${envelope}'::jsonb,
        '${'1'.repeat(64)}','fixture-key',1,1,'active',1,'2026-08-01','2026-08-01','2026-08-01','${environment}',1,'${digest}','${environment}',1);
      INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,position,config,version,created_at,updated_at)
      VALUES('${METHOD[key]}','${STORE}','provider','${PROFILE[key]}','${provider}','Fixture','${key === 'live' ? 'active' : 'disabled'}',0,'{"environment":"${environment}"}',1,'2026-08-01','2026-08-01');`;
  }
  // Historical synthetic rows are seeded only inside this disposable cluster.
  // Runtime claim/finalize tests below always use normal, enabled production APIs.
  const entries = [
    ...Array.from({ length: 25 }, (_, n) => ({ n: n + 1, key: 'test', created: '2026-08-06T09:00:00Z' })),
    ...Array.from({ length: 32 }, (_, n) => ({ n: n + 100, key: 'live',
      created: n === 2 ? '2026-08-06T09:45:00Z' : '2026-08-06T10:00:00Z' })),
    { n: 200, key: 'live', created: '2026-08-06T09:30:00Z', status: 'reconciliation_required', lease: true },
    { n: 201, key: 'live', created: '2026-08-06T09:30:00Z', digest: `sha256:${'d'.repeat(64)}` },
    { n: 202, key: 'iyzico', created: '2026-08-06T09:30:00Z' },
    { n: 203, key: 'live', created: '2026-08-06T11:50:00Z' },
  ];
  for (const entry of entries) {
    const environment = entry.key === 'live' ? 'live' : 'test';
    const provider = entry.key === 'iyzico' ? 'iyzico_iframe' : 'paytr_iframe';
    const digest = entry.digest ?? (entry.key === 'live' ? LIVE_DIGEST : entry.key === 'test' ? TEST_DIGEST : IYZICO_DIGEST);
    const status = entry.status ?? 'provider_outcome_unknown';
    const lease = entry.lease ? `${quote(id('f', entry.n))},'fixture-worker','2026-08-06T13:00:00Z'` : 'NULL,NULL,NULL';
    source += `INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
      VALUES('${id('8', entry.n)}','${STORE}','active',1,'2026-08-10','${entry.created}','${entry.created}');
      INSERT INTO saas.payment_attempts(id,store_id,payment_method_id,profile_id,provider_code,environment,credential_version,
        execution_adapter_version,execution_evidence_digest,order_reference,amount_minor,currency,status,safe_provider_reference,
        safe_code,reconciliation_lease_id,reconciliation_lease_owner,reconciliation_lease_expires_at,version,created_at,updated_at)
      VALUES('${id('6', entry.n)}','${STORE}','${METHOD[entry.key]}','${PROFILE[entry.key]}','${provider}','${environment}',1,
        1,'${digest}','sf:${id('7', entry.n)}',1000,'TRY','${status}','fixture-ref-${entry.n}','fixture_pending',${lease},3,'${entry.created}','${entry.created}');
      INSERT INTO saas.storefront_hosted_checkout_sessions(id,store_id,cart_id,payment_attempt_id,payment_method_id,profile_id,
        provider_code,environment,credential_version,execution_adapter_version,execution_evidence_digest,order_reference,
        order_id,customer_id,address_id,event_id,receipt_id,customer_credential_id,source_version,commerce_authority_digest,
        currency,subtotal_minor,shipping_minor,discount_minor,total_minor,delivery_snapshot,item_snapshot,status,safe_code,
        hold_expires_at,version,payment_session_key_id,payment_session_credential_digest,payment_session_expires_at,
        receipt_key_id,receipt_credential_digest,receipt_expires_at,customer_key_id,customer_credential_digest,customer_expires_at,created_at,updated_at)
      VALUES('${id('7', entry.n)}','${STORE}','${id('8', entry.n)}','${id('6', entry.n)}','${METHOD[entry.key]}','${PROFILE[entry.key]}',
        '${provider}','${environment}',1,1,'${digest}','sf:${id('7', entry.n)}',
        '${id('9', entry.n)}','${id('a', entry.n)}','${id('b', entry.n)}','${id('c', entry.n)}','${id('d', entry.n)}','${id('e', entry.n)}',
        1,'${'2'.repeat(64)}','TRY',1000,0,0,1000,'{}','[{"fixture":true}]','processing','fixture_pending',
        '${entry.created}'::timestamptz+interval '15 minutes',1,'fixture-pay','${'3'.repeat(64)}','${entry.created}'::timestamptz+interval '15 minutes',
        'fixture-receipt','${'4'.repeat(64)}','${entry.created}'::timestamptz+interval '1 day','fixture-customer','${'5'.repeat(64)}',
        '${entry.created}'::timestamptz+interval '30 days','${entry.created}','${entry.created}');`;
  }
  sql(source + 'COMMIT;');
}

function red() {
  const result = sql(`DO $f$ DECLARE live_count integer; test_count integer; BEGIN
    SELECT count(*) FILTER(WHERE attempt.environment='live'),count(*) FILTER(WHERE attempt.environment='test')
      INTO live_count,test_count FROM saas.storefront_hosted_checkout_reconciliation_candidates('${NOW}',25) candidate
      JOIN saas.payment_attempts attempt ON attempt.id=candidate.attempt_id;
    IF live_count=0 AND test_count=25 THEN RAISE EXCEPTION 'SCOPED_RECONCILIATION_TEST_25_STARVES_LIVE'; END IF;
    RAISE EXCEPTION 'STARVATION_FIXTURE_INVALID live=% test=%',live_count,test_count;
  END $f$;`, true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SCOPED_RECONCILIATION_TEST_25_STARVES_LIVE/u);
  pass('RED real SQL092 oldest TEST25 excludes every eligible LIVE payment');
}

function selected(input = scope, { raw = false, limit = 25, now = NOW } = {}) {
  const json = raw ? input : JSON.stringify(input);
  const source = json === null ? 'NULL::jsonb' : `${quote(json)}::jsonb`;
  return JSON.parse(value(`BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_workflow;
    SELECT coalesce(jsonb_agg(to_jsonb(candidate) ORDER BY candidate.candidate_position),'[]'::jsonb)
    FROM saas.storefront_hosted_checkout_reconciliation_candidates_scoped(${quote(now)}::timestamptz,${quote(limit)}::integer,${source}) candidate;
    COMMIT;`));
}
function claim(ordinal, version = 3) {
  const args = [id('6', ordinal), id('a', ordinal), '6'.repeat(64), version, 'fixture-worker', id('f', ordinal),
    NOW, '2026-08-06T12:10:00.000Z', 'live', 1, LIVE_DIGEST].map(quote).join(',');
  return JSON.parse(value(`SET ROLE celebix_saas_workflow;
    SELECT jsonb_build_object('outcome',outcome,'version',result_payload->'version','status',result_payload->'status')
    FROM saas.payment_attempt_claim_reconciliation(${args});`));
}
function finalize(ordinal, status) {
  const args = [id('6', ordinal), id('b', ordinal), '7'.repeat(64), 4, 'fixture-worker', id('f', ordinal),
    1, status, `fixture-ref-${ordinal}`, status === 'failed' ? 'fixture_failed' : 'provider_outcome_unknown',
    1000, 'TRY', '2026-08-06T12:00:01.000Z'].map(quote).join(',');
  return JSON.parse(value(`SET ROLE celebix_saas_workflow;
    SELECT jsonb_build_object('outcome',outcome,'version',result_payload->'version','status',result_payload->'status')
    FROM saas.payment_attempt_finalize_reconciliation(${args});`));
}
function predecessorFunctions() {
  return value(`SELECT coalesce(jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,
    'body',encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex'),
    'owner',proowner,'acl',proacl,'stable',provolatile,'securityDefiner',prosecdef,'config',proconfig)
    ORDER BY oid::regprocedure::text),'[]'::jsonb)
    FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN(
      'storefront_hosted_checkout_reconciliation_candidates','storefront_hosted_checkout_expire_created',
      'payment_attempt_claim_reconciliation','payment_attempt_finalize_reconciliation',
      'merchant_provider_execution_authority_matches','storefront_hosted_payment_execution_authority_matches');`);
}
function greenSelection() {
  const immutable = snapshot();
  const first = selected();
  assert.equal(first.length, 25);
  assert.deepEqual(first.map(row => row.candidate_position), Array.from({ length: 25 }, (_, n) => n + 1));
  assert.deepEqual(first.slice(0, 3).map(row => row.attempt_id), [id('6', 102), id('6', 100), id('6', 101)],
    'updated_at must outrank UUID lexical order; id resolves equal timestamps');
  assert.ok(first.every(row => row.provider_code === 'paytr_iframe' && row.environment === 'live'
    && row.adapter_version === 1 && row.evidence_digest === LIVE_DIGEST));
  assert.deepEqual(Object.keys(first[0]).sort(), ['attempt_id', 'attempt_version', 'attempt_status', 'credential_version',
    'provider_reference', 'provider_code', 'environment', 'adapter_version', 'evidence_digest', 'candidate_position'].sort());
  assert.ok(first.every(row => ![id('6', 200), id('6', 201), id('6', 202), id('6', 203)].includes(row.attempt_id)));
  pass('GREEN approved LIVE25 selected before limit while TEST history, wrong digest, active lease and unexpired hold are excluded');

  const invalid = [null, [], {}, 'scalar', 1, true, [null], [[]], [{ ...scope[0], injected: true }],
    [{ environment: 'live', adapterVersion: 1, evidenceDigest: LIVE_DIGEST }],
    [{ ...scope[0], providerCode: 'unapproved_provider' }], [{ ...scope[0], environment: 'production' }],
    ...[0, -1, 1.5, 2147483648, '1', null, true].map(adapterVersion => [{ ...scope[0], adapterVersion }]),
    ...[LIVE_DIGEST.toUpperCase(), `sha256:${'b'.repeat(63)}`, 'invalid', null, 1].map(evidenceDigest => [{ ...scope[0], evidenceDigest }]),
    [scope[0], scope[0]], [scope[0], { ...scope[0], evidenceDigest: TEST_DIGEST }],
    Array.from({ length: 5 }, () => scope[0])];
  for (const hostile of invalid) assert.deepEqual(selected(hostile), [], `hostile authority input ${JSON.stringify(hostile)}`);
  assert.deepEqual(selected(null, { raw: true }), []);
  for (const limit of [0, 26, -1, null]) assert.deepEqual(selected(scope, { limit }), []);
  for (const now of [null, 'infinity', '-infinity']) assert.deepEqual(selected(scope, { now }), []);
  pass('malformed, duplicate, oversized, missing and numeric boundary scopes fail closed without exceptions');

  for (const number of ['1.0', '1e0']) {
    const raw = JSON.stringify(scope).replace('"adapterVersion":1', `"adapterVersion":${number}`);
    assert.equal(selected(raw, { raw: true }).length, 25);
  }
  assert.equal(selected([{ ...scope[0], environment: 'test', evidenceDigest: TEST_DIGEST }]).length, 25);
  assert.deepEqual(selected([{ providerCode: 'iyzico_iframe', environment: 'test', adapterVersion: 1, evidenceDigest: IYZICO_DIGEST }]), []);
  assert.deepEqual(selected([{ ...scope[0], evidenceDigest: `sha256:${'d'.repeat(64)}` }]), []);
  pass('whole JSON numeric versions accepted; exact approved TEST scope works; revoked provider and wrong immutable digest are denied');

  const revoked = value(`BEGIN;UPDATE saas.merchant_provider_execution_authorities SET enabled=false
    WHERE provider_code='paytr_iframe' AND environment='live';SET LOCAL ROLE celebix_saas_workflow;
    SELECT count(*) FROM saas.storefront_hosted_checkout_reconciliation_candidates_scoped('${NOW}',25,'${JSON.stringify(scope)}'::jsonb);
    ROLLBACK;`);
  assert.equal(revoked, '0');
  assert.equal(selected().length, 25);
  assert.equal(snapshot(), immutable, 'selection and rollback authority checks must not mutate financial or inventory rows');
  pass('authority revocation denies candidates immediately and all read-only selectors preserve full payment/session/event/hold state');
}

function fairness() {
  assert.deepEqual(claim(102), { outcome: 'claimed', version: 4, status: 'reconciliation_required' });
  const inFlight = selected();
  assert.equal(inFlight[0].attempt_id, id('6', 100));
  assert.ok(inFlight.every(row => row.attempt_id !== id('6', 102)));
  pass('actual approved reconciliation claim removes the unexpired lease from concurrent selection');
  assert.deepEqual(finalize(102, 'provider_outcome_unknown'), { outcome: 'provider_outcome_unknown', version: 5, status: 'provider_outcome_unknown' });
  const advanced = selected();
  assert.deepEqual(advanced.map(row => row.attempt_id),
    [100, 101, ...Array.from({ length: 23 }, (_, n) => n + 103)].map(n => id('6', n)));
  assert.equal(value(`SELECT status FROM saas.payment_attempts WHERE id='${id('6', 102)}';`), 'provider_outcome_unknown');
  pass('actual unknown finalization advances updated_at fairly while retaining nonterminal financial truth');
  for (const row of advanced) {
    const ordinal = Number(row.attempt_id.slice(-12));
    assert.equal(claim(ordinal).outcome, 'claimed');
    assert.equal(finalize(ordinal, 'failed').outcome, 'failed');
  }
  const remaining = selected();
  assert.deepEqual(remaining.map(row => row.attempt_id), [126, 127, 128, 129, 130, 131, 102].map(n => id('6', n)));
  assert.deepEqual(remaining.map(row => row.candidate_position), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(value(`SELECT count(*) FROM saas.storefront_hosted_checkout_sessions WHERE store_id='${STORE}' AND status='failed';`), '25');
  pass('actual approved claim/finalize failure APIs expose eligible payments beyond the first25 and preserve ordering');
}

function privileges() {
  const signature = 'saas.storefront_hosted_checkout_reconciliation_candidates_scoped(timestamptz,integer,jsonb)';
  const metadata = JSON.parse(value(`SELECT jsonb_build_object('owner',proowner::regrole::text,'stable',provolatile='s',
    'securityDefiner',prosecdef,'config',proconfig,'workflow',has_function_privilege('celebix_saas_workflow',oid,'EXECUTE'),
    'forbiddenRoles',(SELECT count(*) FROM pg_roles role WHERE role.rolname IN(
      'celebix_saas_identity','celebix_saas_app','celebix_saas_host_resolver','celebix_saas_bootstrap',
      'celebix_saas_observability','celebix_saas_migrator') AND has_function_privilege(role.oid,procedure.oid,'EXECUTE')))
    FROM pg_proc procedure WHERE oid='${signature}'::regprocedure;`));
  assert.deepEqual(metadata, { owner: 'celebix_saas_owner', stable: true, securityDefiner: true,
    config: ['search_path=pg_catalog, saas'], workflow: true, forbiddenRoles: 0 });
  for (const role of ['celebix_saas_app', 'celebix_saas_host_resolver']) {
    const denied = sql(`SET ROLE ${role};SELECT * FROM ${signature.split('(')[0]}('${NOW}',25,'${JSON.stringify(scope)}'::jsonb);`, true);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /permission denied/u);
  }
  pass('only workflow can call the stable definer reader; app and host resolver execution are denied');
}

try {
  assertSafeEnvironment();
  assert.deepEqual(process.argv.slice(2).filter(arg => !['--red-only', '--up-only'].includes(arg)), []);
  assert.ok(process.argv.slice(2).length <= 1);
  const temporary = mkdtempSync('/tmp/celebix-scoped-hosted-reconciliation-');
  box = { temporary, data: path.join(temporary, 'data'), socket: path.join(temporary, 'socket'),
    port: 20000 + Math.floor(Math.random() * 10000), started: false };
  mkdirSync(box.socket, { mode: 0o700 });
  command('initdb', ['-D', box.data, '--auth=trust', '--username=postgres', '--no-locale', '--encoding=UTF8']);
  command('pg_ctl', ['-D', box.data, '-o', `-k ${box.socket} -p ${box.port} -h ''`, '-l', path.join(temporary, 'postgres.log'), 'start']);
  box.started = true;
  assert.match(value('SHOW server_version;'), /^16\./u);
  const migrations = readdirSync(SQL).filter(file => /^\d{12}/u.test(file) && Number(file.slice(8, 12)) <= 92
    && /(?:\.up|\.seed|\.freeze|_grants)\.sql$/u.test(file) && !file.includes('seed_guzide_pilot_admin_domain'))
    .sort((a, b) => Number(a.slice(8, 12)) - Number(b.slice(8, 12)) || a.localeCompare(b));
  for (const file of migrations) apply(file);
  const before = predecessor();
  const originalFunctions = predecessorFunctions();
  console.log(`SCOPED_RECONCILIATION_092_PREDECESSOR ${JSON.stringify(before)}`);
  assert.equal(before.hash, '5efc259384e5c2bfa727914cc218f9bf1f899ae11f062f8a9956b8b592ac559b');
  seed();
  red();
  if (!process.argv.includes('--red-only')) {
    apply(`${MIGRATION}.up.sql`);
    console.log(`SCOPED_RECONCILIATION_193_READER_SHA256 ${value("SELECT encode(sha256(convert_to(pg_get_functiondef('saas.storefront_hosted_checkout_reconciliation_candidates_scoped(timestamptz,integer,jsonb)'::regprocedure),'UTF8')),'hex');")}`);
    if (!process.argv.includes('--up-only')) apply(`${MIGRATION}_assertions.sql`);
    assert.deepEqual(predecessor(), before);
    assert.equal(predecessorFunctions(), originalFunctions);
    pass('SQL193 installs without altering the SQL092 body, owner or privileges');
    greenSelection();
    privileges();
    if (!process.argv.includes('--up-only')) {
      const rowsBeforeDown = snapshot();
      apply(`${MIGRATION}.down.sql`);
      assert.equal(value("SELECT to_regprocedure('saas.storefront_hosted_checkout_reconciliation_candidates_scoped(timestamptz,integer,jsonb)') IS NULL;"), 't');
      assert.deepEqual(predecessor(), before);
      assert.equal(predecessorFunctions(), originalFunctions);
      assert.equal(snapshot(), rowsBeforeDown);
      red();
      pass('DOWN removes only the scoped reader and preserves all rows and original execution boundaries');
      apply(`${MIGRATION}.up.sql`);
      apply(`${MIGRATION}_assertions.sql`);
      greenSelection();
      assert.equal(predecessorFunctions(), originalFunctions);
      pass('reapply restores approved scope selection without changing historical data or privileges');
    }
    fairness();
  }
  console.log(`SCOPED_HOSTED_RECONCILIATION_POSTGRESQL16_COMPLETE ${passed}/${passed}`);
} finally {
  if (box?.started) command('pg_ctl', ['-D', box.data, '-m', 'fast', 'stop'], '', true);
  if (box) rmSync(box.temporary, { recursive: true, force: true });
}
