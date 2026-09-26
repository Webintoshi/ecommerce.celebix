import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

// This fixture cannot accept a live database URL, a generic DATABASE_URL, or
// another rehearsal target. Every fixture write rolls back in one transaction.
const envFile = process.env.ORDER_NUMBER_QA_ENV_FILE;
const raw = envFile ? readFileSync(envFile, 'utf8').split('\n').find(line => line.startsWith('SAAS_TEST_DATABASE_URL='))?.slice('SAAS_TEST_DATABASE_URL='.length).trim() : undefined;
const connectionString = raw?.replace(/^(['"])(.*)\1$/, '$2') ?? process.env.ORDER_NUMBER_REHEARSAL_DATABASE_URL;
const TARGET = 'celebix_order_number_qa_20260926';
let target;
try { target = new URL(connectionString); } catch { throw new Error('named numbering clone URL required'); }
if (!['postgres:', 'postgresql:'].includes(target.protocol) || target.hostname !== '127.0.0.1' || target.port !== '65442'
  || target.pathname !== `/${TARGET}` || target.username !== 'postgres' || target.search || target.hash) throw new Error('named numbering clone URL required');
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 3000 });
const client = await pool.connect();
const id = n => `c1600000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const STORE = id(1), PRINCIPAL = id(2), MEMBER = id(3), PRODUCT = id(4), VARIANT = id(5);
const PLAN = '00000000-0000-4000-8000-000000000001';
const HOST = 'number160-integrations.saas-staging.celebix.net';
const NOW = '2026-09-28T10:00:00.000Z';
const LATER = '2026-09-28T10:01:00.000Z';
const AFTER = '2026-09-28T10:03:00.000Z';
const EXPIRES = '2026-09-29T10:00:00.000Z';
const CUSTOMER_EXPIRES = '2026-10-28T10:00:00.000Z';
const DELIVERY = { contact: { firstName: 'Number', lastName: 'QA', email: 'number160@qa.celebix.invalid', phone: '+905551112233' }, shippingAddress: { line1: 'Fixture Street 1', city: 'İstanbul', district: 'Kadıköy', postalCode: '34710', country: 'TR' } };
let cases = 0;
const pass = label => console.log(`PASS ${++cases} ${label}`);
const candidates = (keyId, digest) => [{ keyId, digest }];
const envelope = keyId => ({ algorithm: 'A256GCM', ciphertext: 'AQ', iv: 'AAAAAAAAAAAAAAAA', keyId, tag: 'AAAAAAAAAAAAAAAAAAAAAA', version: 1 });
const PROFILE = id(11), METHOD = id(12), CONFIG = id(13);
const QUICK_PROFILE = id(14), QUICK_METHOD = id(15);
const UNTRACKED = id(16), SECOND_TRACKED = id(17);
const ADDRESS = { recipientName: 'Number QA', phone: '+905551112233', line1: 'Fixture Street 1', city: 'Istanbul', postalCode: '34710', country: 'TR' };
async function role(name) { await client.query(`SET LOCAL ROLE ${name}`); }
async function rpc(name, values, authority = 'celebix_saas_host_resolver') {
  await role(authority);
  const result = await client.query(`SELECT outcome,result_payload FROM saas.${name}(${values.map((_, i) => `$${i + 1}`).join(',')})`, values);
  assert.equal(result.rows.length, 1, name);
  return result.rows[0];
}
async function seed() {
  await role('celebix_saas_owner');
  await client.query(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
    VALUES($1,'Number160 integration QA','number160-integrations','active','tr','TRY','hemenaku',$2,$2)`, [STORE, NOW]);
  await client.query(`INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
    VALUES($1,'https://qa.celebix.invalid','number160-integrations','number160@qa.celebix.invalid',true,$2,$2)`, [PRINCIPAL, NOW]);
  await client.query(`INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
    VALUES($1,$2,$3,'store_owner','active',$4,$4)`, [MEMBER, PRINCIPAL, STORE, NOW]);
  await client.query(`INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
    VALUES($1,$2,$3,'free_starter',1,'active',$4,$4,$4)`, [id(6), STORE, PLAN, NOW]);
  await client.query(`INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
    VALUES($1,$2,$3,'platform_subdomain','active',true,$4,$4,$4,1)`, [id(7), STORE, HOST, NOW]);
  await client.query(`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)
    VALUES($1,$2,'number160-product','Number160 product','active','TRY',$3,$3)`, [PRODUCT, STORE, NOW]);
  await client.query(`SELECT set_config('saas.inventory.source_marker','catalog_adjustment',true),set_config('saas.inventory.source_id',$1,true),set_config('saas.inventory.source_time',$2,true)`, [id(8), NOW]);
  await client.query(`INSERT INTO saas.product_variants(id,store_id,product_id,title,sku,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at)
    VALUES($1,$2,$3,'Standard','NUMBER160-QA',10000,true,100,'active',$4,$4)`, [VARIANT, STORE, PRODUCT, NOW]);
  await client.query(`INSERT INTO saas.product_variants(id,store_id,product_id,title,sku,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at)
    VALUES($1,$3,$4,'Untracked','NUMBER160-UNTRACKED',10000,false,100,'active',$5,$5),
    ($2,$3,$4,'Second tracked','NUMBER160-SECOND',10000,true,100,'active',$5,$5)`, [UNTRACKED, SECOND_TRACKED, STORE, PRODUCT, NOW]);
  await client.query(`INSERT INTO saas.payment_methods(id,store_id,kind,label,state,position,config,created_at,updated_at)
    VALUES($1,$2,'bank_transfer','Bank transfer','active',10,'{"accountHolder":"Number QA","bankName":"Fixture bank","iban":"TR330006100519786457841326","instructions":"Fixture only"}',$3,$3)`, [id(9), STORE, NOW]);
  await client.query(`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at)
    VALUES($1,$2,'shipping_setting','Fixture shipping','{"regions":["TR"],"estimatedDays":3,"shippingPriceCents":0}','active',$3,$3)`, [id(10), STORE, NOW]);
  // Match the clone's existing execution approval without changing this shared row.
  const execution = (await client.query(`SELECT adapter_version,evidence_digest FROM saas.merchant_provider_execution_authorities
    WHERE provider_code='paytr_iframe' AND environment='test' AND readiness='sandbox_ready' AND enabled`)).rows[0];
  assert.ok(execution, 'clone must have its existing approved PayTR test authority');
  await client.query(`INSERT INTO saas.merchant_provider_profiles(id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,last_validated_at,created_at,updated_at,execution_environment,execution_adapter_version,execution_evidence_digest,validation_environment,validation_adapter_version)
    VALUES($1,$2,'paytr_iframe','payment_processing','{"environment":"test"}','number160-***',$3,$4,'number160-provider',1,1,'active',1,$5,$5,$5,'test',$6,$7,'test',$6)`, [PROFILE, STORE, envelope('number160-provider'), '7'.repeat(64), NOW, execution.adapter_version, execution.evidence_digest]);
  await client.query(`INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,position,config,created_at,updated_at)
    VALUES($1,$2,'provider',$3,'paytr_iframe','Number160 test card','disabled',20,'{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}',$4,$4)`, [METHOD, STORE, PROFILE, NOW]);
  await client.query(`INSERT INTO saas.checkout_provider_configs(id,store_id,provider_key,status,public_origin,configuration_key_id,sealed_configuration,configuration_digest,version,created_at,updated_at)
    VALUES($1,$2,'paytr','active','https://www.paytr.com','number160-provider',$3,$4,1,$5,$5)`, [CONFIG, STORE, envelope('number160-provider'), '7'.repeat(64), NOW]);
  await client.query(`INSERT INTO saas.merchant_provider_execution_authorities(provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at)
    VALUES('iyzico_iframe','payment_processing','test',1,$1,'sandbox_ready',true,$2) ON CONFLICT(provider_code,environment) DO NOTHING`, [`sha256:${'8'.repeat(64)}`, NOW]);
  const quickExecution = (await client.query(`SELECT adapter_version,evidence_digest FROM saas.merchant_provider_execution_authorities WHERE provider_code='iyzico_iframe' AND environment='test' AND readiness='sandbox_ready' AND enabled`)).rows[0];
  assert.ok(quickExecution);
  // Install a historical profile predating tenant attestations. Restore every
  // trigger before running the real quick-link creator, authority and callback.
  await client.query('RESET ROLE'); await client.query('SET LOCAL session_replication_role=replica');
  await role('celebix_saas_owner');
  await client.query(`INSERT INTO saas.merchant_provider_profiles(id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,last_validated_at,created_at,updated_at,execution_environment,execution_adapter_version,execution_evidence_digest,validation_environment,validation_adapter_version)
    VALUES($1,$2,'iyzico_iframe','payment_processing','{"environment":"test"}','number160-quick-***',$3,$4,'number160-provider',1,1,'active',1,$5,$5,$5,'test',$6,$7,'test',$6)`, [QUICK_PROFILE, STORE, envelope('number160-provider'), '9'.repeat(64), NOW, quickExecution.adapter_version, quickExecution.evidence_digest]);
  await client.query(`INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,position,config,created_at,updated_at)
    VALUES($1,$2,'provider',$3,'iyzico_iframe','Number160 quick test card','active',30,'{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}',$4,$4)`, [QUICK_METHOD, STORE, QUICK_PROFILE, NOW]);
  await client.query('RESET ROLE'); await client.query('SET LOCAL session_replication_role=origin');
  await role('celebix_saas_owner');
}
async function cart(base) {
  const keyId = `number160-cart-${base}`, digest = base.toString(16).padStart(64, '0');
  const credentials = candidates(keyId, digest);
  const created = await rpc('public_cart_mutate', [HOST, NOW, '[]', id(base), keyId, digest, EXPIRES, id(base + 1), 'a'.repeat(64), 'add', 0, PRODUCT, VARIANT, 1]);
  assert.equal(created.outcome, 'committed');
  return credentials;
}
async function builtin(base, version = 'v2') {
  const credentials = await cart(base);
  const values = [HOST, NOW, 'cart', JSON.stringify(credentials), '[]', id(base + 2), 'b'.repeat(64), 1, JSON.stringify(DELIVERY), 'bank_transfer', id(base + 3), id(base + 4), id(base + 5), id(base + 6), id(base + 7), `receipt-${base}`, 'c'.repeat(64), EXPIRES, id(base + 8), `customer-${base}`, 'd'.repeat(64), CUSTOMER_EXPIRES];
  if (version === 'v2') values.push([]);
  const name = version === 'v2' ? 'public_checkout_complete_v2' : 'public_checkout_complete';
  // The old wrapper's public EXECUTE was deliberately retired; exercise its
  // still installed creator as owner without restoring a public grant.
  const completed = await rpc(name, values, version === 'v2' ? 'celebix_saas_host_resolver' : 'celebix_saas_owner');
  assert.equal(completed.outcome, 'committed', `${name}: ${JSON.stringify(completed)}`);
  return { name, values, completed, orderId: id(base + 3), receipt: candidates(`receipt-${base}`, 'c'.repeat(64)), customer: candidates(`customer-${base}`, 'd'.repeat(64)) };
}
async function quick(base, hosted = false, variants = [VARIANT]) {
  const digest = base.toString(16).padStart(64, '0'), redemption = (base + 1).toString(16).padStart(64, '0');
  const values = [STORE, PRINCIPAL, MEMBER, PLAN, 'free_starter', 1, NOW, id(base), variants.map((_, i) => id(base + 1 + i * 19)), variants, variants.map(() => 1), hosted ? QUICK_METHOD : CONFIG];
  if (hosted) values.push('a'.repeat(64), ['PHYSICAL'], 'number160-identity', JSON.stringify(envelope('number160-identity')));
  values.push('Number QA', `quick-${base}@qa.celebix.invalid`, '+905551112233', JSON.stringify(ADDRESS), JSON.stringify(ADDRESS), null, 'number160', 0, 0, 24, digest, 'number160-quick', JSON.stringify(envelope('number160-quick')), id(base + 2), 'b'.repeat(64));
  const created = await rpc(hosted ? 'quick_links_create_hosted' : 'quick_links_create', values, 'celebix_saas_app');
  assert.equal(created.outcome, 'committed', JSON.stringify(created));
  const claimed = await rpc('quick_links_claim_redemption', [HOST, digest, id(base + 3), redemption, NOW, '2026-09-28T10:15:00.000Z'], 'celebix_saas_workflow');
  assert.equal(claimed.outcome, 'claimed', JSON.stringify(claimed));
  return { linkId: id(base), redemption };
}
async function quickLegacy(base, variants = [VARIANT]) {
  const selected = await quick(base, false, variants);
  const merchantOid = base.toString(16).padStart(32, '0'), attemptId = id(base + 4);
  const begun = await rpc('checkout_begin_attempt', [HOST, selected.redemption, attemptId, merchantOid, id(base + 5), 'c'.repeat(64), NOW], 'celebix_saas_workflow');
  assert.equal(begun.outcome, 'committed', JSON.stringify(begun));
  const ready = await rpc('checkout_mark_provider_ready', [attemptId, id(base + 6), 'd'.repeat(64), JSON.stringify(envelope('number160-provider')), 'e'.repeat(64), NOW], 'celebix_saas_workflow');
  assert.equal(ready.outcome, 'committed', JSON.stringify(ready));
  const itemIds = variants.map((_, i) => id(base + 9 + i * 12)), amount = 10000 * variants.length;
  const values = [merchantOid, 'f'.repeat(64), id(base + 7), 'a'.repeat(64), 'success', amount, amount, 'TRY', 'card', 1, null, null, id(base + 8), itemIds, id(base + 10), `QO-LEGACY-${base}`, NOW];
  const settled = await rpc('checkout_settle_callback', values, 'celebix_saas_workflow');
  if (settled.outcome === 'invalid_input') {
    // Surface a creator exception that the safe callback envelope intentionally hides.
    await rpc('quick_checkout_settle_success_core', [attemptId, null, null, id(base + 8), itemIds, id(base + 10), `QO-LEGACY-${base}`, NOW], 'celebix_saas_owner');
  }
  assert.equal(settled.outcome, 'settled', JSON.stringify(settled));
  return { ...selected, merchantOid, attemptId, values, settled, orderId: id(base + 8) };
}
async function quickHosted(base) {
  const selected = await quick(base, true), attemptId = id(base + 4), binding = (base + 4).toString(16).padStart(64, '0');
  const authority = await rpc('quick_order_hosted_payment_authority', [HOST, selected.redemption, NOW], 'celebix_saas_workflow');
  assert.equal(authority.outcome, 'found', JSON.stringify(authority));
  const begun = await rpc('quick_order_hosted_payment_begin', [HOST, selected.redemption, attemptId, 'b'.repeat(64), binding, authority.result_payload.authorityDigest, NOW], 'celebix_saas_workflow');
  assert.equal(begun.outcome, 'created', JSON.stringify(begun));
  const initialized = await rpc('payment_attempt_mark_initialized', [attemptId, id(base + 5), 'c'.repeat(64), 1, 1, 'awaiting_customer', `provider-${base}`, 'iframe_ready', NOW], 'celebix_saas_workflow');
  assert.equal(initialized.outcome, 'awaiting_customer', JSON.stringify(initialized));
  const values = ['iyzico_iframe', binding, id(base + 6), 'd'.repeat(64), 'e'.repeat(64), 2, 1, 'captured', `provider-${base}`, 'payment_captured', 10000, 'TRY', NOW];
  const captured = await rpc('payment_attempt_apply_hosted_callback', values, 'celebix_saas_workflow');
  assert.equal(captured.outcome, 'captured', JSON.stringify(captured));
  return { ...selected, attemptId, values, captured, authority, begun };
}
async function standardHosted(base, version = 'v2') {
  const credentials = await cart(base), orderId = id(base + 2), customerId = id(base + 3), attemptId = id(base + 4), sessionId = id(base + 5);
  const authorityValues = [HOST, NOW, 'cart', JSON.stringify(credentials), 1, JSON.stringify(DELIVERY), METHOD];
  if (version === 'v2') authorityValues.push('[]', '[]', orderId, customerId, attemptId);
  const authority = await rpc(`public_storefront_hosted_checkout_authority${version === 'v2' ? '_v2' : ''}`, authorityValues);
  assert.equal(authority.outcome, 'found', JSON.stringify(authority));
  const binding = base.toString(16).padStart(64, '0');
  const values = [HOST, NOW, 'cart', JSON.stringify(credentials), 1, JSON.stringify(DELIVERY), METHOD, authority.result_payload.authorityDigest, attemptId, 'f'.repeat(64), sessionId, binding, orderId, authority.result_payload.customerId ?? customerId, id(base + 6), id(base + 7), id(base + 8), id(base + 9), `hosted-pay-${base}`, '1'.repeat(64), `hosted-receipt-${base}`, '2'.repeat(64), `hosted-customer-${base}`, '3'.repeat(64)];
  if (version === 'v2') values.push('[]', '[]', authority.result_payload.evaluatorAuthorityDigest);
  const name = `public_storefront_hosted_checkout_begin${version === 'v2' ? '_v2' : ''}`;
  const hostedRole = version === 'v2' ? 'celebix_saas_host_resolver' : 'celebix_saas_owner';
  const begun = await rpc(name, values, hostedRole);
  assert.equal(begun.outcome, 'created', JSON.stringify(begun));
  const replay = await rpc(name, values, hostedRole);
  assert.equal(replay.outcome, 'operation_replayed'); assert.deepEqual(replay.result_payload, begun.result_payload);
  const initialized = await rpc('payment_attempt_mark_initialized', [attemptId, id(base + 10), '4'.repeat(64), 1, 1, 'awaiting_customer', `hosted-provider-${base}`, 'iframe_ready', NOW], 'celebix_saas_workflow');
  assert.equal(initialized.outcome, 'awaiting_customer', JSON.stringify(initialized));
  // Initialization also advances the session in production; this is the worker's durable session step.
  await role('celebix_saas_owner');
  await client.query(`UPDATE saas.storefront_hosted_checkout_sessions SET status='provider_ready',safe_code='provider_ready',version=version+1,updated_at=$1 WHERE id=$2 AND store_id=$3`, [NOW, sessionId, STORE]);
  const callbackValues = ['paytr_iframe', binding, id(base + 11), '5'.repeat(64), (base + 12).toString(16).padStart(64, '0'), 2, 1, 'captured', `hosted-provider-${base}`, 'payment_captured', 10000, 'TRY', NOW];
  const captured = await rpc('payment_attempt_apply_hosted_callback', callbackValues, 'celebix_saas_workflow');
  assert.equal(captured.outcome, 'captured', JSON.stringify(captured));
  return { orderId, attemptId, sessionId, credentials, callbackValues, captured, authority, begun, receipt: candidates(`hosted-receipt-${base}`, '2'.repeat(64)), customer: candidates(`hosted-customer-${base}`, '3'.repeat(64)) };
}
try {
  const actual = await client.query(`SELECT current_database() AS database,current_setting('server_version') AS version`);
  assert.equal(actual.rows[0].database, TARGET); assert.match(actual.rows[0].version, /^16\./);
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout='15s'");
  await client.query("SET LOCAL lock_timeout='5s'");
  await seed();
  const v2 = await builtin(100);
  const legacy = await builtin(120, 'legacy');
  const paytr = await quickLegacy(200);
  const quickBridge = await quickHosted(240);
  await role('celebix_saas_owner');
  await client.query(`UPDATE saas.payment_methods SET state='disabled',version=version+1,updated_at=$1 WHERE store_id=$2 AND id=$3`, [NOW, STORE, QUICK_METHOD]);
  await client.query(`UPDATE saas.payment_methods SET state='active',version=version+1,updated_at=$1 WHERE store_id=$2 AND id=$3`, [NOW, STORE, METHOD]);
  const hostedV2 = await standardHosted(300);
  const hostedV1 = await standardHosted(340, 'legacy');
  assert.equal(v2.completed.result_payload.receipt.orderReference, 'WEB-000001', 'actual built-in V2 receipt must display first WEB number');
  await role('celebix_saas_owner');
  const stored = await client.query('SELECT order_number FROM saas.orders WHERE store_id=$1 AND id=$2', [STORE, v2.orderId]);
  assert.equal(stored.rows[0].order_number, 'WEB-000001');
  pass('real built-in V2 creator stores and returns the same WEB number');
  const replay = await rpc(v2.name, v2.values);
  assert.equal(replay.outcome, 'operation_replayed'); assert.deepEqual(replay.result_payload, v2.completed.result_payload);
  const read = await rpc('public_receipt_get_v2', [HOST, LATER, JSON.stringify(v2.receipt), JSON.stringify(v2.customer)]);
  assert.equal(read.outcome, 'found'); assert.equal(read.result_payload.orderReference, 'WEB-000001');
  pass('built-in retry and credential-authorized receipt preserve allocated WEB number');
  assert.equal(legacy.completed.result_payload.receipt.orderReference, 'WEB-000002');
  const legacyRead = await rpc('public_receipt_get', [HOST, LATER, JSON.stringify(legacy.receipt), JSON.stringify(legacy.customer)], 'celebix_saas_owner');
  assert.equal(legacyRead.outcome, 'found'); assert.equal(legacyRead.result_payload.orderReference, 'WEB-000002');
  pass('retired internal built-in wrapper also returns stored WEB number in legacy receipt');
  assert.equal(paytr.settled.result_payload.orderNumber, 'WEB-000003');
  const settledReplay = await rpc('checkout_settle_callback', paytr.values, 'celebix_saas_workflow');
  assert.equal(settledReplay.outcome, 'replayed'); assert.deepEqual(settledReplay.result_payload, paytr.settled.result_payload);
  await role('celebix_saas_owner');
  const legacyBinding = (await client.query(`SELECT attempt.merchant_oid,orders.order_number FROM saas.checkout_payment_attempts attempt JOIN saas.orders ON orders.store_id=attempt.store_id AND orders.id=attempt.settled_order_id WHERE attempt.id=$1`, [paytr.attemptId])).rows[0];
  assert.equal(legacyBinding.merchant_oid, paytr.merchantOid); assert.equal(legacyBinding.order_number, 'WEB-000003');
  pass('real PayTR quick-link success core and callback replay display WEB while merchant_oid remains frozen');
  const bridge = (await client.query(`SELECT bridge.order_number AS bridge_reference,orders.order_number,attempt.order_reference FROM saas.quick_order_hosted_payment_bridges bridge JOIN saas.payment_attempts attempt ON attempt.id=bridge.attempt_id JOIN saas.orders ON orders.store_id=bridge.store_id AND orders.id=bridge.order_id WHERE attempt.id=$1`, [quickBridge.attemptId])).rows[0];
  assert.match(bridge.bridge_reference, /^QO-[A-F0-9]{20}$/); assert.equal(bridge.order_number, 'WEB-000004');
  assert.equal(bridge.order_reference, `qo:${quickBridge.linkId}`); assert.equal(quickBridge.authority.result_payload.orderReference, bridge.order_reference);
  const bridgeReplay = await rpc('payment_attempt_apply_hosted_callback', quickBridge.values, 'celebix_saas_workflow');
  assert.equal(bridgeReplay.outcome, 'operation_replayed'); assert.deepEqual(bridgeReplay.result_payload, { ...quickBridge.captured.result_payload, replayed: true });
  pass('hosted quick-link capture allocates WEB while QO bridge and gateway authority remain frozen');
  for (const [hosted, number, version] of [[hostedV2, 'WEB-000005', 'v2'], [hostedV1, 'WEB-000006', 'legacy']]) {
    await role('celebix_saas_owner');
    const projection = (await client.query(`SELECT orders.order_number,attempt.order_reference,session.order_reference AS session_reference,operation.result_payload FROM saas.payment_attempts attempt JOIN saas.storefront_hosted_checkout_sessions session ON session.payment_attempt_id=attempt.id JOIN saas.orders ON orders.store_id=session.store_id AND orders.id=session.order_id JOIN saas.storefront_checkout_operations operation ON operation.order_id=orders.id AND operation.store_id=orders.store_id WHERE attempt.id=$1`, [hosted.attemptId])).rows[0];
    assert.equal(projection.order_number, number); assert.equal(projection.result_payload.receipt.orderReference, number);
    assert.equal(projection.order_reference, hosted.authority.result_payload.orderReference); assert.equal(projection.session_reference, projection.order_reference);
    const receipt = await rpc(version === 'v2' ? 'public_receipt_get_v2' : 'public_receipt_get', [HOST, AFTER, JSON.stringify(hosted.receipt), JSON.stringify(hosted.customer)], version === 'v2' ? 'celebix_saas_host_resolver' : 'celebix_saas_owner');
    assert.equal(receipt.outcome, 'found'); assert.equal(receipt.result_payload.orderReference, number);
    const callbackReplay = await rpc('payment_attempt_apply_hosted_callback', hosted.callbackValues, 'celebix_saas_workflow');
    assert.equal(callbackReplay.outcome, 'operation_replayed'); assert.deepEqual(callbackReplay.result_payload, { ...hosted.captured.result_payload, replayed: true });
    pass(`real hosted storefront ${version} callback, immutable operation and protected receipt agree on WEB number`);
  }
  for (const [base, variants, number, label] of [[400, [UNTRACKED], 'WEB-000007', 'zero tracked variants'], [440, [VARIANT, SECOND_TRACKED], 'WEB-000008', 'two tracked variants']]) {
    await role('celebix_saas_owner');
    const before = (await client.query(`SELECT id,stock_quantity FROM saas.product_variants WHERE store_id=$1 AND id=ANY($2::uuid[]) ORDER BY id`, [STORE, variants])).rows;
    const sale = await quickLegacy(base, variants);
    assert.equal(sale.settled.result_payload.orderNumber, number);
    await role('celebix_saas_owner');
    const after = (await client.query(`SELECT id,stock_quantity FROM saas.product_variants WHERE store_id=$1 AND id=ANY($2::uuid[]) ORDER BY id`, [STORE, variants])).rows;
    for (let i = 0; i < before.length; i++) assert.equal(Number(after[i].stock_quantity), Number(before[i].stock_quantity) - (variants[0] === UNTRACKED ? 0 : 1));
    const effects = (await client.query(`SELECT orders.order_number,(SELECT count(*)::integer FROM saas.order_items WHERE store_id=$1 AND order_id=$2) AS item_count,(SELECT count(*)::integer FROM saas.checkout_inventory_reservations WHERE store_id=$1 AND attempt_id=$3 AND status='consumed') AS consumed FROM saas.orders WHERE store_id=$1 AND id=$2`, [STORE, sale.orderId, sale.attemptId])).rows[0];
    assert.equal(effects.order_number, number); assert.equal(effects.item_count, variants.length); assert.equal(effects.consumed, variants.length);
    const replay = await rpc('checkout_settle_callback', sale.values, 'celebix_saas_workflow');
    assert.equal(replay.outcome, 'replayed'); assert.deepEqual(replay.result_payload, sale.settled.result_payload);
    await role('celebix_saas_owner');
    const replayStock = (await client.query(`SELECT id,stock_quantity FROM saas.product_variants WHERE store_id=$1 AND id=ANY($2::uuid[]) ORDER BY id`, [STORE, variants])).rows;
    assert.deepEqual(replayStock, after);
    const replayOrder = (await client.query(`SELECT count(*)::integer AS orders,(SELECT count(*)::integer FROM saas.order_events WHERE store_id=$1 AND order_id=$2) AS events FROM saas.orders WHERE store_id=$1 AND id=$2`, [STORE, sale.orderId])).rows[0];
    assert.deepEqual(replayOrder, { orders: 1, events: 1 });
    pass(`real quick settlement with ${label} commits allocated WEB, exact stock and one order on replay`);
  }
} finally {
  await client.query('ROLLBACK');
  assert.equal((await client.query('SELECT count(*)::integer AS count FROM saas.stores WHERE id=$1', [STORE])).rows[0].count, 0, 'all integration fixture writes must roll back');
  client.release();
  await pool.end();
}
console.log(`ORDER_NUMBER_INTEGRATIONS_POSTGRESQL16_COMPLETE ${cases}/${cases}`);
