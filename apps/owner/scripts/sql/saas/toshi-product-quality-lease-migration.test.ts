import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
const read=(suffix:string)=>readFileSync(new URL(`./202610270285_toshi_product_quality_lease${suffix}`,import.meta.url),'utf8');
const up=read('.up.sql'),down=read('.down.sql'),assertions=read('_assertions.sql');
test('lease migration guards the exact installed claim wrapper in both directions',()=>{
 const body=up.split('$claim285$')[1],digest=createHash('sha256').update(body).digest('hex');
 for(const source of[up,down]){
  assert.ok(source.includes(digest));assert.ok(source.includes('e51b56bcf1f2f62a7ff555dc1dabbae3'));
  assert.match(source,/TOSHI_QUALITY_LEASE285_PREDECESSOR_INVALID/);assert.match(source,/TOSHI_QUALITY_LEASE285_METADATA_INVALID/);
  assert.match(source,/p[.]proacl::text IS DISTINCT FROM/);assert.match(source,/SET LOCAL ROLE celebix_saas_owner/);
  assert.equal((source.match(/CREATE OR REPLACE FUNCTION/g)??[]).length,1);
  assert.doesNotMatch(source,/CREATE OR REPLACE FUNCTION saas[.]content_authoring_(?:transition|begin)|GRANT|REVOKE|ALTER TABLE|CREATE TABLE/);
 }
 assert.ok(assertions.includes(digest));
});
test('only a matching newly authorized persisted claim gets a bounded lease extension',()=>{
 assert.match(up,/IF transition_result[.]outcome = 'claimed'/);
 for(const condition of["o.status = 'pending'","o.dispatch_state = 'dispatched'","o.version = p_version + 1","o.prompt_version = 'toshi-product-v10'","o.provider = 'deepseek' AND o.model = 'deepseek-flash'","o.lease_expires_at = p_now + interval '60 seconds'"])assert.ok(up.includes(condition),condition);
 assert.match(up,/o[.]claim_token = \(transition_result[.]result_payload->>'claimToken'\)::uuid/);
 assert.match(up,/lease_expires_at = p_now \+ interval '120 seconds'/);
 assert.match(up,/saas[.]content_authoring_payload\(p_id\)/);
 assert.doesNotMatch(down,/UPDATE saas[.]content_authoring_operations|120 seconds/);
});
