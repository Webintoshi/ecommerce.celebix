import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
const manifest=JSON.parse(readFileSync(new URL('./phase-toshi-credits-manifest.json',import.meta.url),'utf8')) as {artifacts:Array<{file:string;sha256:string}>};
const source=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const up=source('202610270283_toshi_credits.up.sql');
test('Toshi financial migration artifacts match the published manifest',()=>{
 assert.equal(manifest.artifacts.length,3);
 for(const artifact of manifest.artifacts)assert.equal(createHash('sha256').update(source(artifact.file)).digest('hex'),artifact.sha256,artifact.file);
});
test('durable credit holds, replay and financial privacy are enforced in native PostgreSQL',()=>{
 for(const relation of ['toshi_credit_wallets','toshi_credit_operations','toshi_credit_ledger'])assert.match(up,new RegExp(`CREATE TABLE saas[.]${relation}`));
 assert.match(up,/'catalog','catalog_admin.manage'/);assert.doesNotMatch(up,/'catalog','configuration.read'/);assert.match(up,/reserved BETWEEN 0 AND balance/);assert.match(up,/operation_id uuid PRIMARY KEY/);assert.match(up,/interval '15 minutes'/);assert.match(up,/status='unknown',safe_code='reservation_expired'/);assert.match(up,/octet_length\(result::text\)<=262144/);assert.match(up,/FOR UPDATE/);assert.match(up,/operation_mismatch/);assert.match(up,/insufficient_credits/);assert.match(up,/FORCE ROW LEVEL SECURITY/);
 assert.match(up,/platform_checkout_create283_baseline/);assert.match(up,/platform_checkout_fulfill283_baseline/);assert.match(up,/platform_toshi_credit_grant/);assert.match(up,/'toshi.credit.grant'/);assert.match(up,/UNIQUE\(source_kind,source_id,event\)/);
 assert.doesNotMatch(up,/http_post|net[.]http|DISABLE ROW LEVEL SECURITY|INSERT INTO saas[.]toshi_credit_wallets[^;]*VALUES\([^;]*[1-9][0-9]*,/i);
 assert.match(source('202610270283_toshi_credits.down.sql'),/TOSHI_CREDITS283_FORWARD_ONLY/);
});
