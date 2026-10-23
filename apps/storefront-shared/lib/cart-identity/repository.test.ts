import assert from 'node:assert/strict';
import test from 'node:test';
import {bindStorefrontCartIdentity} from './repository.ts';

const input={hostname:'shop.example.test',now:new Date('2026-10-23T19:30:00Z'),accountCandidates:[{keyId:'account_01',digest:'a'.repeat(64)}],cartCandidates:[{keyId:'cart_01',digest:'b'.repeat(64)}]};
function fixture(failAt?:string,badResult=false){
 const calls:{text:string;values?:unknown[]}[]=[];let released=0;
 const client={query:async(value:string|{text:string;values:unknown[]})=>{
  const query=typeof value==='string'?{text:value}:value;calls.push(query);
  if(query.text===failAt||failAt==='native'&&query.text.includes('public_account_cart_bind'))throw Error('private connection details');
  return {rowCount:1,rows:[badResult?{outcome:'bound',privatePhone:'secret'}:{outcome:'bound'}]};
 },release:()=>{released++;}};
 return{pool:{connect:async()=>client} as any,calls,released:()=>released};
}
test('executes only the identity binding boundary with bounded host-resolver authority',async()=>{
 const f=fixture();assert.equal(await bindStorefrontCartIdentity(f.pool,input),'bound');
 assert.equal(f.calls[0].text,'BEGIN');assert.ok(f.calls.some(q=>q.text==='SET LOCAL ROLE celebix_saas_host_resolver'));
 const native=f.calls.filter(q=>q.text.includes('public_account_cart_bind'));assert.equal(native.length,1);
 assert.deepEqual(native[0].values,[input.hostname,input.now,JSON.stringify(input.accountCandidates),JSON.stringify(input.cartCandidates)]);
 assert.equal(f.calls.at(-1)?.text,'COMMIT');assert.equal(f.released(),1);
});
test('unknown native execution and commit outcomes are never replayed and release the connection',async()=>{
 for(const stage of ['native','COMMIT']){
  const f=fixture(stage);await assert.rejects(bindStorefrontCartIdentity(f.pool,input),/^Error: cart_identity_binding_unavailable$/);
  assert.equal(f.calls.filter(q=>q.text.includes('public_account_cart_bind')).length,1);assert.equal(f.calls.at(-1)?.text,'ROLLBACK');assert.equal(f.released(),1);
 }
});
test('an unexpected private response is rejected before commit',async()=>{
 const f=fixture(undefined,true);await assert.rejects(bindStorefrontCartIdentity(f.pool,input),/cart_identity_binding_unavailable/);
 assert.equal(f.calls.some(q=>q.text==='COMMIT'),false);assert.equal(f.calls.at(-1)?.text,'ROLLBACK');assert.equal(f.released(),1);
});
