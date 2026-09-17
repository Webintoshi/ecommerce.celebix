#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { assertSafeEnvironment } from '../../saas-phase2/postgres/disposable-harness.mjs';
import { parseStoreAdminInvitationView } from '../../../packages/saas-contracts/src/store-admin-invitations/validation.ts';
import pg from 'pg';
import { runInvitationMigrations } from '../../../apps/owner/scripts/apply-staging-invitation-migrations.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const SQL = path.join(ROOT, 'apps/owner/scripts/sql/saas');
const PREFIX = '202609170129_store_admin_invitations';
const SESSION_PREFIX = '202609170130_invitation_member_panel_sessions';
const MANAGER_PREFIX = '202609170131_store_admin_invitation_manager';
const NOW = '2026-09-17T12:00:00.000Z';
const LATER = '2026-09-17T12:02:00.000Z';
const PLAN = '00000000-0000-4000-8000-000000000001';
const STORE = randomUUID(), OTHER = randomUUID(), OWNER = randomUUID(), MEMBER = randomUUID();
const q = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const hash = value => createHash('sha256').update(value).digest('hex');
let box, count = 0;
const failures = [];
let warningCount=0, noticeCount=0;
function command(name, args, input = '', allowFailure = false) {
  const result = spawnSync(name, args, { cwd: ROOT, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C', LANG: 'C' } });
  if (result.error) throw result.error;
  warningCount+=(result.stderr.match(/^WARNING:/gm)??[]).length;
  noticeCount+=(result.stderr.match(/^NOTICE:/gm)??[]).length;
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr);
  return result;
}
function pgArgs(database = 'invitations') { return ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', box.socket, '-p', String(box.port), '-U', 'postgres', '-d', database]; }
function sql(text, database = 'invitations', allowFailure = false) { return command(box.psql, pgArgs(database), text, allowFailure); }
function value(text) { return sql(text).stdout.trim(); }
function asynchronous(text) {
  return new Promise((resolve, reject) => {
    const child = spawn(box.psql, pgArgs(), { env: { ...process.env, LC_ALL: 'C' } });
    let out = '', err = '';
    child.stdout.on('data', x => { out += x; }); child.stderr.on('data', x => { err += x; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err))); child.stdin.end(text);
  });
}
// Interactive sessions provide explicit transaction barriers without timing sleeps.
// Production functions are called unchanged; pg_stat_activity proves the interleaving.
function session(name) {
  const child=spawn(box.psql,pgArgs(),{env:{...process.env,LC_ALL:'C'}});
  let output='',errors='',closed=false;
  const waiters=[];
  child.stdout.on('data',chunk=>{output+=chunk; for(const wake of waiters.splice(0)) wake();});
  child.stderr.on('data',chunk=>{errors+=chunk;});
  const done=new Promise(resolve=>child.on('close',code=>{closed=true;for(const wake of waiters.splice(0)) wake();resolve({code,output,errors});}));
  child.stdin.write(`SET application_name=${q(name)}; SET statement_timeout='15s'; SET deadlock_timeout='100ms';\n`);
  return {
    send(text){child.stdin.write(text+'\n');},
    async marker(mark){
      const deadline=Date.now()+16000;
      while(!output.split('\n').includes(mark)) {
        if(closed) throw new Error(errors||`session ended before ${mark}`);
        if(Date.now()>deadline) throw new Error(`missing session marker ${mark}`);
        await new Promise(resolve=>{const timer=setTimeout(resolve,100);waiters.push(()=>{clearTimeout(timer);resolve();});});
      }
    },
    async end(){child.stdin.end();return done;},
    get closed(){return closed;},
    done,
  };
}
async function waitForDatabase(predicate,description) {
  const deadline=Date.now()+10000;
  while(value(`SELECT (${predicate});`)!=='t') {
    assert.ok(Date.now()<deadline,`database barrier timeout: ${description}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
function statement(expression, role = 'identity', finish = 'COMMIT') { return `BEGIN;SET LOCAL ROLE celebix_saas_${role};SELECT jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression};${finish};`; }
function call(expression, role = 'identity') { return JSON.parse(value(statement(expression, role))); }
function authority(now = NOW, store = STORE) { return [store, OWNER, MEMBER, PLAN, 'free_starter', 1, now].map(q).join(','); }
function candidate(generation = 1, invitationId = randomUUID()) {
  const ciphertext = 'ab'.repeat(80);
  return { invitationId, deliveryId: randomUUID(), generation, tokenDigest: hash(randomUUID()), sealVersion: 'ar1', keyId: 'invitation_request_01', ciphertext, ciphertextDigest: hash(Buffer.from(ciphertext, 'hex')), rendererVersion: 1 };
}
function source(overrides = {}) {
  const id = randomUUID();
  const config = { email: `recipient-${id}@example.test`, role: 'admin', expiresAt: '2026-09-24T12:00:00.000Z', ...overrides };
  sql(`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES(${q(id)},${q(STORE)},'administrator_invite','Test Recipient',${q(JSON.stringify(config))},'active',1,${q(NOW)},${q(NOW)});`);
  return { id, config };
}
function issueExpression(s, c, op = randomUUID(), fingerprint = hash(op), a = authority()) { return `saas.store_admin_invitation_issue(${a},${q(op)},${q(fingerprint)},${q(s.id)},1,${q(JSON.stringify(c))})`; }
function issued(overrides = {}) { const s = source(overrides), c = candidate(); const result = call(issueExpression(s, c)); assert.equal(result.outcome, 'issued'); return { s, c, result }; }
function grantExpression(item, changes = {}) {
  const g = { grantId: randomUUID(), grantDigest: hash(randomUUID()), browserKeyId: 'binding_01', browserDigest: hash('browser'), issuer: 'https://identity.example.test/oidc', subject: randomUUID(), email: item.s.config.email, verified: true, now: NOW, expiry: '2026-09-17T12:05:00.000Z', operationId: randomUUID(), ...changes };
  return { g, expression: `saas.store_admin_invitation_grant(${[item.c.invitationId, item.c.generation, item.c.tokenDigest, g.browserKeyId, g.browserDigest, g.issuer, g.subject, g.email, g.verified, g.grantId, g.grantDigest, g.operationId, hash(g.operationId), g.now, g.expiry].map(q).join(',')})` };
}
function granted(item, changes) { const x = grantExpression(item, changes); assert.equal(call(x.expression).outcome, 'granted'); return x.g; }
function acceptExpression(g, op = randomUUID(), changes = {}) { return `saas.store_admin_invitation_accept(${[g.grantDigest, g.browserKeyId, changes.browserDigest ?? g.browserDigest, op, hash(op), randomUUID(), randomUUID(), changes.now ?? NOW].map(q).join(',')})`; }
function action(kind, item, now = NOW, version = 1, extra = '') { return `saas.store_admin_invitation_${kind}(${authority(now)},${q(randomUUID())},${q(hash(randomUUID()))},${q(item.c.invitationId)},${version}${extra})`; }
async function test(name, fn) {
  count++;
  try { await fn(); process.stdout.write(`PASS ${count} ${name}\n`); }
  catch(error) { failures.push({name,error}); process.stdout.write(`FAIL ${count} ${name}: ${error.message}\n`); }
}
function apply(file, db = 'invitations') { sql(readFileSync(path.join(SQL, file), 'utf8'), db); }

try {
  assertSafeEnvironment();
  const dirs = [process.env.POSTGRES_BIN, ...readdirSync(path.join(homedir(), '.codex/tmp')).filter(x => /^postgresql-16\./.test(x)).map(x => path.join(homedir(), '.codex/tmp', x, 'bin')), ...(process.env.PATH ?? '').split(path.delimiter)].filter(Boolean);
  const bin = dirs.find(d => { try { for (const n of ['postgres', 'psql', 'initdb', 'pg_ctl']) accessSync(path.join(d, n), constants.X_OK); return true; } catch { return false; } });
  assert.ok(bin, 'PostgreSQL 16 native binaries required');
  assert.match(command(path.join(bin, 'postgres'), ['--version']).stdout, /16\./);
  const root = mkdtempSync('/tmp/celebix-invitations-');
  box = { root, data: path.join(root, 'data'), socket: path.join(root, 'socket'), port: 20000 + Math.floor(Math.random() * 15000), psql: path.join(bin, 'psql'), pgctl: path.join(bin, 'pg_ctl') };
  mkdirSync(box.socket, { mode: 0o700 });
  command(path.join(bin, 'initdb'), ['-D', box.data, '--auth=trust', '--username=postgres', '--no-locale', '--encoding=UTF8']);
  // fsync disabled only for this throwaway socket-only cluster; transaction semantics remain real.
  command(box.pgctl, ['-D', box.data, '-o', `-F -k ${box.socket} -p ${box.port} -h ''`, '-l', path.join(root, 'postgres.log'), 'start']);
  sql('CREATE DATABASE invitations;', 'postgres');
  const files = readdirSync(SQL).filter(f => Number(f.slice(8, 12)) <= 128 && /(?:\.up|\.seed|\.freeze|_grants|_assertions|catalog_assertions)\.sql$/.test(f)).sort((a,b) => Number(a.slice(8,12)) - Number(b.slice(8,12)) || ((/assertions/.test(a) ? 3 : /freeze|grants/.test(a) ? 2 : 1) - (/assertions/.test(b) ? 3 : /freeze|grants/.test(b) ? 2 : 1)) || a.localeCompare(b));
  // Existing 072 assertion casts an optional legacy table to regclass even when absent.
  // Apply its real up migration, but omit that fresh-schema-incompatible assertion.
  const excluded = ['202607310072_storefront_cart_checkout_assertions.sql','202607300073_seed_guzide_pilot_admin_domain.up.sql','202607300073_seed_guzide_pilot_admin_domain_assertions.sql'];
  for (const file of files) if(!excluded.includes(file)) apply(file);
  process.stdout.write(`BASELINE ${files.length-excluded.length} migration files through 128 applied; excluded optional legacy assertion and live-only pilot seed\n`);
  await test('T8 migration runner applies all invitation SQL atomically, recognizes complete state and rejects partial state', async () => {
    sql('CREATE DATABASE celebix_saas_staging_auth01 TEMPLATE invitations;', 'postgres');
    sql('CREATE ROLE invitation_migration_fixture LOGIN; GRANT celebix_saas_owner TO invitation_migration_fixture;', 'postgres');
    const run = () => runInvitationMigrations({ client: new pg.Client({ host: box.socket, port: box.port, user: 'invitation_migration_fixture', database: 'celebix_saas_staging_auth01' }), readSql: name => readFileSync(path.join(SQL,name),'utf8'), write() {} });
    assert.equal(await run(), 'applied');
    assert.equal(await run(), 'already_complete');
    sql('DROP FUNCTION saas.store_admin_invitation_manager(text,text,text,timestamptz);', 'celebix_saas_staging_auth01');
    await assert.rejects(run, /invitation_migration_failed/);
  });
  if (existsSync(path.join(SQL, `${PREFIX}.up.sql`))) apply(`${PREFIX}.up.sql`);
  await test('persistence migration exposes identity-only issue boundary', () => {
    assert.equal(value("SELECT to_regprocedure('saas.store_admin_invitation_issue(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb)') IS NOT NULL;"), 't');
  });
  apply(`${PREFIX}_assertions.sql`);
  if (existsSync(path.join(SQL, `${SESSION_PREFIX}.up.sql`))) { apply(`${SESSION_PREFIX}.up.sql`); apply(`${SESSION_PREFIX}_assertions.sql`); }
  if (existsSync(path.join(SQL, `${MANAGER_PREFIX}.up.sql`))) { apply(`${MANAGER_PREFIX}.up.sql`); apply(`${MANAGER_PREFIX}_assertions.sql`); }
  sql('CREATE DATABASE invitations_empty TEMPLATE invitations;', 'postgres');
  sql(`INSERT INTO saas.principals VALUES(${q(OWNER)},'https://identity.example.test/oidc','inviter','owner@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES (${q(STORE)},'Test Store','invite-test','active','tr','TRY','hemenaku','2026-01-01','2026-01-01'),(${q(OTHER)},'Other Store','invite-other','active','tr','TRY','hemenaku','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships VALUES(${q(MEMBER)},${q(OWNER)},${q(STORE)},'store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES(${q(randomUUID())},${q(STORE)},${q(PLAN)},'free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,version,created_at,updated_at,management) VALUES(${q(randomUUID())},${q(STORE)},'invite-test.admin.example.test','platform_subdomain','active',true,'2026-01-01',1,'2026-01-01','2026-01-01','platform');`);
  await test('issue snapshots source, queues ciphertext, creates no membership, and list matches exact public parser', () => {
    const item = issued();
    assert.deepEqual(parseStoreAdminInvitationView(item.result.result), item.result.result);
    assert.equal(value('SELECT count(*) FROM saas.memberships;'), '1');
    const list = call(`saas.store_admin_invitation_list(${authority()})`, 'app');
    assert.equal(list.outcome, 'listed'); list.result.items.forEach(parseStoreAdminInvitationView);
    assert.equal(value(`SELECT count(*) FROM saas.merchant_admin_records WHERE id=${q(item.s.id)};`), '1');
  });
  await test('T8 identity manager resolver requires durable owner session and verified same-store host', () => {
    const digest = hash(randomUUID());
    const current = value("SELECT saas.merchant_admin_timestamp(clock_timestamp());");
    const issued = value(`BEGIN; SET LOCAL ROLE celebix_saas_identity; SELECT outcome FROM saas.issue_panel_session(${q(randomUUID())},${q(randomUUID())},${q(randomUUID())},'manager_key',${q(digest)},${q(OWNER)},${q(STORE)},${q(current)},${q(current)}::timestamptz+interval '1 hour'); COMMIT;`);
    assert.equal(issued, 'issued');
    const expression = host => `saas.store_admin_invitation_manager('manager_key',${q(digest)},${q(host)},clock_timestamp())`;
    assert.deepEqual(call(expression('invite-test.admin.example.test')).result, { storeId: STORE, principalId: OWNER, membershipId: MEMBER, planId: PLAN, planCode: 'free_starter', planVersion: 1 });
    for (const host of ['foreign.admin.example.test','panel.example.test','INVITE-TEST.admin.example.test']) assert.equal(call(expression(host)).outcome, 'membership_denied');
    for (const change of ["role='admin'", "status='revoked'"]) {
      sql(`UPDATE saas.memberships SET ${change} WHERE id=${q(MEMBER)};`);
      assert.equal(call(expression('invite-test.admin.example.test')).outcome, 'membership_denied');
      sql(`UPDATE saas.memberships SET role='store_owner',status='active' WHERE id=${q(MEMBER)};`);
    }
    sql(`UPDATE saas.admin_domains SET verified_at=NULL,status='pending_verification',canonical=false WHERE store_id=${q(STORE)};`);
    assert.equal(call(expression('invite-test.admin.example.test')).outcome, 'membership_denied');
    sql(`UPDATE saas.admin_domains SET verified_at='2026-01-01',status='active',canonical=true WHERE store_id=${q(STORE)};`);
    for (const role of ['app','workflow']) assert.notEqual(sql(statement(expression('invite-test.admin.example.test'),role),'invitations',true).status,0);
  });
  await test('tenant, nonowner and revoked inviter cannot issue or list', () => {
    const s = source(), c = candidate();
    assert.equal(call(issueExpression(s, c, randomUUID(), hash('x'), authority(NOW, OTHER))).outcome, 'membership_denied');
    for (const change of ["role='admin'", "role='analyst'", "status='revoked'"]) {
      sql(`UPDATE saas.memberships SET ${change} WHERE id=${q(MEMBER)};`);
      assert.equal(call(issueExpression(s,c)).outcome, 'membership_denied');
      assert.equal(call(`saas.store_admin_invitation_list(${authority()})`, 'app').outcome, 'membership_denied');
      sql(`UPDATE saas.memberships SET role='store_owner',status='active' WHERE id=${q(MEMBER)};`);
    }
  });
  await test('invalid source roles emails expiry and source versions fail closed', () => {
    for (const overrides of [{ role: 'store_owner' },{ email:'Name <x@example.test>' },{ email:'ü@example.test' },{ email:'K@example.test' },{ email:'x..y@example.test' },{ email:'x@-a.test' },{ expiresAt:'2026-01-01T00:00:00Z' }]) assert.equal(call(issueExpression(source(overrides),candidate())).outcome,'invalid_source');
    assert.equal(issued({email:'  INVITE@EXAMPLE.TEST  '}).result.result.email,'invite@example.test');
    const s=source(); sql(`UPDATE saas.merchant_admin_records SET version=2 WHERE id=${q(s.id)};`);
    assert.equal(call(issueExpression(s,candidate())).outcome,'version_conflict');
  });
  await test('source reader rejects relative and noncanonical expiry before rendering or issue', () => {
    for (const expiresAt of ['tomorrow', 'infinity', '09/24/2026', '2026-09-24', '2026-09-24T12:00:00+00:00', '2026-09-24T12:00:00.1Z', '2026-02-30T12:00:00.000Z']) {
      const s = source({ expiresAt });
      assert.equal(call(`saas.store_admin_invitation_source(${authority()},${q(s.id)},1)`).outcome, 'invalid_source', expiresAt);
      assert.equal(call(issueExpression(s, candidate())).outcome, 'invalid_source', expiresAt);
    }
    for (const expiresAt of ['2026-09-24T12:00:00Z', '2026-09-24T12:00:00.123Z']) assert.equal(issued({ expiresAt }).result.outcome, 'issued');
  });
  await test('concurrent identical issue and recovery create one invitation and immutable operation', async () => {
    const s=source(), c=candidate(), op=randomUUID(), fp=hash(op), expr=issueExpression(s,c,op,fp);
    const results=await Promise.all([asynchronous(statement(expr)),asynchronous(statement(expr))]);
    assert.deepEqual(results.map(x=>JSON.parse(x).outcome).sort(),['issued','operation_replayed']);
    assert.equal(value(`SELECT count(*) FROM saas.store_admin_invitations WHERE source_record_id=${q(s.id)};`),'1');
    assert.equal(call(`saas.store_admin_invitation_recover_operation(${authority()},${q(op)},${q(fp)})`).outcome,'operation_replayed');
    assert.equal(call(issueExpression(source(),candidate(),op,fp)).outcome,'operation_conflict');
    assert.equal(call(issueExpression(s,candidate(),randomUUID())).outcome,'already_converted');
  });
  await test('rollback leaves no invitation outbox operation or audit', () => {
    const s=source(), c=candidate(), op=randomUUID();
    sql(statement(issueExpression(s,c,op), 'identity','ROLLBACK'));
    assert.equal(value(`SELECT count(*) FROM saas.store_admin_invitations WHERE id=${q(c.invitationId)};`),'0');
    assert.equal(value(`SELECT count(*) FROM saas.store_admin_invitation_operations WHERE operation_id=${q(op)};`),'0');
    assert.equal(value(`SELECT count(*) FROM saas.store_admin_invitation_deliveries WHERE invitation_id=${q(c.invitationId)};`),'0');
  });
  await test('converted source fields freeze and immutable audit rejects mutation', () => {
    const item=issued();
    for (const change of ["name='Changed'", "config=config||'{\"role\":\"editor\"}'::jsonb", "record_kind='general_setting'"]) assert.notEqual(sql(`UPDATE saas.merchant_admin_records SET ${change} WHERE id=${q(item.s.id)};`,'invitations',true).status,0);
    for (const table of ['events','operations']) assert.notEqual(sql(`DELETE FROM saas.store_admin_invitation_${table};`,'invitations',true).status,0);
  });
  await test('unverified wrong email and wrong browser never grant membership', () => {
    const item=issued();
    assert.equal(call(grantExpression(item,{verified:false}).expression).outcome,'unverified_identity');
    assert.equal(call(grantExpression(item,{email:'other@example.test'}).expression).outcome,'email_mismatch');
    const g=granted(item);
    assert.equal(call(acceptExpression(g,randomUUID(),{browserDigest:hash('wrong')})).outcome,'invitation_unavailable');
    assert.equal(call(acceptExpression(g,randomUUID(),{now:'2026-09-17T12:06:00Z'})).outcome,'invitation_unavailable');
  });
  await test('explicit concurrent acceptance grants one membership and returns canonical admin destination', async () => {
    const item=issued(), g=granted(item), op=randomUUID(), expr=acceptExpression(g,op);
    const results=await Promise.all([asynchronous(statement(expr)),asynchronous(statement(expr))]);
    assert.deepEqual(results.map(x=>JSON.parse(x).outcome).sort(),['accepted','operation_replayed']);
    const result=JSON.parse(results[0]).result;
    assert.equal(result.adminHostname,'invite-test.admin.example.test'); assert.equal(result.role,'admin');
    assert.equal(value(`SELECT count(*) FROM saas.memberships WHERE store_id=${q(STORE)} AND principal_id=${q(result.principalId)};`),'1');
    assert.equal(call(acceptExpression(g)).outcome,'invitation_unavailable');
    assert.equal(call(`saas.store_admin_invitation_recover_acceptance(${[g.grantDigest,g.browserKeyId,g.browserDigest,op,hash(op),LATER].map(q).join(',')})`).outcome,'operation_replayed');
  });
  await test('existing higher role is preserved and inactive memberships never reactivate', () => {
    for (const [status,existingRole] of [['active','admin'],['active','store_owner'],['revoked','admin'],['invited','admin']]) {
      const item=issued({role:'editor'}), pid=randomUUID(), mid=randomUUID(), subject=randomUUID();
      sql(`INSERT INTO saas.principals VALUES(${q(pid)},'https://identity.example.test/oidc',${q(subject)},${q(item.s.config.email)},true,${q(NOW)},${q(NOW)}); INSERT INTO saas.memberships VALUES(${q(mid)},${q(pid)},${q(STORE)},${q(existingRole)},${q(status)},${q(NOW)},${q(NOW)});`);
      const result=call(acceptExpression(granted(item,{subject})));
      assert.equal(result.outcome,status==='active'?'accepted':'revoked_membership');
      assert.equal(value(`SELECT role||':'||status FROM saas.memberships WHERE id=${q(mid)};`),`${existingRole}:${status}`);
    }
  });
  await test('resend rotates authority and enforces one per minute and five per hour', () => {
    const item=issued(), g=granted(item), next=candidate(2,item.c.invitationId);
    assert.equal(call(action('resend',item,NOW,1,`,${q(JSON.stringify(next))}`)).outcome,'rate_limited');
    assert.equal(call(action('resend',item,LATER,1,`,${q(JSON.stringify(next))}`)).outcome,'resent');
    assert.equal(call(`saas.store_admin_invitation_resolve(${q(item.c.tokenDigest)},${q(LATER)})`).outcome,'invitation_unavailable');
    assert.equal(call(acceptExpression(g,randomUUID(),{now:LATER})).outcome,'invitation_unavailable');
    for(let generation=3;generation<=6;generation++) assert.equal(call(action('resend',item,`2026-09-17T12:${String(generation*2).padStart(2,'0')}:00Z`,generation-1,`,${q(JSON.stringify(candidate(generation,item.c.invitationId)))}`)).outcome,'resent');
    assert.equal(call(action('resend',item,'2026-09-17T12:20:00Z',6,`,${q(JSON.stringify(candidate(7,item.c.invitationId)))}`)).outcome,'rate_limited');
  });
  await test('revoked expired or inviter-revoked invitations cannot resolve accept or send', () => {
    for(const mode of ['revoke','expire','owner']) {
      const item=issued(),g=granted(item);
      if(mode==='revoke') assert.equal(call(action('revoke',item)).outcome,'revoked');
      if(mode==='owner') sql(`UPDATE saas.memberships SET status='revoked' WHERE id=${q(MEMBER)};`);
      const now=mode==='expire'?'2026-09-25T00:00:00Z':NOW;
      assert.equal(call(`saas.store_admin_invitation_resolve(${q(item.c.tokenDigest)},${q(now)})`).outcome,'invitation_unavailable');
      assert.equal(call(acceptExpression(g,randomUUID(),{now})).outcome,'invitation_unavailable');
      sql(`UPDATE saas.memberships SET status='active' WHERE id=${q(MEMBER)};`);
    }
  });
  await test('least privilege prevents app and workflow secret access and membership creation', () => {
    const item=issued(),g=granted(item);
    for(const role of ['app','workflow']) {
      for(const query of ['SELECT * FROM saas.store_admin_invitation_deliveries','SELECT * FROM saas.store_admin_invitation_acceptance_grants',`SELECT * FROM ${acceptExpression(g)}`,`UPDATE saas.memberships SET role='store_owner'`]) assert.notEqual(sql(`SET ROLE celebix_saas_${role};${query};`,'invitations',true).status,0);
      assert.notEqual(sql(statement(issueExpression(source(),candidate()),role),'invitations',true).status,0);
    }
  });
  await test('outbox lease fences stale workers, preserves payload and stops beyond replay horizon', () => {
    sql("UPDATE saas.store_admin_invitation_deliveries SET status='failed';");
    const item=issued(),lease1=randomUUID(),lease2=randomUUID();
    const claim=(lease,now,end)=>call(`saas.store_admin_invitation_delivery_claim('worker',${q(lease)},${q(now)},${q(end)},1,${q(STORE)},${q(item.s.config.email)})`,'workflow');
    const first=claim(lease1,NOW,'2026-09-17T12:01:00Z').result.items[0];
    const second=claim(lease2,LATER,'2026-09-17T12:03:00Z').result.items[0];
    assert.equal(first.deliveryId,item.c.deliveryId); assert.equal(second.deliveryId,first.deliveryId);
    assert.equal(first.ciphertext,second.ciphertext); assert.equal(first.idempotencyKey,`store-admin-invitation/v1/${item.c.invitationId}/1`); assert.equal(second.attemptCount,2);
    const settle=(lease,kind,now=LATER)=>call(`saas.store_admin_invitation_delivery_settle(${[item.c.deliveryId,lease,'worker',now,kind,'provider-129',null,'2026-09-17T12:04:00Z'].map(q).join(',')})`,'workflow');
    assert.equal(settle(lease1,'provider_accepted').outcome,'stale_lease');
    assert.equal(settle(lease2,'delivered').outcome,'invalid_input');
    assert.equal(settle(lease2,'retry').outcome,'settled');
    assert.equal(claim(randomUUID(),'2026-09-18T11:56:00Z','2026-09-18T11:57:00Z').result.items.length,0);
    assert.equal(value(`SELECT status FROM saas.store_admin_invitation_deliveries WHERE id=${q(item.c.deliveryId)};`),'outcome_unknown');
    assert.equal(value(`SELECT saas.merchant_admin_timestamp(first_attempt_at) FROM saas.store_admin_invitation_deliveries WHERE id=${q(item.c.deliveryId)};`),NOW);
  });
  await test('provider acceptance is not delivered; identity verified-event ingestion deduplicates', () => {
    const item=issued(),lease=randomUUID();
    const claim=call(`saas.store_admin_invitation_delivery_claim('events',${q(lease)},${q(NOW)},'2026-09-17T12:01:00Z',1,${q(STORE)},${q(item.s.config.email)})`,'workflow');
    assert.equal(claim.result.items[0].deliveryId,item.c.deliveryId);
    assert.equal(call(`saas.store_admin_invitation_delivery_settle(${[item.c.deliveryId,lease,'events',NOW,'provider_accepted','provider-event-129',null,null].map(q).join(',')})`,'workflow').outcome,'settled');
    assert.equal(value(`SELECT status FROM saas.store_admin_invitation_deliveries WHERE id=${q(item.c.deliveryId)};`),'provider_accepted');
    const event="saas.store_admin_invitation_delivery_event('verified-event-129','provider-event-129','delivered','2026-09-17T12:00:30Z')";
    assert.notEqual(sql(statement(event,'workflow'),'invitations',true).status,0);
    assert.equal(call(event).outcome,'recorded'); assert.equal(call(event).outcome,'operation_replayed');
    assert.equal(value(`SELECT status FROM saas.store_admin_invitation_deliveries WHERE id=${q(item.c.deliveryId)};`),'delivered');
  });
  await test('verified grant preview is read-only, proof-bound and identity-only', () => {
    const item=issued(),g=granted(item);
    const preview=(digest=g.browserDigest)=>`saas.store_admin_invitation_grant_preview(${[g.grantDigest,g.browserKeyId,digest,NOW].map(q).join(',')})`;
    const before=value('SELECT count(*) FROM saas.memberships;');
    const result=call(preview()); assert.equal(result.outcome,'grant_available');
    assert.equal(result.result.storeName,'Test Store');
    assert.equal(result.result.email,item.s.config.email); assert.equal(result.result.issuer,g.issuer); assert.equal(result.result.subject,g.subject);
    assert.equal(call(preview(hash('wrong'))).outcome,'invitation_unavailable');
    assert.notEqual(sql(statement(preview(),'app'),'invitations',true).status,0);
    assert.equal(value('SELECT count(*) FROM saas.memberships;'),before);
  });
  await test('pre-send authority is freshly rechecked and lease tokens cannot be reused', () => {
    sql("UPDATE saas.store_admin_invitation_deliveries SET status='failed' WHERE status IN('queued','sending');");
    const item=issued(),lease=randomUUID();
    const claim=(now,end)=>`saas.store_admin_invitation_delivery_claim('dispatch',${q(lease)},${q(now)},${q(end)},1,${q(STORE)},${q(item.s.config.email)})`;
    assert.equal(call(claim(NOW,'2026-09-17T12:01:00Z'),'workflow').result.items[0].deliveryId,item.c.deliveryId);
    const check=`saas.store_admin_invitation_delivery_authorize(${[item.c.deliveryId,lease,'dispatch',NOW].map(q).join(',')})`;
    const authorized=call(check,'workflow');
    assert.equal(authorized.outcome,'authorized');
    assert.equal(authorized.result.expiresAt,item.s.config.expiresAt);
    assert.equal(authorized.result.leaseExpiresAt,'2026-09-17T12:01:00.000Z');
    assert.equal(call(claim(LATER,'2026-09-17T12:03:00Z'),'workflow').outcome,'invalid_input');
    sql(`UPDATE saas.memberships SET status='revoked' WHERE id=${q(MEMBER)};`);
    assert.equal(call(check,'workflow').outcome,'invitation_unavailable');
    sql(`UPDATE saas.memberships SET status='active' WHERE id=${q(MEMBER)};`);
    assert.equal(call(action('revoke',item)).outcome,'revoked');
    assert.equal(call(check,'workflow').outcome,'invitation_unavailable');
  });
  await test('settlement replay is exact and retries stop at eight attempts', () => {
    const item=issued(); let now=NOW;
    for(let attempt=1;attempt<=8;attempt++) {
      const lease=randomUUID(),minute=(attempt-1)*3;
      now=`2026-09-17T12:${String(minute).padStart(2,'0')}:00Z`;
      const end=`2026-09-17T12:${String(minute+1).padStart(2,'0')}:00Z`,next=`2026-09-17T12:${String(minute+2).padStart(2,'0')}:00Z`;
      const result=call(`saas.store_admin_invitation_delivery_claim('bounded',${q(lease)},${q(now)},${q(end)},1,${q(STORE)},${q(item.s.config.email)})`,'workflow');
      assert.equal(result.result.items[0].attemptCount,attempt);
      const settle=`saas.store_admin_invitation_delivery_settle(${[item.c.deliveryId,lease,'bounded',now,'retry',null,'provider_timeout',next].map(q).join(',')})`;
      assert.equal(call(settle,'workflow').outcome,'settled');
      assert.equal(call(settle,'workflow').outcome,'operation_replayed');
    }
    assert.equal(value(`SELECT status FROM saas.store_admin_invitation_deliveries WHERE id=${q(item.c.deliveryId)};`),'outcome_unknown');
    assert.equal(call(`saas.store_admin_invitation_delivery_claim('bounded',${q(randomUUID())},'2026-09-17T12:30:00Z','2026-09-17T12:31:00Z',1,${q(STORE)},${q(item.s.config.email)})`,'workflow').result.items.length,0);
  });
  await test('mid-transaction outbox failure rolls back invitation and audit', () => {
    const item=issued(),s=source(),c={...candidate(),deliveryId:item.c.deliveryId};
    assert.notEqual(sql(statement(issueExpression(s,c)),'invitations',true).status,0);
    assert.equal(value(`SELECT count(*) FROM saas.store_admin_invitations WHERE id=${q(c.invitationId)};`),'0');
    assert.equal(value(`SELECT count(*) FROM saas.store_admin_invitation_events WHERE invitation_id=${q(c.invitationId)};`),'0');
  });
  await test('source and resend rendering snapshots use central store display and immutable invite recipient', () => {
    const item=issued();
    const original=call(`saas.store_admin_invitation_source(${authority()},${q(item.s.id)},1)`);
    assert.equal(original.result.storeName,'Test Store');
    sql(`UPDATE saas.merchant_admin_records SET status='archived',archived_at=${q(NOW)},version=2 WHERE id=${q(item.s.id)};`);
    const snapshot=call(`saas.store_admin_invitation_resend_source(${authority()},${q(item.c.invitationId)},1)`);
    assert.equal(snapshot.outcome,'source'); assert.equal(snapshot.result.storeName,'Test Store'); assert.equal(snapshot.result.email,item.s.config.email);
  });
  await test('bounded invitation list signals truncation without exposing secret fields', () => {
    sql("UPDATE saas.store_admin_invitation_deliveries SET status='failed' WHERE status IN('queued','sending');");
    const fixture=[];
    for(let index=0;index<201;index++) {
      const s={id:randomUUID()},c=candidate();
      fixture.push(`INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES(${q(s.id)},${q(STORE)},'administrator_invite','List Recipient','{"email":"list-${index}@example.test","role":"analyst","expiresAt":"2026-09-24T12:00:00Z"}','active',1,${q(NOW)},${q(NOW)}); SELECT outcome FROM ${issueExpression(s,c)};`);
    }
    sql(fixture.join('\n'));
    const result=call(`saas.store_admin_invitation_list(${authority()})`,'app');
    assert.equal(result.result.items.length,200); assert.equal(result.result.hasMore,true);
    result.result.items.forEach(parseStoreAdminInvitationView);
  });
  await test('candidate JSON types and identifiers reject malformed encrypted-envelope metadata', () => {
    for(const change of [{generation:'1'},{keyId:true},{rendererVersion:'1'},{invitationId:'00000000-0000-0000-0000-000000000000'},{extra:'not-allowed'},{ciphertext:'ab'.repeat(32)+'a'}]) {
      const s=source(),c={...candidate(),...change};
      assert.equal(call(issueExpression(s,c)).outcome,'invalid_input');
    }
  });
  await test('settlement rejects raw provider bodies even on retry outcomes', () => {
    sql("UPDATE saas.store_admin_invitation_deliveries SET status='failed' WHERE status IN('queued','sending');");
    const item=issued(),lease=randomUUID();
    call(`saas.store_admin_invitation_delivery_claim('raw',${q(lease)},${q(NOW)},'2026-09-17T12:01:00Z',1,${q(STORE)},${q(item.s.config.email)})`,'workflow');
    assert.equal(call(`saas.store_admin_invitation_delivery_settle(${[item.c.deliveryId,lease,'raw',NOW,'retry','{"secret":"provider body"}',null,'2026-09-17T12:02:00Z'].map(q).join(',')})`,'workflow').outcome,'invalid_input');
  });
  await test('acceptance rollback preserves pending grant and creates no principal or membership', () => {
    const item=issued(),g=granted(item),op=randomUUID();
    const before=value('SELECT count(*) FROM saas.memberships;');
    const result=JSON.parse(value(statement(acceptExpression(g,op),'identity','ROLLBACK')));
    assert.equal(result.outcome,'accepted');
    assert.equal(value('SELECT count(*) FROM saas.memberships;'),before);
    assert.equal(value(`SELECT count(*) FROM saas.principals WHERE issuer=${q(g.issuer)} AND subject=${q(g.subject)};`),'0');
    assert.equal(value(`SELECT status FROM saas.store_admin_invitations WHERE id=${q(item.c.invitationId)};`),'pending');
    assert.equal(value(`SELECT consumed_at IS NULL FROM saas.store_admin_invitation_acceptance_grants WHERE id=${q(g.grantId)};`),'t');
  });
  await test('suspended store inactive subscription and wrong plan tuple invalidate pending authority', () => {
    const item=issued(),g=granted(item);
    for(const [table,where,blocked] of [['stores',`id=${q(STORE)}`,'suspended'],['subscriptions',`store_id=${q(STORE)}`,'inactive']]) {
      sql(`UPDATE saas.${table} SET status=${q(blocked)} WHERE ${where};`);
      assert.equal(call(acceptExpression(g)).outcome,'invitation_unavailable');
      sql(`UPDATE saas.${table} SET status='active' WHERE ${where};`);
    }
    assert.equal(call(issueExpression(source(),candidate(),randomUUID(),hash('wrong-plan'),authority().replace(PLAN,randomUUID()))).outcome,'durable_authority_invalid');
  });
  await test('I1 distinct invitations for the existing inviter accept concurrently without lock upgrades deadlocking', async () => {
    const first=issued({email:'owner@example.test'}),second=issued({email:'owner@example.test'});
    const grants=[granted(first,{subject:'inviter'}),granted(second,{subject:'inviter'})];
    const barrier=session('invitation-owner-barrier'),a=session('invitation-owner-a'),b=session('invitation-owner-b');
    let released=false;
    try {
      barrier.send("BEGIN; LOCK TABLE saas.admin_domains IN ACCESS EXCLUSIVE MODE; SELECT 'OWNER_BARRIER';");
      await barrier.marker('OWNER_BARRIER');
      a.send(statement(acceptExpression(grants[0]))); b.send(statement(acceptExpression(grants[1])));
      // Old code: both hold owner SHARE and wait on admin_domains. Fixed code:
      // the second waits on identity before acquiring owner authority locks.
      await waitForDatabase("(SELECT count(*) FROM pg_stat_activity WHERE application_name IN('invitation-owner-a','invitation-owner-b') AND wait_event_type='Lock')=2",'both acceptance calls reached the controlled lock barrier');
      barrier.send('COMMIT;');released=true;
      const results=await Promise.all([a.end(),b.end()]);
      for(const result of results) {
        assert.equal(result.code,0,result.errors);
        const accepted=JSON.parse(result.output.trim());
        assert.equal(accepted.outcome,'accepted'); assert.equal(accepted.result.principalId,OWNER); assert.equal(accepted.result.membershipId,MEMBER); assert.equal(accepted.result.role,'store_owner');
      }
      assert.equal(value(`SELECT count(*) FROM saas.memberships WHERE principal_id=${q(OWNER)} AND store_id=${q(STORE)};`),'1');
    } finally {
      if(!released) barrier.send('ROLLBACK;');await barrier.end();await Promise.all([a.end(),b.end()]);
    }
  });
  await test('I2 verified provider event racing settlement commit is reconciled and duplicate replay repairs retained evidence', async () => {
    sql("UPDATE saas.store_admin_invitation_deliveries SET status='failed' WHERE status IN('queued','sending');");
    const item=issued(),lease=randomUUID(),messageId='provider-race-129';
    call(`saas.store_admin_invitation_delivery_claim('race',${q(lease)},${q(NOW)},'2026-09-17T12:01:00Z',1,${q(STORE)},${q(item.s.config.email)})`,'workflow');
    const settler=session('invitation-settler'),eventer=session('invitation-eventer');
    const event=`saas.store_admin_invitation_delivery_event('verified-race-129',${q(messageId)},'delivered','2026-09-17T12:00:30Z')`;
    try {
      settler.send(`BEGIN; SET LOCAL ROLE celebix_saas_workflow; SELECT outcome FROM saas.store_admin_invitation_delivery_settle(${[item.c.deliveryId,lease,'race',NOW,'provider_accepted',messageId,null,null].map(q).join(',')}); SELECT 'SETTLED_UNCOMMITTED';`);
      await settler.marker('SETTLED_UNCOMMITTED');
      eventer.send(statement(event));
      // Existing code finishes while messageId is invisible. Fixed code waits on
      // the provider-message advisory lock until settlement commits.
      await waitForDatabase("EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='invitation-eventer' AND (wait_event_type='Lock' OR (state='idle' AND query LIKE '%COMMIT%')))",'event completed or waits on uncommitted settlement');
      settler.send('COMMIT;');
      const results=await Promise.all([settler.end(),eventer.end()]);
      for(const result of results) assert.equal(result.code,0,result.errors);
      const raced=value(`SELECT status FROM saas.store_admin_invitation_deliveries WHERE id=${q(item.c.deliveryId)};`);
      // Model evidence retained from a prior interrupted/racy integration; retry
      // of the same verified event must reconcile rather than return too early.
      sql(`UPDATE saas.store_admin_invitation_deliveries SET status='provider_accepted' WHERE id=${q(item.c.deliveryId)};`);
      assert.equal(call(event).outcome,'operation_replayed');
      const repaired=value(`SELECT status FROM saas.store_admin_invitation_deliveries WHERE id=${q(item.c.deliveryId)};`);
      assert.deepEqual([raced,repaired],['delivered','delivered']);
      assert.equal(value("SELECT count(*) FROM saas.store_admin_invitation_provider_events WHERE event_id='verified-race-129';"),'1');
    } finally {
      if(!settler.closed) settler.send('ROLLBACK;');await settler.end();await eventer.end();
    }
  });
  await test('I2 reverse event-before-settlement commit ordering also reconciles without a reverse lock cycle', async () => {
    sql("UPDATE saas.store_admin_invitation_deliveries SET status='failed' WHERE status IN('queued','sending');");
    const item=issued(),lease=randomUUID(),messageId='provider-reverse-129';
    call(`saas.store_admin_invitation_delivery_claim('reverse',${q(lease)},${q(NOW)},'2026-09-17T12:01:00Z',1,${q(STORE)},${q(item.s.config.email)})`,'workflow');
    const eventer=session('invitation-event-first'),settler=session('invitation-settle-second');
    try {
      eventer.send(`BEGIN;SET LOCAL ROLE celebix_saas_identity;SELECT outcome FROM saas.store_admin_invitation_delivery_event('verified-reverse-129',${q(messageId)},'delivered','2026-09-17T12:00:30Z');SELECT 'EVENT_UNCOMMITTED';`);
      await eventer.marker('EVENT_UNCOMMITTED');
      settler.send(`BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT outcome FROM saas.store_admin_invitation_delivery_settle(${[item.c.deliveryId,lease,'reverse',NOW,'provider_accepted',messageId,null,null].map(q).join(',')});SELECT 'REVERSE_SETTLED';`);
      await waitForDatabase("EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='invitation-settle-second' AND (wait_event_type='Lock' OR (state='idle in transaction' AND query LIKE '%REVERSE_SETTLED%')))",'settlement finished or waits on earlier event');
      eventer.send('COMMIT;');
      await settler.marker('REVERSE_SETTLED');settler.send('COMMIT;');
      for(const result of await Promise.all([eventer.end(),settler.end()])) assert.equal(result.code,0,result.errors);
      assert.equal(value(`SELECT status FROM saas.store_admin_invitation_deliveries WHERE id=${q(item.c.deliveryId)};`),'delivered');
    } finally {
      if(!eventer.closed) eventer.send('ROLLBACK;');await eventer.end();
      if(!settler.closed) settler.send('ROLLBACK;');await settler.end();
    }
  });
  await test('I3 source names obey JavaScript trim and 160 UTF16-unit public-view contract before issue', () => {
    const rejected=[];
    for(const name of ['\u00a0Recipient','Recipient\u00a0','😀'.repeat(81)]) {
      const s=source(),c=candidate();sql(`UPDATE saas.merchant_admin_records SET name=${q(name)} WHERE id=${q(s.id)};`);
      rejected.push(call(`saas.store_admin_invitation_source(${authority()},${q(s.id)},1)`).outcome);
      rejected.push(call(issueExpression(s,c)).outcome);
      rejected.push(value(`SELECT count(*) FROM saas.store_admin_invitations WHERE source_record_id=${q(s.id)};`));
    }
    assert.deepEqual(rejected,['invalid_source','invalid_source','0','invalid_source','invalid_source','0','invalid_source','invalid_source','0']);
    for(const name of ['😀'.repeat(80),'x'.repeat(160),'Recipient\u00a0Inside']) {
      const s=source(),c=candidate();sql(`UPDATE saas.merchant_admin_records SET name=${q(name)} WHERE id=${q(s.id)};`);
      const result=call(issueExpression(s,c));assert.equal(result.outcome,'issued');assert.equal(parseStoreAdminInvitationView(result.result).displayName,name);
    }
  });
  await test('T5 scoped claim never changes unrelated expired exhausted or cross-store jobs', () => {
    sql("UPDATE saas.store_admin_invitation_deliveries SET status='failed' WHERE status IN('queued','sending');");
    const expired=issued({expiresAt:'2026-09-17T12:01:00.000Z'}),exhausted=issued(),eligible=issued();
    sql(`UPDATE saas.store_admin_invitation_deliveries SET attempt_count=8 WHERE id=${q(exhausted.c.deliveryId)};`);
    const foreignSource=source({email:eligible.s.config.email}),foreignCandidate=candidate(),foreignMember=randomUUID();
    sql(`UPDATE saas.merchant_admin_records SET store_id=${q(OTHER)} WHERE id=${q(foreignSource.id)};
      INSERT INTO saas.memberships VALUES(${q(foreignMember)},${q(OWNER)},${q(OTHER)},'store_owner','active','2026-01-01','2026-01-01');
      INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES(${q(randomUUID())},${q(OTHER)},${q(PLAN)},'free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');`);
    const foreignAuthority=[OTHER,OWNER,foreignMember,PLAN,'free_starter',1,NOW].map(q).join(',');
    assert.equal(call(issueExpression(foreignSource,foreignCandidate,randomUUID(),hash('foreign-scope'),foreignAuthority)).outcome,'issued');
    const ids=[expired.c.deliveryId,exhausted.c.deliveryId,foreignCandidate.deliveryId].map(q).join(',');
    const snapshot=()=>value(`SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM saas.store_admin_invitation_deliveries d WHERE id IN(${ids});`);
    const before=snapshot();
    const result=call(`saas.store_admin_invitation_delivery_claim('scoped',${q(randomUUID())},${q(LATER)},'2026-09-17T12:03:00Z',20,${q(STORE)},${q(eligible.s.config.email)})`,'workflow');
    assert.equal(hash(snapshot()),hash(before),'unrelated delivery rows must remain byte-identical');
    assert.deepEqual(result.result.items.map(item=>item.deliveryId),[eligible.c.deliveryId]);
    assert.equal(value(`SELECT attempt_count FROM saas.store_admin_invitation_deliveries WHERE id=${q(eligible.c.deliveryId)};`),'1');
    const queueSnapshot=()=>value('SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM saas.store_admin_invitation_deliveries d;');
    const invalidBefore=hash(queueSnapshot());
    for(const [store,recipient] of [[null,eligible.s.config.email],[STORE,null],[STORE,'Recipient@EXAMPLE.TEST'],[STORE,' recipient@example.test '],[STORE,'invalid']]) {
      assert.equal(call(`saas.store_admin_invitation_delivery_claim('bad-scope',${q(randomUUID())},${q(LATER)},'2026-09-17T12:03:00Z',20,${q(store)},${q(recipient)})`,'workflow').outcome,'invalid_input');
    }
    assert.equal(hash(queueSnapshot()),invalidBefore);
    assert.notEqual(sql(statement(`saas.store_admin_invitation_delivery_claim('unscoped',${q(randomUUID())},${q(LATER)},'2026-09-17T12:03:00Z',20)`,'workflow'),'invitations',true).status,0);
  });
  await test('T6 active admin editor analyst normal exact-host login and recovery preserve owner-only writes', () => {
    for (const role of ['admin','editor','analyst']) {
      const item=issued({role}),g=granted(item),member=call(acceptExpression(g)).result;
      const operation=randomUUID(),session=randomUUID(),family=randomUUID(),digest=hash(operation);
      const identityCall=expression=>value(`BEGIN;SET LOCAL ROLE celebix_saas_identity;SELECT outcome FROM ${expression};COMMIT;`);
      const issue=()=>identityCall(`saas.issue_returning_panel_session_for_admin_host(${[g.issuer,g.subject,'invite-test.admin.example.test',session,family,operation,'session1',digest].map(q).join(',')},transaction_timestamp(),transaction_timestamp()+interval '1 hour')`);
      const recover=()=>identityCall(`saas.recover_returning_panel_session_for_admin_host(${[g.issuer,g.subject,'invite-test.admin.example.test',operation,'session1',digest].map(q).join(',')})`);
      assert.equal(issue(),'issued',role); assert.equal(recover(),'operation_replayed',role);
      const memberAuthority=[STORE,member.principalId,member.membershipId,PLAN,'free_starter',1,NOW].map(q).join(',');
      assert.equal(call(`saas.store_admin_invitation_list(${memberAuthority})`,'app').outcome,'membership_denied');
      assert.equal(call(issueExpression(source(),candidate(),randomUUID(),hash('member-cannot-invite'),memberAuthority)).outcome,'membership_denied');
      for(const status of ['revoked','invited']) {
        sql(`UPDATE saas.memberships SET status=${q(status)} WHERE id=${q(member.membershipId)};`);
        assert.equal(issue(),'membership_denied');assert.equal(recover(),'unavailable');
      }
      sql(`UPDATE saas.memberships SET status='active' WHERE id=${q(member.membershipId)};`);
      assert.equal(identityCall(`saas.recover_returning_panel_session_for_admin_host(${[g.issuer,g.subject,'wrong.admin.example.test',operation,'session1',digest].map(q).join(',')})`),'unavailable');
      assert.notEqual(sql(`UPDATE saas.principals SET email_verified=false WHERE id=${q(member.principalId)};`,'invitations',true).status,0,'durable principals cannot lose verified-email invariant');
      assert.equal(recover(),'operation_replayed');
    }
  });
  await test('T6 actual admin cross-host handoff120 and exact custom alias redemption125', () => {
    const item=issued(),g=granted(item),member=call(acceptExpression(g)).result;
    sql(`INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,version,created_at,updated_at,management,provider,cname_target) VALUES(${q(randomUUID())},${q(STORE)},'admin.custom.example.test','custom_alias','active',false,'2026-01-01',1,'2026-01-01','2026-01-01','merchant','cloudflare_for_saas','target.example.test');`);
    const sessionDigest=hash(randomUUID()),handoffDigest=hash(randomUUID());
    const identityCall=expression=>value(`BEGIN;SET LOCAL ROLE celebix_saas_identity;SELECT outcome FROM ${expression};COMMIT;`);
    assert.equal(identityCall(`saas.issue_returning_panel_session_for_admin_host(${[g.issuer,g.subject,'admin.custom.example.test',randomUUID(),randomUUID(),randomUUID(),'session1',sessionDigest].map(q).join(',')},transaction_timestamp(),transaction_timestamp()+interval '1 hour')`),'issued');
    assert.equal(identityCall(`saas.issue_cross_host_panel_handoff(${['session1',sessionDigest,randomUUID(),randomUUID(),'handoff1',handoffDigest,STORE,'admin.custom.example.test'].map(q).join(',')},transaction_timestamp(),transaction_timestamp()+interval '2 minutes')`),'handoff_issued');
    const redemption=[randomUUID(),randomUUID(),randomUUID(),'session1',hash(randomUUID())].map(q).join(',');
    assert.equal(identityCall(`saas.redeem_cross_host_panel_handoff('handoff1',${q(handoffDigest)},'wrong.example.test',${redemption},transaction_timestamp(),transaction_timestamp()+interval '1 hour')`),'unauthenticated');
    assert.equal(identityCall(`saas.redeem_cross_host_panel_handoff('handoff1',${q(handoffDigest)},'admin.custom.example.test',${redemption},transaction_timestamp(),transaction_timestamp()+interval '1 hour')`),'redeemed');
    assert.equal(value(`SELECT role FROM saas.memberships WHERE id=${q(member.membershipId)};`),'admin');
  });
  await test('T6 session down restores exact owner-only120 functions and can be reapplied', () => {
    if (!existsSync(path.join(SQL,`${SESSION_PREFIX}.down.sql`))) assert.fail('session migration missing');
    apply(`${SESSION_PREFIX}.down.sql`);
    const item=issued(),g=granted(item);call(acceptExpression(g));
    assert.equal(value(`BEGIN;SET LOCAL ROLE celebix_saas_identity;SELECT outcome FROM saas.issue_returning_panel_session_for_admin_host(${[g.issuer,g.subject,'invite-test.admin.example.test',randomUUID(),randomUUID(),randomUUID(),'session1',hash(randomUUID())].map(q).join(',')},transaction_timestamp(),transaction_timestamp()+interval '1 hour');COMMIT;`),'membership_denied');
    apply(`${SESSION_PREFIX}.up.sql`);apply(`${SESSION_PREFIX}_assertions.sql`);
  });
  await test('down refuses retained evidence; empty down/up is reversible', () => {
    const down=readFileSync(path.join(SQL,`${PREFIX}.down.sql`),'utf8');
    const blocked=sql(down,'invitations',true); assert.notEqual(blocked.status,0); assert.match(blocked.stderr,/INVITATION_DOWN_BLOCKED/);
    sql(down,'invitations_empty'); apply(`${PREFIX}.up.sql`,'invitations_empty'); apply(`${PREFIX}_assertions.sql`,'invitations_empty');
  });
  assert.equal(failures.length,0,failures.map(x=>`${x.name}: ${x.error.message}`).join('\n'));
  process.stdout.write(`${count}/${count} PASS PostgreSQL 16 invitation lifecycle; PostgreSQL warnings=${warningCount}, notices=${noticeCount}\n`);
} finally {
  if(box) { command(box.pgctl,['-D',box.data,'-m','fast','stop'],'',true); rmSync(box.root,{recursive:true,force:true}); }
}
