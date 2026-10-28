import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
const source=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const manifest=JSON.parse(source('phase-toshi-test-credit-offer-manifest.json')) as {offer:unknown;artifacts:Array<{file:string;sha256:string}>};
test('test-credit release binds its additive financial artifacts and exact one TRY offer',()=>{
 assert.deepEqual(manifest.offer,{id:'toshi-test-1',credits:1,netCents:83,vatBps:2000,vatCents:17,totalCents:100});
 assert.equal(manifest.artifacts.length,3);
 for(const file of manifest.artifacts)assert.equal(createHash('sha256').update(source(file.file)).digest('hex'),file.sha256,file.file);
});
test('test offer extends only reviewed checkout routines and constraint without grants or wallet mutation',()=>{
 const up=source('202610280288_toshi_test_credit_offer.up.sql');
 assert.match(up,/\('toshi-test-1',1,83\)/);assert.match(up,/pg_get_functiondef/);assert.match(up,/p\.proacl/);assert.match(up,/p\.proowner/);assert.match(up,/PREDECESSOR_INVALID/);assert.match(up,/ORDER_CONSTRAINT_INVALID/);
 assert.doesNotMatch(up,/INSERT INTO|UPDATE saas\.|CREATE TABLE|GRANT |REVOKE |platform_checkout_machine\(/i);
 assert.match(source('202610280288_toshi_test_credit_offer.down.sql'),/TOSHI_TEST_CREDIT288_FORWARD_ONLY/);
});
