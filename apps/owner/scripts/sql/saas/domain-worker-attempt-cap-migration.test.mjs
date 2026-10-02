import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SQL = path.dirname(new URL(import.meta.url).pathname);
const PREFIX = '202610030202_domain_worker_attempt_cap';
const files = { up: `${PREFIX}.up.sql`, down: `${PREFIX}.down.sql`, verify: `${PREFIX}_assertions.sql` };
const source = file => readFileSync(path.join(SQL, file), 'utf8');
function extract(file, start, terminator) {
  const text = source(file), index = text.indexOf(start);
  assert.ok(index >= 0, 'real predecessor definition exists');
  const end = text.indexOf(terminator, index);
  assert.ok(end >= index);
  return text.slice(index, end + terminator.length);
}
const storeClaim = extract('202608050088_storefront_custom_domains.up.sql', 'CREATE FUNCTION saas.store_domain_work_claim(', '$function$;');
const adminClaim = extract('202609020120_tenant_custom_admin_domains.up.sql', 'CREATE FUNCTION saas.admin_domain_work_claim(', '$f$;');
const storeTable = extract('202608050088_storefront_custom_domains.up.sql', 'CREATE TABLE saas.store_domain_provisioning (', '\n);');
const signatures = ['store_domain_work_claim', 'admin_domain_work_claim'].map(name => `saas.${name}(text,timestamptz,timestamptz,integer,uuid)`);
const NOW = '2026-10-03T00:00:00Z';
const ids = Array.from({ length: 10 }, (_, i) => `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const lease = i => `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
function binary(name) {
  const base = path.join(homedir(), '.codex', 'tmp');
  const candidates = existsSync(base) ? readdirSync(base).filter(name => /^postgresql-16[.][0-9]+-install$/.test(name)).map(name => path.join(base, name, 'bin')) : [];
  for (const directory of [process.env.POSTGRES_BIN, process.env.CELEBIX_TEST_PG_BIN, ...(process.env.PATH ?? '').split(path.delimiter), ...candidates]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* next installed runtime */ }
  }
  throw new Error(`Local PostgreSQL16 ${name} is required; the test never contacts a remote database.`);
}

test('202 native PG16 capped storefront/admin claims continue to the next tenant and preserve authority', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'domain-cap-'));
  const socket = path.join(root, 'socket'), data = path.join(root, 'data');
  mkdirSync(socket, { mode: 0o700 });
  const pg = Object.fromEntries(['initdb', 'pg_ctl', 'psql'].map(name => [name, binary(name)]));
  const port = String(22000 + Math.floor(Math.random() * 20000));
  const run = (program, args, input = '', allowFailure = false) => {
    const result = spawnSync(program, args, { input, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C', LANG: 'C' } });
    if (result.error) throw result.error;
    if (!allowFailure) assert.equal(result.status, 0, result.stderr);
    return result;
  };
  const query = (input, allowFailure = false) => run(pg.psql, ['-h', socket, '-p', port, '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input, allowFailure);
  const concurrent = (input, application) => {
    const process = spawn(pg.psql, ['-h', socket, '-p', port, '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { env: { ...globalThis.process.env, PGAPPNAME: application, LC_ALL: 'C', LANG: 'C' } });
    let stdout = '', stderr = '';
    process.stdout.on('data', value => { stdout += value; }); process.stderr.on('data', value => { stderr += value; });
    const done = new Promise(resolve => { process.on('error', error => { stderr += String(error); resolve({ status: -1, stdout, stderr }); }); process.on('close', status => resolve({ status, stdout, stderr })); });
    process.stdin.end(input);
    return done;
  };
  const waitFor = async (input, message) => {
    const deadline = Date.now() + 750;
    do {
      if (query(input).stdout.trim() === 't') return;
      await new Promise(resolve => setTimeout(resolve, 15));
    } while (Date.now() < deadline);
    assert.fail(message);
  };
  const json = input => JSON.parse(query(input).stdout.trim());
  const metadata = () => json(`SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.proname) FROM pg_proc p WHERE oid IN(${signatures.map(s => `'${s}'::regprocedure`).join(',')});`);
  const bodies = () => json(`SELECT jsonb_agg(p.prosrc ORDER BY p.proname) FROM pg_proc p WHERE oid IN(${signatures.map(s => `'${s}'::regprocedure`).join(',')});`);
  const state = () => json(`SELECT jsonb_build_object('store',(SELECT jsonb_agg(to_jsonb(p) ORDER BY domain_id) FROM saas.store_domain_provisioning p),'admin',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM saas.admin_domains p));`);
  const claim = (name, n = 1, worker = 'test.worker', role = 'celebix_saas_workflow') => `SET ROLE ${role}; SELECT result_payload FROM saas.${name}('${worker}','${NOW}','2026-10-03T00:00:30Z',1,'${lease(n)}');`;
  let started = false;
  try {
    run(pg.initdb, ['-D', data, '--auth=trust', '--username=postgres', '--no-locale', '--encoding=UTF8', '--no-sync']);
    run(pg.pg_ctl, ['-D', data, '-o', `-k ${socket} -p ${port} -h ''`, '-l', path.join(root, 'postgres.log'), 'start']);
    started = true;
    assert.equal(query("SELECT current_setting('server_version_num')::integer/10000;").stdout.trim(), '16');
    query(`CREATE ROLE celebix_saas_owner NOLOGIN BYPASSRLS;
      CREATE ROLE celebix_saas_workflow NOLOGIN; CREATE ROLE celebix_saas_app NOLOGIN;
      CREATE ROLE celebix_saas_identity NOLOGIN; CREATE ROLE celebix_saas_host_resolver NOLOGIN;
      CREATE ROLE celebix_saas_bootstrap NOLOGIN; CREATE ROLE celebix_saas_observability NOLOGIN; CREATE ROLE celebix_saas_migrator NOLOGIN;
      CREATE SCHEMA saas AUTHORIZATION celebix_saas_owner;
      GRANT USAGE ON SCHEMA saas TO celebix_saas_workflow,celebix_saas_app;
      SET ROLE celebix_saas_owner;
      CREATE TABLE saas.store_domains(id uuid PRIMARY KEY,store_id uuid NOT NULL,hostname text NOT NULL,UNIQUE(store_id,id));
      ${storeTable}
      CREATE TABLE saas.admin_domains(id uuid PRIMARY KEY,store_id uuid NOT NULL,hostname text NOT NULL,kind text NOT NULL,
        provider_hostname_id text,attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 1000),
        next_check_at timestamptz NOT NULL,lease_id uuid,lease_owner text,lease_expires_at timestamptz,
        hostname_status text NOT NULL DEFAULT 'pending',ssl_status text NOT NULL DEFAULT 'pending',
        requested_removal boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL,version bigint NOT NULL DEFAULT 1,
        CONSTRAINT admin_domains_lease_check CHECK((lease_id IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL) OR(lease_id IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)));
      ALTER TABLE saas.admin_domains RENAME CONSTRAINT admin_domains_attempt_count_check TO admin_domains_attempt_check;
      CREATE FUNCTION saas.store_domain_timestamp(timestamptz) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT to_char($1 AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;
      CREATE FUNCTION saas.admin_domain_timestamp(timestamptz) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT saas.store_domain_timestamp($1) $$;
      ${storeClaim} ${adminClaim}
      REVOKE ALL ON FUNCTION ${signatures.join(',')} FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION ${signatures.join(',')} TO celebix_saas_workflow;
      ALTER TABLE saas.store_domain_provisioning ENABLE ROW LEVEL SECURITY; ALTER TABLE saas.store_domain_provisioning FORCE ROW LEVEL SECURITY;
      ALTER TABLE saas.admin_domains ENABLE ROW LEVEL SECURITY; ALTER TABLE saas.admin_domains FORCE ROW LEVEL SECURITY; RESET ROLE;`);
    for (const [index, id] of ids.entries()) {
      const store = ids[index], host = `tenant${index}.example.test`, count = index % 5 === 0 ? 1000 : 0;
      const due = `2026-10-02T${String(1 + index % 5).padStart(2, '0')}:00:00Z`;
      const bound = index % 5 === 3 ? 'NULL' : `'provider${index}'`;
      const leaseFields = index % 5 === 2 ? `'${lease(99)}','another.worker','2026-10-03T00:01:00Z'` : 'NULL,NULL,NULL';
      const statuses = index % 5 === 4 ? "'deleted','deleted'" : "'pending','pending'";
      if (index < 5) query(`SET ROLE celebix_saas_owner; INSERT INTO saas.store_domains VALUES('${id}','${store}','${host}'); INSERT INTO saas.store_domain_provisioning(domain_id,store_id,provider_hostname_id,cname_target,attempt_count,next_check_at,created_at,updated_at,lease_id,lease_owner,lease_expires_at,hostname_status,ssl_status)VALUES('${id}','${store}',${bound},'shops.example.test',${count},'${due}','2026-10-01','2026-10-01',${leaseFields},${statuses});`);
      else query(`SET ROLE celebix_saas_owner; INSERT INTO saas.admin_domains(id,store_id,hostname,kind,provider_hostname_id,attempt_count,next_check_at,updated_at,lease_id,lease_owner,lease_expires_at,hostname_status,ssl_status)VALUES('${id}','${store}','${host}','custom_alias',${bound},${count},'${due}','2026-10-01',${leaseFields},${statuses});`);
    }
    const originalMetadata = metadata(), originalBodies = bodies(), initialState = state();
    for (const name of ['store_domain_work_claim', 'admin_domain_work_claim']) {
      const result = query(claim(name), true);
      assert.notEqual(result.status, 0, 'baseline must reproduce the capped oldest row starving the queue');
      assert.match(result.stderr, /violates check constraint .*attempt_check/);
    }
    assert.deepEqual(state(), initialState, 'both rejected claim transactions remain atomic');
    if (existsSync(path.join(SQL, files.up))) query(source(files.up));
    const firstStore = query(claim('store_domain_work_claim'), true);
    assert.equal(firstStore.status, 0, 'capped oldest storefront must no longer reject the entire queue');
    assert.equal(JSON.parse(firstStore.stdout.trim()).items[0].attemptCount, 1000);
    assert.equal(json(claim('store_domain_work_claim', 2)).items[0].domainId, ids[1], 'next pending storefront is processed while capped row is leased');
    assert.equal(json(claim('admin_domain_work_claim', 3)).items[0].attemptCount, 1000);
    assert.equal(json(claim('admin_domain_work_claim', 4)).items[0].domainId, ids[6], 'next pending admin is processed');
    assert.deepEqual(json(claim('store_domain_work_claim', 5)), { items: [] }, 'leased, unbound and deleted storefronts remain excluded');
    assert.deepEqual(json(claim('admin_domain_work_claim', 6)), { items: [] }, 'leased, unbound and deleted admins remain excluded');
    const claimedState = state();
    for (const name of ['store_domain_work_claim', 'admin_domain_work_claim']) {
      assert.equal(query(`SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.${name}(' invalid','${NOW}','2026-10-03T00:00:30Z',1,'${lease(7)}');`).stdout.trim(), 'invalid_input');
      const denied = query(claim(name, 8, 'denied.worker', 'celebix_saas_app'), true);
      assert.notEqual(denied.status, 0); assert.match(denied.stderr, /permission denied for function/);
    }
    assert.deepEqual(state(), claimedState);
    assert.deepEqual(metadata(), originalMetadata, 'OID, owner, grants, argument contract, SECURITY DEFINER and search_path are exact');
    query(source(files.verify));
    query(source(files.up));
    assert.deepEqual(state(), claimedState, 'migration replay does not touch domain records');
    assert.deepEqual(metadata(), originalMetadata);
    const patchedBodies = bodies();
    const backupDenied = query('SET ROLE celebix_saas_app; SELECT * FROM saas.domain_worker_attempt_cap_backup_202;', true);
    assert.notEqual(backupDenied.status, 0, 'saved lifecycle definitions stay private');
    // Restore the stored source only if it still matches the approved patch; refuse drift.
    const changedDefinition = query(`SELECT pg_get_functiondef('${signatures[0]}'::regprocedure);`).stdout.trim().replace('LEAST(attempt_count+1,1000)', 'LEAST(attempt_count+2,1000)');
    query(`SET ROLE celebix_saas_owner; ${changedDefinition}`);
    const driftedBodies = bodies();
    const replayDrift = query(source(files.up), true);
    assert.notEqual(replayDrift.status, 0); assert.match(replayDrift.stderr, /DOMAIN_WORKER_ATTEMPT_CAP_SOURCE_DRIFT/);
    assert.deepEqual(bodies(), driftedBodies, 'drift cannot be silently overwritten');
    query(`SET ROLE celebix_saas_owner; ${changedDefinition.replace('LEAST(attempt_count+2,1000)', 'LEAST(attempt_count+1,1000)')}`);
    const rollbackUnsafe = query(source(files.down), true);
    assert.notEqual(rollbackUnsafe.status, 0); assert.match(rollbackUnsafe.stderr, /DOMAIN_WORKER_ATTEMPT_CAP_ROLLBACK_UNSAFE/);
    assert.deepEqual(bodies(), patchedBodies);
    query('SET ROLE celebix_saas_owner; TRUNCATE saas.store_domain_provisioning,saas.admin_domains;');
    query(`SET ROLE celebix_saas_owner; INSERT INTO saas.store_domain_provisioning(domain_id,store_id,provider_hostname_id,cname_target,attempt_count,next_check_at,created_at,updated_at)VALUES('${ids[0]}','${ids[0]}','rollback-provider','shops.example.test',999,'2026-10-02','2026-10-01','2026-10-01');`);
    query(`SET ROLE celebix_saas_owner; INSERT INTO saas.admin_domains(id,store_id,hostname,kind,provider_hostname_id,attempt_count,next_check_at,updated_at)VALUES('${ids[5]}','${ids[5]}','admin.example.test','custom_alias','rollback-admin-provider',999,'2026-10-02','2026-10-01');`);
    // Observe the actual down migration after its safety scan, before source restoration.
    // A test-only pause gives another session the exact vulnerable claim window.
    const rollback = concurrent(source(files.down).replace('FOR saved IN SELECT', 'PERFORM pg_catalog.pg_sleep(1.5);\n FOR saved IN SELECT'), 'domain.cap.rollback');
    await waitFor("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='domain.cap.rollback' AND wait_event='PgSleep');", 'rollback reached the point after the safety scan');
    const racingClaim = concurrent(claim('store_domain_work_claim', 10, 'race.worker'), 'domain.cap.claim');
    const racingAdminClaim = concurrent(claim('admin_domain_work_claim', 11, 'race.admin.worker'), 'domain.cap.adminclaim');
    await waitFor("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='domain.cap.claim' AND wait_event_type='Lock' AND wait_event='relation');", 'concurrent claim must wait for the down migration table lock');
    await waitFor("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='domain.cap.adminclaim' AND wait_event_type='Lock' AND wait_event='relation');", 'concurrent admin claim must wait for the down migration table lock');
    assert.equal(query(`SELECT attempt_count FROM saas.store_domain_provisioning WHERE domain_id='${ids[0]}';`).stdout.trim(), '999', 'safety scan cannot race with a 999→1000 claim');
    assert.equal(query(`SELECT attempt_count FROM saas.admin_domains WHERE id='${ids[5]}';`).stdout.trim(), '999', 'admin safety scan cannot race with a 999→1000 claim');
    const rollbackResult = await rollback;
    assert.equal(rollbackResult.status, 0, rollbackResult.stderr);
    const raceResult = await racingClaim;
    assert.equal(raceResult.status, 0, raceResult.stderr);
    assert.equal(JSON.parse(raceResult.stdout.trim()).items[0].attemptCount, 1000, 'claim proceeds only after rollback commits');
    const adminRaceResult = await racingAdminClaim;
    assert.equal(adminRaceResult.status, 0, adminRaceResult.stderr);
    assert.equal(JSON.parse(adminRaceResult.stdout.trim()).items[0].attemptCount, 1000, 'admin claim proceeds only after rollback commits');
    assert.deepEqual(bodies(), originalBodies); assert.deepEqual(metadata(), originalMetadata);
    assert.equal(query("SELECT to_regclass('saas.domain_worker_attempt_cap_backup_202') IS NULL;").stdout.trim(), 't');
    query(source(files.down));
    query(source(files.up)); query(source(files.verify));
  } finally {
    if (started) run(pg.pg_ctl, ['-D', data, '-m', 'fast', 'stop'], '', true);
    rmSync(root, { recursive: true, force: true });
  }
});

test('202 approved migration artifacts are checksum pinned for PostgreSQL16', () => {
  const manifest = JSON.parse(source('phase5q-domain-worker-attempt-cap-manifest.json'));
  assert.deepEqual([manifest.phase, manifest.postgresqlMajor, manifest.externalConnections, manifest.productionMutations], ['phase5q-domain-worker-attempt-cap', 16, 0, 0]);
  assert.deepEqual(manifest.artifacts.map(a => [a.file, a.direction]), Object.entries(files).map(([direction, file]) => [file, direction]));
  for (const artifact of manifest.artifacts) assert.equal(createHash('sha256').update(source(artifact.file)).digest('hex'), artifact.sha256);
});
