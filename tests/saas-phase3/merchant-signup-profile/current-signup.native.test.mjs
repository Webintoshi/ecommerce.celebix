import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {Pool} from 'pg';
import {COMMERCIAL_PACKAGES} from '../../../packages/saas-contracts/src/commercial-packages/catalog.ts';
import {PostgresSaaSDataRepository} from '../../../packages/saas-data/src/postgres/repository.ts';
import {createStarterTenantService} from '../../../packages/saas-tenant-core/src/create-starter-tenant.ts';
import {applyBaseline} from '../admin-login-security/baseline.mjs';
import {startDisposablePostgres} from './disposable-postgres.mjs';

const root = path.resolve(import.meta.dirname,'../../..');
const sqlDirectory = path.join(root,'apps/owner/scripts/sql/saas');
const digest = value => createHash('sha256').update(value).digest('hex');
const literal = value => `'${String(value).replaceAll("'","''")}'`;
const json = value => literal(JSON.stringify(value))+'::jsonb';
const forwardFiles = readdirSync(sqlDirectory)
  .filter(file => /^\d{12}/.test(file) && Number(file.slice(8,12))>227 && /(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file))
  .sort((a,b) => Number(a.slice(8,12))-Number(b.slice(8,12)) || a.localeCompare(b));
const forwardArtifacts = forwardFiles.map(file => ({file,sha256:digest(readFileSync(path.join(sqlDirectory,file)))}));
assert.ok(forwardArtifacts.length>0,'current forward migration inventory cannot be empty');
const offeredFree = COMMERCIAL_PACKAGES.filter(plan => plan.code==='free_starter');
assert.equal(offeredFree.length,1,'exactly one current commercial Free tariff is required');
const expected = offeredFree[0];
const fixture = startDisposablePostgres();
const {sql} = fixture;
const queryJson = source => JSON.parse(sql(source));
const command = (action,input) => queryJson(`SET ROLE celebix_saas_identity;SELECT row_to_json(r) FROM saas.merchant_whatsapp_command(${literal(action)},${json(input)}) r`);
let checks = 0;
const check = (name,fn) => {fn();console.log(`PASS ${++checks} ${name}`);};
let pool;

try {
  const baseline = applyBaseline(sql,sqlDirectory);
  for (const artifact of forwardArtifacts) {
    const source = readFileSync(path.join(sqlDirectory,artifact.file));
    assert.equal(digest(source),artifact.sha256,'forward source changed during rehearsal');
    try { sql(source.toString('utf8')); }
    catch (error) { throw new Error(`Current forward migration ${artifact.file} failed`,{cause:error}); }
  }
  check('all current production forward artifacts apply after the exact legacy baseline',() => {
    assert.equal(baseline.forwardArtifactCount,240);
    assert.deepEqual(readdirSync(sqlDirectory).filter(file => /^\d{12}/.test(file) && Number(file.slice(8,12))>227 && /(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file)).sort(),forwardFiles.toSorted());
  });

  // Release activation is fixture-only. A later offered tariff must also become
  // the native selector's default here; otherwise the catalog equality fails.
  sql(`SET ROLE celebix_saas_owner;
    UPDATE saas.commercial_package_release_state SET assignments_enabled=true;
    UPDATE saas.commercial248_release_state SET enabled=true;
    UPDATE saas.merchant_whatsapp_policy SET signup_enabled=true,central_hostnames=ARRAY['owner.example.test'];`);
  check('native current default and immutable SQL tariff match the offered TypeScript catalog',() => {
    assert.equal(Number(sql('SELECT saas.commercial_default_starter_version()')),expected.version);
    const tariff = queryJson(`SELECT jsonb_build_object('id',p.id,'code',p.plan_code,'version',p.version,'status',p.status,
      'features',(SELECT jsonb_agg(feature_key ORDER BY feature_ordinal) FROM saas.plan_features WHERE plan_id=p.id AND enabled),
      'limits',(SELECT jsonb_object_agg(limit_key,effective_limit) FROM saas.plan_limits WHERE plan_id=p.id))
      FROM saas.plans p WHERE p.plan_code='free_starter' AND p.version=saas.commercial_default_starter_version()`);
    assert.deepEqual(tariff,{id:expected.id,code:expected.code,version:expected.version,status:'active',features:[...expected.features],limits:{...expected.limits}});
  });

  const candidate = () => ({operationId:randomUUID(),sessionId:randomUUID(),familyId:randomUUID(),tokenKeyId:'test',tokenDigest:digest(randomUUID()),completionCiphertext:'encrypted.fixture.completion'});
  const prepare = label => {
    const binding = {pendingId:randomUUID(),pendingDigest:digest(randomUUID()),browserDigest:digest(randomUUID()),environment:'test'};
    const input = {...binding,operationId:randomUUID(),purpose:'signup',phoneKeyId:'phone-v1',phoneDigest:digest(label),phoneCiphertext:'encrypted.fixture.phone',phoneMasked:'***2233',destinationHostname:'owner.example.test',ipDigest:null,recipientBudgetDigest:digest(label),challengeId:randomUUID(),codeDigest:digest('001234')};
    assert.equal(command('prepare',input).outcome,'prepared');
    // Native delivery acknowledgement only: no WhatsApp/provider client exists
    // in this fixture and the PostgreSQL server has no TCP listener.
    assert.equal(command('finish_delivery',{...binding,challengeId:input.challengeId,status:'accepted'}).outcome,'accepted');
    assert.equal(command('verify',{...binding,...candidate(),challengeId:input.challengeId,codeDigest:input.codeDigest}).outcome,'phone_verified');
    return binding;
  };
  const inputFor = label => {
    const now = new Date().toISOString();
    return {schemaVersion:1,idempotencyKey:randomUUID(),principal:{kind:'whatsapp',proof:prepare(label),profile:{firstName:'İpek',lastName:'Yılmaz'}},store:{name:'Current Signup Fixture',slug:label,locale:'tr',currency:'TRY',themeKey:'starter'},consents:{privacyAcceptedAt:now},requestedAt:now};
  };
  pool = new Pool(fixture.poolOptions);
  let loseCommit = false, destroyedClients = 0;
  const databaseErrors = [];
  const instrumentedPool = {async connect() {
    const client = await pool.connect();
    return {async query(text,values) {
      let result;
      try { result = await client.query(text,values); }
      catch (error) {databaseErrors.push({code:error.code,constraint:error.constraint});throw error;}
      if (text==='COMMIT' && loseCommit) {loseCommit=false;throw new Error('fixture commit acknowledgement lost');}
      return result;
    },release(error) {if(error) destroyedClients++;client.release(error);}};
  }};
  const repository = new PostgresSaaSDataRepository({pool:instrumentedPool,generateId:() => randomUUID(),audit:() => {},timeouts:{poolCheckoutMs:1000,statementMs:5000,lockMs:2000,idleTransactionMs:8000},bootstrapRole:'celebix_saas_bootstrap',panelOrigin:'https://panel.saas-staging.celebix.net',adminOriginEnvironment:'staging_net'});
  const service = createStarterTenantService({repository,panelBaseUrl:'https://panel.saas-staging.celebix.net',adminOriginEnvironment:'staging_net',platformDomainSuffix:'saas-staging.celebix.net'});
  const assertCommitted = (input,result) => {
    assert.equal(result.ok,true,JSON.stringify({result,databaseErrors}));
    const value = result.value;
    assert.deepEqual({planId:value.plan.planId,planCode:value.plan.planCode,version:value.plan.version,features:value.plan.features,limits:value.plan.limits},
      {planId:expected.id,planCode:expected.code,version:expected.version,features:[...expected.features],limits:{...expected.limits}});
    assert.equal(value.panelUrl,`https://${input.store.slug}.admin.saas-staging.celebix.net`);
    assert.equal(value.storefrontUrl,`https://${input.store.slug}.saas-staging.celebix.net`);
    const id = literal(value.store.id), principal = literal(value.membership.principalId);
    assert.equal(sql(`SELECT status FROM saas.tenant_operations WHERE id=${literal(value.operationId)}`),'committed');
    assert.equal(sql(`SELECT count(*) FROM saas.tenant_operations WHERE idempotency_key=${literal(input.idempotencyKey)}`),'1');
    assert.equal(sql(`SELECT count(*) FROM saas.stores WHERE slug=${literal(input.store.slug)}`),'1');
    assert.equal(sql(`SELECT email IS NULL AND NOT email_verified FROM saas.principals WHERE id=${principal}`),'t');
    assert.equal(sql(`SELECT count(*) FROM saas.merchant_signup_profiles WHERE principal_id=${principal} AND first_name='İpek' AND last_name='Yılmaz'`),'1');
    assert.equal(sql(`SELECT count(*) FROM saas.memberships WHERE principal_id=${principal} AND store_id=${id} AND role='store_owner' AND status='active'`),'1');
    assert.equal(sql(`SELECT count(*) FROM saas.subscriptions WHERE store_id=${id} AND plan_id=${literal(expected.id)} AND plan_version=${expected.version} AND status='active'`),'1');
    assert.equal(sql(`SELECT count(*) FROM saas.admin_domains WHERE store_id=${id} AND hostname=${literal(new URL(value.panelUrl).hostname)} AND status='active' AND canonical AND verified_at IS NOT NULL`),'1');
    assert.equal(sql(`SELECT count(*) FROM saas.store_domains WHERE store_id=${id} AND hostname=${literal(new URL(value.storefrontUrl).hostname)} AND status='active' AND is_primary AND verified_at IS NOT NULL`),'1');
    assert.equal(sql(`SELECT published_config IS NOT NULL AND published_version>=1 FROM saas.storefront_designs WHERE store_id=${id}`),'t');
    assert.equal(sql(`SELECT signup_store_id=${id} AND signup_operation_id IS NOT NULL FROM saas.merchant_phone_pending WHERE pending_id=${literal(input.principal.proof.pendingId)}`),'t');
  };

  const input = inputFor('current-signup-native');
  const result = await service.execute(input);
  check('real current Free phone signup commits profile, tariff, tenant and published canonical destinations',() => assertCommitted(input,result));
  const replay = await service.execute(input);
  check('exact bootstrap retry returns the original operation and creates no duplicates',() => {
    assertCommitted(input,replay);
    assert.equal(replay.value.replayed,true);
    assert.equal(replay.value.operationId,result.value.operationId);
    assert.equal(replay.value.store.id,result.value.store.id);
    assert.deepEqual({...replay.value,replayed:false},{...result.value,replayed:false});
  });

  const complete = {...input.principal.proof,...candidate(),storeId:result.value.store.id};
  const issued = command('claim_signup',complete);
  check('native signup claim issues one resolvable WhatsApp panel session at the canonical origin',() => {
    assert.equal(issued.outcome,'issued');
    assert.equal(issued.authority.destinationOrigin,result.value.panelUrl);
    assert.equal(command('claim_signup',complete).outcome,'operation_replayed');
    const resolved = queryJson(`SET ROLE celebix_saas_identity;SELECT row_to_json(r) FROM saas.resolve_panel_session('test',${literal(complete.tokenDigest)},clock_timestamp()) r`);
    assert.equal(resolved.outcome,'resolved');
    assert.equal(sql(`SELECT count(*) FROM saas.panel_sessions WHERE session_id=${literal(complete.sessionId)} AND principal_id=${literal(result.value.membership.principalId)} AND active_store_id=${literal(result.value.store.id)}`),'1');
    assert.equal(sql(`SELECT authentication_method FROM saas.admin_login_assurance WHERE family_id=${literal(complete.familyId)}`),'whatsapp');
  });

  const uncertainInput = inputFor('current-signup-lost-ack');
  loseCommit = true;
  const uncertain = await service.execute(uncertainInput);
  const recovered = await service.execute(uncertainInput);
  check('lost commit acknowledgement discards its client and exact retry recovers one committed current tariff tenant',() => {
    assert.equal(uncertain.ok,false);
    assert.equal(destroyedClients,1);
    assertCommitted(uncertainInput,recovered);
    assert.equal(recovered.value.replayed,true);
  });

  const tables = ['tenant_operations','principals','stores','domains','store_domains','storefront_designs','admin_domains','memberships','subscriptions','store_media_namespaces','store_settings','merchant_signup_profiles','merchant_phone_pending'];
  const snapshot = () => tables.map(table => [table,sql(`SELECT md5(coalesce(string_agg(md5(to_jsonb(r)::text),',' ORDER BY to_jsonb(r)::text),'')) FROM saas.${table} r`)]);
  for (const kind of ['tampered','expired']) {
    const denied = inputFor(`current-signup-${kind}`);
    if (kind==='tampered') denied.principal.proof = {...denied.principal.proof,browserDigest:digest('wrong-browser')};
    else sql(`UPDATE saas.merchant_phone_pending SET created_at=created_at-interval '11 minutes',expires_at=expires_at-interval '11 minutes' WHERE pending_id=${literal(denied.principal.proof.pendingId)}`);
    const before = snapshot();
    const rejected = await service.execute(denied);
    check(`${kind} native phone proof rejects signup and rolls back every onboarding row`,() => {
      assert.equal(rejected.ok,false);
      assert.deepEqual(snapshot(),before);
      assert.equal(sql(`SELECT count(*) FROM saas.stores WHERE slug=${literal(denied.store.slug)}`),'0');
      assert.equal(sql(`SELECT signup_store_id IS NULL AND signup_operation_id IS NULL FROM saas.merchant_phone_pending WHERE pending_id=${literal(denied.principal.proof.pendingId)}`),'t');
    });
  }
  // Verify the receipt describes exactly the sources that remained on disk at
  // completion, including an artifact added while this process was running.
  const finalArtifacts = readdirSync(sqlDirectory).filter(file => /^\d{12}/.test(file) && Number(file.slice(8,12))>227 && /(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file)).sort((a,b) => Number(a.slice(8,12))-Number(b.slice(8,12)) || a.localeCompare(b)).map(file => ({file,sha256:digest(readFileSync(path.join(sqlDirectory,file)))}));
  assert.deepEqual(finalArtifacts,forwardArtifacts,'current forward sources changed during rehearsal');
  console.log('SIGNUP_CURRENT_RESULT='+JSON.stringify({schemaVersion:1,checks,baselineForwardArtifactCount:baseline.forwardArtifactCount,forwardArtifacts,currentFree:{id:expected.id,version:expected.version,features:[...expected.features],limits:{...expected.limits}},cases:{signup:'committed',bootstrapRetry:'replayed',panelSession:'resolved',lostCommitAcknowledgement:'recovered',tamperedProof:'rolled_back',expiredProof:'rolled_back'},externalConnections:0}));
} finally {
  try {if(pool) await pool.end();}
  finally {fixture.stop();}
}
