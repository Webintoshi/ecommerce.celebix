import assert from 'node:assert/strict';
import test from 'node:test';
import {googleMarketingConfiguration} from './config.ts';
const keyring={activeKeyId:'v1',keys:[{keyId:'v1',key:new Uint8Array(32)}]};
const env={CELEBIX_GOOGLE_OAUTH_CLIENT_ID:'123-abc.apps.googleusercontent.com',CELEBIX_GOOGLE_OAUTH_CLIENT_SECRET:'testsecret',CELEBIX_GOOGLE_OAUTH_ORIGIN:'https://panel.saas-staging.celebix.net',CELEBIX_GOOGLE_ADS_PROJECT_ID:'celebix-google'};
test('one canonical OAuth callback configuration works independently of tenant panel origin',()=>{
  const cfg=googleMarketingConfiguration(env,keyring);assert.equal(cfg.panelOrigin,env.CELEBIX_GOOGLE_OAUTH_ORIGIN);assert.equal(cfg.adsProjectId,'celebix-google');assert.equal(cfg.credentialKeyring,keyring);
});
test('missing/malformed optional setup remains disabled, never crashes merchant runtime',()=>{
  for(const source of [{},{...env,CELEBIX_GOOGLE_OAUTH_ORIGIN:'http://unsafe.test'},{...env,CELEBIX_GOOGLE_OAUTH_ORIGIN:env.CELEBIX_GOOGLE_OAUTH_ORIGIN+'/'},{...env,CELEBIX_GOOGLE_OAUTH_CLIENT_SECRET:'secret\n'},{...env,CELEBIX_GOOGLE_OAUTH_CLIENT_ID:'invalid'}]) assert.deepEqual(googleMarketingConfiguration(source,keyring),{});
});
