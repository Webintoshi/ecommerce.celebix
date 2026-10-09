import assert from 'node:assert/strict';
import test from 'node:test';
const module = await import('./credential-crypto.ts').catch(()=>({})) as typeof import('./credential-crypto.ts');
const binding={storeId:'10000000-0000-4000-8000-000000000001',credentialOwnerId:'20000000-0000-4000-8000-000000000002',provider:'brevo' as const,purpose:'candidate' as const,credentialVersion:1};
const ring={activeKeyId:'test-1',keys:[{keyId:'test-1',key:new Uint8Array(32).fill(9)}]};
const secret='example-private-key-only-for-test';
test('credential is authenticated to store owner provider purpose and credential version',()=>{
 assert.equal(typeof module.sealEmailMarketingCredential,'function');
 const envelope=module.sealEmailMarketingCredential(secret,binding,ring);
 assert.equal(module.openEmailMarketingCredential(envelope,binding,ring),secret);
 assert.ok(!JSON.stringify(envelope).includes(secret));assert.equal(Buffer.from(envelope.iv,'base64url').length,12);assert.equal(Buffer.from(envelope.tag,'base64url').length,16);
 for(const other of [{...binding,storeId:'30000000-0000-4000-8000-000000000003'},{...binding,credentialOwnerId:'30000000-0000-4000-8000-000000000003'},{...binding,provider:'klaviyo' as const},{...binding,purpose:'connection' as const},{...binding,credentialVersion:2}]) assert.throws(()=>module.openEmailMarketingCredential(envelope,other,ring),e=>e instanceof Error&&!e.message.includes(secret));
 assert.throws(()=>module.openEmailMarketingCredential({...envelope,keyId:'other'},binding,ring));
});
test('malformed keys envelopes accessors and bindings fail without revealing secret',()=>{
 assert.equal(typeof module.sealEmailMarketingCredential,'function');
 for(const bad of [{...binding,storeId:'fake'},{...binding,credentialVersion:0},Object.defineProperty({...binding},'storeId',{enumerable:true,get(){throw Error(secret);}})])assert.throws(()=>module.sealEmailMarketingCredential(secret,bad,ring),e=>e instanceof Error&&!e.message.includes(secret));
 assert.throws(()=>module.sealEmailMarketingCredential(secret,binding,{activeKeyId:'test-1',keys:[{keyId:'test-1',key:new Uint8Array(16)}]}));
 assert.throws(()=>module.sealEmailMarketingCredential(secret+'\n',binding,ring));
 const envelope=module.sealEmailMarketingCredential(secret,binding,ring);
 assert.throws(()=>module.openEmailMarketingCredential({...envelope,iv:envelope.iv+'='},binding,ring));
 const extra={...envelope,apiKey:secret};assert.throws(()=>module.openEmailMarketingCredential(extra,binding,ring));
});
