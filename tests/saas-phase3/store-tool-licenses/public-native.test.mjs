import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { applyBaseline } from '../admin-login-security/baseline.mjs';
import { startDisposablePostgres } from '../merchant-signup-profile/disposable-postgres.mjs';

test('public store tools honor persistent store licenses independent of subscriptions and preserve delivery/commerce authority', () => {
  const dir = path.resolve('apps/owner/scripts/sql/saas');
  const db = startDisposablePostgres({ database: 'celebix_saas_staging_auth01' });
  const migration = suffix => readFileSync(path.join(dir, `202610220264_store_tool_public_gates${suffix}`), 'utf8');
  try {
    applyBaseline(db.sql, dir);
    for (const file of readdirSync(dir).filter(f => /^\d{12}/.test(f) && Number(f.slice(8, 12)) > 227 && Number(f.slice(8, 12)) <= 264 && /(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f))
      .sort((a, b) => Number(a.slice(8, 12)) - Number(b.slice(8, 12)) || a.localeCompare(b))) {
      db.sql(readFileSync(path.join(dir, file), 'utf8'));
    }
    db.sql(migration('_assertions.sql'));
    const output = db.sql(readFileSync(new URL('./public-gates.sql', import.meta.url), 'utf8'));
    const proof = output.split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).find(row => row?.storeToolPublicChecks);
    assert.equal(proof?.passed, 5);
    assert.equal(db.sql("SELECT count(*)FROM saas.stores WHERE slug IN('tool-264','tool-other-264')"), '0');
    // A deliberate pre-purchase rollback restores every reviewed definition and
    // original privilege set. The migration cannot be removed by an accidental invocation.
    const originals = JSON.parse(db.sql("SELECT jsonb_object_agg(signature,jsonb_build_object('hash',original_sha256,'oid',function_oid,'acl',function_acl,'config',function_config))FROM saas.store_tool_public264_functions WHERE NOT is_new"));
    assert.throws(() => db.sql(migration('.down.sql')), /STORE_TOOL264_DOWN_REQUIRES_EXPLICIT_OPERATOR/);
    db.sql("SET celebix.allow_native264_down='on';" + migration('.down.sql'));
    const restored = JSON.parse(db.sql(`SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('hash',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'oid',p.oid,'acl',p.proacl,'config',p.proconfig))FROM pg_proc p WHERE p.oid::regprocedure::text=ANY(ARRAY[${Object.keys(originals).map(s => "'" + s.replaceAll("'", "''") + "'").join(',')}])`));
    assert.deepEqual(restored, originals);
    db.sql(migration('.up.sql'));
    db.sql(migration('_assertions.sql'));
    console.log(JSON.stringify({ ...proof, rollbackRestoresAuthority: true }));
  } finally { db.stop(); }
});
