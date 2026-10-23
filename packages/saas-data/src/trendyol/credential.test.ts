import assert from 'node:assert/strict';
import test from 'node:test';
import {sealTrendyolCredential,openTrendyolCredential} from './credential.ts';
const storeId='11111111-1111-4111-8111-111111111111',keyring={activeKeyId:'fixture',keys:[{keyId:'fixture',key:new Uint8Array(32).fill(7)}]};
test('seller credentials are encrypted and bound to store and credential version',()=>{
 const credential={sellerId:'123',apiKey:'fixture-api-key',apiSecret:'fixture-api-secret',webhookSecret:'a'.repeat(64)};
 const envelope=sealTrendyolCredential({storeId,version:1,credential,keyring});
 assert.ok(!JSON.stringify(envelope).includes('fixture-api'));
 assert.deepEqual(openTrendyolCredential({storeId,version:1,envelope,keyring}),credential);
 assert.throws(()=>openTrendyolCredential({storeId:'22222222-2222-4222-8222-222222222222',version:1,envelope,keyring}));
 assert.throws(()=>openTrendyolCredential({storeId,version:2,envelope,keyring}));
});
