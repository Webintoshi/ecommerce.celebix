import assert from 'node:assert/strict';import test from 'node:test';const module=await import('./client.ts').catch(()=>({})) as typeof import('./client.ts');
const id='22800000-0000-4000-8000-000000000001';
test('client sends secrets only in same-origin POST body and reuses the supplied operation ID',async()=>{assert.equal(typeof module.createEmailMarketingApi,'function');const requests:{url:string;init:RequestInit}[]=[];const api=module.createEmailMarketingApi(async(url,init)=>{requests.push({url:String(url),init:init!});return Response.json({candidateId:id,provider:'brevo',accountId:'org',accountName:'Fixture',expiresAt:'2026-10-09T12:15:00Z'});});await api.validate({provider:'brevo',apiKey:'fixture-secret',operationId:id});await api.validate({provider:'brevo',apiKey:'fixture-secret',operationId:id});assert.equal(new Headers(requests[0].init.headers).get('idempotency-key'),id);assert.equal(requests[0].init.credentials,'same-origin');assert.equal(requests[0].url.includes('fixture-secret'),false);assert.equal(new Headers(requests[1].init.headers).get('idempotency-key'),id);});
test('raw or unrecognized server errors never reach UI',async()=>{const api=module.createEmailMarketingApi(async()=>Response.json({code:'fixture-secret'},{status:503}));await assert.rejects(api.overview(),(e:any)=>e.code==='provider_unavailable'&&!String(e).includes('fixture-secret'));});

test('manual sync sends only the saved version and retries the supplied operation without credentials', async () => {
  const requests: {url: string; init: RequestInit}[] = [];
  const connection = {id, provider: 'brevo', version: 3, generation: 1, credentialVersion: 1, accountId: 'org', accountName: 'Fixture', listId: 'managed', listName: 'Celebix', status: 'connected', senderStatus: 'unknown', lastCheckedAt: null, lastSyncedAt: null, errorCode: null};
  const api: any = module.createEmailMarketingApi(async (url, init) => {requests.push({url: String(url), init: init!}); return Response.json(connection);});
  assert.equal(typeof api.sync, 'function');
  await api.sync({operationId: id, expectedVersion: 3});
  await api.sync({operationId: id, expectedVersion: 3});
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, '/api/marketing/email-connections/sync');
    assert.equal(request.init.method, 'POST');
    assert.equal(request.init.credentials, 'same-origin');
    assert.equal(new Headers(request.init.headers).get('idempotency-key'), id);
    assert.deepEqual(JSON.parse(String(request.init.body)), {expectedVersion: 3});
  }
});
