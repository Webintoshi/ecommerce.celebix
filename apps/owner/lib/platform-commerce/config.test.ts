import assert from 'node:assert/strict';
import test from 'node:test';
import { readPlatformCommerceConfig } from './config.ts';

const env={CELEBIX_PLATFORM_COMMERCE_ENABLED:'true',CELEBIX_PLATFORM_IYZICO_MODE:'live',CELEBIX_PLATFORM_IYZICO_API_KEY:'live-test-key',CELEBIX_PLATFORM_IYZICO_SECRET_KEY:'live-test-secret',CELEBIX_PLATFORM_COMMERCE_BRIDGE_KEY_B64URL:Buffer.alloc(32,12).toString('base64url'),CELEBIX_PLATFORM_COMMERCE_DATA_KEY_B64URL:Buffer.alloc(32,13).toString('base64url')};
test('platform checkout remains disabled without an explicit enable flag',()=>{
 assert.equal(readPlatformCommerceConfig({}),null);
 assert.equal(readPlatformCommerceConfig({...env,CELEBIX_PLATFORM_COMMERCE_ENABLED:'false'}),null);
});
test('missing or unrecognized payment mode and credential fields fail closed',()=>{
 for(const key of Object.keys(env).filter(key=>key!=='CELEBIX_PLATFORM_COMMERCE_ENABLED'))assert.throws(()=>readPlatformCommerceConfig({...env,[key]:undefined}),/platform_commerce_configuration_invalid/);
 assert.throws(()=>readPlatformCommerceConfig({...env,CELEBIX_PLATFORM_IYZICO_MODE:'approved_live'}));
 assert.throws(()=>readPlatformCommerceConfig({...env,CELEBIX_PLATFORM_IYZICO_API_KEY:' bad-key'}));
});
test('credential rotation changes the server fingerprint without changing tenant credentials or recurring settings',()=>{
 const first=readPlatformCommerceConfig(env)!,second=readPlatformCommerceConfig({...env,CELEBIX_PLATFORM_IYZICO_SECRET_KEY:'new-secret'})!;
 assert.equal(first.gateway.callbackOrigin,'https://celebix.net');assert.equal(first.gateway.mode,'live');
 assert.match(first.credentialFingerprint,/^[a-f0-9]{64}$/);assert.notEqual(first.credentialFingerprint,second.credentialFingerprint);
 assert.notDeepEqual(first.bridgeKey,first.dataKey);
});
