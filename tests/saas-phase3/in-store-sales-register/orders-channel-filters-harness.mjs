import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startAccountingFixture } from '../accounting-ledger/fixture.mjs';

// Uses the actual roles, authority, archive, customer and order functions in a
// disposable socket-only PostgreSQL 16 database, never a configured database.
const migration = '202610120227_order_sales_channel_filters';
const fixture = startAccountingFixture(226);
const behavior = readFileSync(new URL('./orders-channel-filters.sql', import.meta.url), 'utf8');
const manifestSQL = `SELECT coalesce(jsonb_object_agg(signature, definition ORDER BY signature),'{}')
 FROM (SELECT p.oid::regprocedure::text signature,jsonb_build_object('definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef) definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas') all_functions;`;
try {
  const before = JSON.parse(fixture.value(manifestSQL));
  if (process.argv.includes('--red')) {
    const red = fixture.sql(behavior, true);
    assert.notEqual(red.status, 0);
    assert.match(red.stderr, /ORDERS_CHANNEL_FILTERS_ABSENT/);
    console.log('PASS RED: social/manual/platform reader absent on the deployed predecessor');
  } else {
    fixture.apply(`${migration}.up.sql`);
    fixture.apply(`${migration}_assertions.sql`);
    fixture.sql(behavior);
    console.log('PASS GREEN: channel/platform, pre-limit cursor pages, all sorts, search/current customer, archived authority, tenant scope and READ ONLY');
    const after = JSON.parse(fixture.value(manifestSQL));
    for (const [signature, definition] of Object.entries(before)) assert.deepEqual(after[signature], definition, `Existing function changed: ${signature}`);
    assert.equal(Object.keys(after).length - Object.keys(before).length, 3);
    assert.equal(fixture.value(`SET ROLE celebix_saas_app;
      SELECT outcome FROM saas.orders_list_filtered_v2(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'newest',20,NULL,NULL,NULL,'social',NULL);`), 'durable_authority_invalid');
    const denied = fixture.sql(`SET ROLE celebix_saas_app;
      SELECT * FROM saas.orders_list_scope_filtered_v2(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'newest',20,NULL,NULL,NULL,false,'social',NULL);`, true);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /permission denied for function orders_list_scope_filtered_v2/);
    fixture.apply(`${migration}.down.sql`);
    assert.deepEqual(JSON.parse(fixture.value(manifestSQL)), before);
    fixture.apply(`${migration}.up.sql`);
    fixture.apply(`${migration}_assertions.sql`);
    fixture.sql(behavior);
    console.log('PASS additive ABI/ACL isolation and exact DOWN/reapply; existing functions unchanged');
  }
} finally {
  fixture.stop();
}
