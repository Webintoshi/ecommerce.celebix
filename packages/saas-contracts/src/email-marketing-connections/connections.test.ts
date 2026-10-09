import assert from 'node:assert/strict';
import test from 'node:test';
const module = await import('./index.ts').catch(() => ({})) as typeof import('./index.ts');
const connection = {id:'10000000-0000-4000-8000-000000000001',provider:'brevo',version:1,generation:1,credentialVersion:1,accountId:'42',accountName:'Sample',listId:'10',listName:'Celebix',status:'connected',senderStatus:'unknown',lastCheckedAt:null,lastSyncedAt:null,errorCode:null};
test('rejects unknown provider without accepting arbitrary providers', () => {
 assert.equal(typeof module.parseEmailMarketingProvider, 'function');
 assert.throws(() => module.parseEmailMarketingProvider('sender'));
 assert.equal(module.parseEmailMarketingProvider('brevo'),'brevo');
});
test('connection parser rejects secrets, invalid authority and versions', () => {
 assert.equal(typeof module.parseEmailMarketingConnection,'function');
 for (const bad of [{...connection,apiKey:'secret'},{...connection,version:-1},{...connection,id:'fake-store'},{...connection,accountName:'A\nB'},Object.defineProperty({...connection},'accountName',{enumerable:true,get(){throw Error('getter executed');}})]) assert.throws(()=>module.parseEmailMarketingConnection(bad));
 const parsed=module.parseEmailMarketingConnection(connection);assert.equal(parsed.senderStatus,'unknown');assert.equal(parsed.lastCheckedAt,null);assert.ok(Object.isFrozen(parsed));
});
test('selection and overview preserve unknown counts and reject excess fields', () => {
 assert.equal(typeof module.parseEmailMarketingApplyIntent,'function');
 const input={candidateId:connection.id,expectedVersion:0,selection:{kind:'create',name:'Celebix'}};
 assert.deepEqual(module.parseEmailMarketingApplyIntent(input).selection,{kind:'create',name:'Celebix'});
 assert.throws(()=>module.parseEmailMarketingApplyIntent({...input,storeId:connection.id}));
 assert.throws(()=>module.parseEmailMarketingApplyIntent({...input,selection:{kind:'existing',listId:'42',name:'evil'}}));
 const preview={eligible:7,denied:1,missingEvidence:2,needsRenewal:3,providerBlocked:null,unchecked:7,overLimit:null,providerCheckedAt:null};
 assert.equal(module.parseEmailMarketingAudiencePreview(preview).providerBlocked,null);
 assert.throws(()=>module.parseEmailMarketingAudiencePreview({...preview,eligible:-1}));
 const overview={connections:[connection],sync:{queued:7,verified:0,blocked:0,failed:0,pendingVerification:0,asOf:'2026-10-09T00:00:00.000Z',suppressionCheckedAt:null},configured:true};
 assert.equal(module.parseEmailMarketingOverview(overview).connections[0]?.provider,'brevo');
 assert.throws(()=>module.parseEmailMarketingOverview({...overview,credentials:{secret:'no'}}));
});
