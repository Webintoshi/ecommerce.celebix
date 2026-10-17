import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeMarketingPublicConfiguration,registerServerNativeMarketingRepository,resolveServerNativeMarketingRuntime} from './runtime.ts';

const configuration={senderEmail:'noreply@posta.celebix.net',publicOrigin:'https://owner.saas-staging.celebix.net'};
const environment={CELEBIX_NATIVE_MARKETING_ENABLED:'true',CELEBIX_MARKETING_EMAIL_FROM:configuration.senderEmail,CELEBIX_MARKETING_EMAIL_PUBLIC_ORIGIN:configuration.publicOrigin};
test('native email readiness is explicit and rejects malformed sender or public origins',()=>{
 assert.deepEqual(nativeMarketingPublicConfiguration(environment),configuration);
 assert.equal(nativeMarketingPublicConfiguration({}),null);
 for(const value of ['false','TRUE','1'])assert.equal(nativeMarketingPublicConfiguration({...environment,CELEBIX_NATIVE_MARKETING_ENABLED:value}),null);
 for(const value of ['reply@posta.celebix.net','noreply@bad..celebix.net','noreply@-bad.celebix.net','noreply@posta.celebix.net\nBcc:x@example.test'])assert.equal(nativeMarketingPublicConfiguration({...environment,CELEBIX_MARKETING_EMAIL_FROM:value}),null);
 for(const value of ['http://owner.celebix.net','https://owner.celebix.net/','https://user@owner.celebix.net','https://owner.celebix.net:443','https://127.0.0.1','https://owner.celebix.net/path','https://owner.celebix.net?x=1'])assert.equal(nativeMarketingPublicConfiguration({...environment,CELEBIX_MARKETING_EMAIL_PUBLIC_ORIGIN:value}),null);
});
test('native repository methods keep their receiver and bind only to one approved runtime',async()=>{
 const access:any={readiness:{mode:'approved_staging'},panelOrigin:'https://panel.celebix.net'};
 const other:any={...access};
 const repository:any={marker:42,...Object.fromEntries(['overview','products','preview','saveSettings','saveTemplate','queueCampaign','testCampaign','cancelCampaign'].map(name=>[name,async function(this:any){return this.marker;}]))};
 registerServerNativeMarketingRepository(access,repository,configuration);
 assert.equal(await resolveServerNativeMarketingRuntime(access)!.email.overview({} as never),42);
 assert.equal(resolveServerNativeMarketingRuntime(other),null);
 assert.throws(()=>registerServerNativeMarketingRepository(access,repository,configuration));
 assert.throws(()=>registerServerNativeMarketingRepository({readiness:{mode:'disabled'}} as never,repository,configuration));
 assert.throws(()=>registerServerNativeMarketingRepository(other,{...repository,preview:undefined},configuration));
 access.readiness={mode:'disabled'};
 assert.equal(resolveServerNativeMarketingRuntime(access),null);
});
