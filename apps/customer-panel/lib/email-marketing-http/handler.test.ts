import assert from 'node:assert/strict';
import test from 'node:test';
import { EmailMarketingError } from '@celebix/saas-data';
const api = await import('./handler.ts').catch(() => ({})) as typeof import('./handler.ts');
const ORIGIN = 'https://panel.saas-staging.celebix.net', ID = '22700000-0000-4000-8000-000000000001', OP = '22700000-0000-4000-8000-000000000002', COOKIE = `v1.panel.current.${Buffer.alloc(32, 1).toString('base64url')}`;
function request(area: string, body?: unknown, headers: Record<string, string> = {}) { return new Request('http://internal:3400/api/marketing/email-connections' + area, { method: body === undefined ? 'GET' : 'POST', headers: { host: new URL(ORIGIN).hostname, cookie: `__Host-celebix_panel=${COOKIE}`, ...(body === undefined ? {} : { origin: ORIGIN, 'content-type': 'application/json', 'idempotency-key': OP }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); }
function fixture(email: any, role = 'store_owner', providerAvailability = {brevo: true, klaviyo: true}) { let now = new Date('2026-10-09T12:00:00Z'); let expires = Infinity; const h = () => api.createEmailMarketingHttpHandlers({ resolveRuntime: async () => ({ email, providerAvailability, access: { readiness: { mode: 'approved_staging' }, panelOrigin: ORIGIN, resolveCredential: async (i: any) => i.hostname !== new URL(ORIGIN).hostname || i.now.getTime() >= expires ? { kind: 'unauthorized' } : { kind: 'authenticated', tenantContext: { schemaVersion: 1, requestId: ID, principal: { id: ID }, store: { id: ID, slug: 'fixture', status: 'active' }, membership: { id: ID, role, status: 'active' }, entitlements: { status: 'active', features: ['integrations'] } } } } } as never), now: () => now, requestId: () => ID }); return { h, advance: () => now = new Date(now.getTime() + 31 * 60 * 1000), expire: () => expires = now.getTime() + 30 * 60 * 1000 }; }
test('overview reads saved state only; mutation binds actual store/session and never accepts caller authority', async () => { assert.equal(typeof api.createEmailMarketingHttpHandlers, 'function'); const inputs: any[] = []; let reads = 0; const h = fixture({ overview: async () => { reads++; return { configured: true }; }, validate: async (i: any) => { inputs.push(i); return { candidateId: ID }; } }).h(); assert.equal((await h.get(request(''), 'overview')).status, 200); assert.equal(reads, 1); assert.equal((await h.post(request('/validate', { provider: 'brevo', apiKey: 'private-fixture-key' }), 'validate')).status, 200); assert.equal(inputs[0].tenantContext.store.id, ID); assert.equal(inputs[0].operationId, OP); assert.match(inputs[0].sessionBinding, /^[a-f0-9]{64}$/); assert.notEqual(inputs[0].sessionBinding, COOKIE); assert.equal((await h.post(request('/validate', { provider: 'brevo', apiKey: 'key', storeId: ID }), 'validate')).status, 400); assert.equal((await h.get(request('', undefined, { 'x-store-id': ID }), 'overview')).status, 400); assert.equal(inputs.length, 1); });
test('support expired after validation cannot apply', async () => { let activated = 0; const f = fixture({ validate: async () => ({ candidateId: ID }), apply: async () => { activated++; } }); f.expire(); assert.equal((await f.h().post(request('/validate', { provider: 'klaviyo', apiKey: 'private-fixture-key' }), 'validate')).status, 200); f.advance(); assert.equal((await f.h().post(request('/apply', { candidateId: ID, expectedVersion: 0, selection: { kind: 'existing', listId: 'managed' } }), 'apply')).status, 403); assert.equal(activated, 0); });
test('foreign origin/host, absent session, read-only role and oversized/malformed mutation are rejected', async () => { let calls = 0; const h = fixture({ disconnect: async () => { calls++; } }).h(), body = { expectedVersion: 1 }; for (const headers of [{ origin: 'https://attacker.test' }, { host: 'attacker.test' }, { cookie: '' }] as Record<string,string>[])
    assert.ok([401, 403].includes((await h.post(request('/disconnect', body, headers), 'disconnect')).status)); assert.equal((await fixture({ disconnect: async () => { calls++; } }, 'analyst').h().post(request('/disconnect', body), 'disconnect')).status, 403); for (const headers of [{ 'idempotency-key': 'bad' }, { 'x-tenant-id': ID }] as Record<string,string>[])
    assert.equal((await h.post(request('/disconnect', body, headers), 'disconnect')).status, 400); assert.equal((await h.post(request('/disconnect', { ...body, extra: 'x'.repeat(17000) }), 'disconnect')).status, 400); assert.equal(calls, 0); });
test('candidate lists bind session; duplicate/unknown queries and API keys in query are refused', async () => { const inputs: any[] = []; const h = fixture({ lists: async (i: any) => { inputs.push(i); return { items: [] }; } }).h(); assert.equal((await h.get(request('/lists?candidateId=' + ID + '&cursor=next'), 'lists')).status, 200); assert.equal(inputs[0].candidateId, ID); assert.equal(inputs[0].cursor, 'next'); assert.ok(inputs[0].sessionBinding); for (const q of ['candidateId=' + ID + '&candidateId=' + ID, 'candidateId=' + ID + '&apiKey=secret', 'candidateId=' + ID + '&storeId=' + ID])
    assert.equal((await h.get(request('/lists?' + q), 'lists')).status, 400); assert.equal(inputs.length, 1); });
test('safe stale/candidate errors expose no provider body or unknown code', async () => { for (const [code, status] of [['version_conflict', 409], ['candidate_expired', 409], ['private-fixture-key', 503]] as const) {
    const h = fixture({ apply: async () => { throw new EmailMarketingError(code as never); } }).h();
    const r = await h.post(request('/apply', { candidateId: ID, expectedVersion: 0, selection: { kind: 'existing', listId: 'managed' } }), 'apply');
    assert.equal(r.status, status);
    assert.equal((await r.text()).includes('private-fixture-key'), false);
} });

test('manual sync binds authority and operation to an explicit versioned POST without a key', async () => {
    const inputs: any[] = [];
    const h = fixture({sync: async (input: any) => {inputs.push(input); return {status: 'connected', version: 4};}}).h();
    const response = await h.post(request('/sync', {expectedVersion: 4}), 'sync');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {status: 'connected', version: 4});
    assert.equal(inputs.length, 1);
    assert.equal(inputs[0].tenantContext.store.id, ID);
    assert.equal(inputs[0].operationId, OP);
    assert.equal(inputs[0].expectedVersion, 4);
    assert.equal('apiKey' in inputs[0], false);
    for (const body of [{expectedVersion: 4, apiKey: 'unused'}, {expectedVersion: 4, storeId: ID}, {expectedVersion: -1}, {}]) {
        assert.equal((await h.post(request('/sync', body), 'sync')).status, 400);
    }
    assert.equal(inputs.length, 1);
});

test('manual sync rejects read-only users and foreign origins before queueing any batch', async () => {
    let queued = 0;
    const email = {sync: async () => {queued++; return {status: 'connected'};}};
    assert.equal((await fixture(email, 'analyst').h().post(request('/sync', {expectedVersion: 1}), 'sync')).status, 403);
    assert.equal((await fixture(email).h().post(request('/sync', {expectedVersion: 1}, {origin: 'https://attacker.test'}), 'sync')).status, 403);
    assert.equal(queued, 0);
});

test('overview publishes server availability and rejects disabled Brevo validation before provider IO', async () => {
    const validated: any[]=[];
    const h=fixture({overview:async()=>({configured:true,connections:[],providerAvailability:{brevo:true,klaviyo:true}}),validate:async(input:any)=>{validated.push(input);return {candidateId:ID};}},'store_owner',{brevo:false,klaviyo:true}).h();
    assert.deepEqual((await (await h.get(request(''),'overview')).json()).providerAvailability,{brevo:false,klaviyo:true});
    assert.equal((await h.post(request('/validate',{provider:'brevo',apiKey:'fixture'}),'validate')).status,503);
    assert.equal(validated.length,0);
    assert.equal((await h.post(request('/validate',{provider:'klaviyo',apiKey:'fixture'}),'validate')).status,200);
    assert.equal(validated.length,1);assert.equal(validated[0].provider,'klaviyo');
});

test('disabled candidate provider cannot discover, preview, apply or rotate through direct HTTP', async () => {
    for(const provider of ['brevo','klaviyo']){
      const candidateInputs:any[]=[];let effects=0;
      const h=fixture({candidateProvider:async(input:any)=>{candidateInputs.push(input);return provider;},lists:async()=>{effects++;return {items:[]};},preview:async()=>{effects++;return {};},apply:async()=>{effects++;return {};},rotate:async()=>{effects++;return {}; }},'store_owner',{brevo:false,klaviyo:true}).h();
      const expected=provider==='brevo'?503:200;
      assert.equal((await h.get(request('/lists?candidateId='+ID),'lists')).status,expected);
      assert.equal((await h.get(request('/preview?candidateId='+ID),'preview')).status,expected);
      assert.equal((await h.post(request('/apply',{candidateId:ID,expectedVersion:0,selection:{kind:'existing',listId:'managed'}}),'apply')).status,expected);
      assert.equal((await h.post(request('/rotate',{candidateId:ID,expectedVersion:1}),'rotate')).status,expected);
      assert.equal(candidateInputs.length,4);assert.equal(candidateInputs[0].tenantContext.store.id,ID);assert.match(candidateInputs[0].sessionBinding,/^[a-f0-9]{64}$/);
      assert.equal(effects,provider==='brevo'?0:4);
      assert.equal((await h.post(request('/apply',{provider:'klaviyo',candidateId:ID,expectedVersion:0,selection:{kind:'existing',listId:'managed'}}),'apply')).status,400);
    }
});

test('disabled saved provider cannot sync or recheck but can always disconnect for cleanup', async () => {
    let positive=0,disconnected=0;
    const h=fixture({overview:async()=>({connections:[{provider:'brevo',status:'connected'}]}),sync:async()=>{positive++;return {};},recheck:async()=>{positive++;return {};},disconnect:async()=>{disconnected++;return {status:'draining'};}},'store_owner',{brevo:false,klaviyo:true}).h();
    assert.equal((await h.post(request('/sync',{expectedVersion:1}),'sync')).status,503);
    assert.equal((await h.post(request('/recheck',{expectedVersion:1}),'recheck')).status,503);
    assert.equal(positive,0);
    assert.equal((await h.post(request('/disconnect',{expectedVersion:1}),'disconnect')).status,200);
    assert.equal(disconnected,1);
});

test('disabled provider key recovery is bound to the explicit same-store draining connection and account', async () => {
    const inputs:any[]=[];let rotated=0;let status='draining';let accountId='org';
    const h=fixture({overview:async()=>({connections:[{id:ID,provider:'brevo',status,accountId:'org'}]}),validate:async(input:any)=>{inputs.push(input);return {candidateId:ID,provider:'brevo',accountId,accountName:'Fixture',expiresAt:'2030-01-01T00:00:00Z'};},candidateProvider:async()=> 'brevo',rotate:async()=>{rotated++;return {status:'draining'};},apply:async()=>{throw Error('new connection must stay closed');},sync:async()=>{throw Error('export must stay closed');}},'store_owner',{brevo:false,klaviyo:true}).h();
    const body={provider:'brevo',apiKey:'cleanup-fixture-key',connectionId:ID};
    assert.equal((await h.post(request('/validate',{provider:'brevo',apiKey:'cleanup-fixture-key'}),'validate')).status,503);assert.equal(inputs.length,0);
    assert.equal((await h.post(request('/validate',{...body,connectionId:OP}),'validate')).status,503);assert.equal(inputs.length,0);
    status='connected';assert.equal((await h.post(request('/validate',body),'validate')).status,503);assert.equal(inputs.length,0);
    status='draining';assert.equal((await h.post(request('/validate',body),'validate')).status,200);assert.equal(inputs.length,1);assert.equal(inputs[0].tenantContext.store.id,ID);assert.match(inputs[0].sessionBinding,/^[a-f0-9]{64}$/);
    accountId='different';assert.equal((await h.post(request('/validate',body),'validate')).status,409);
    accountId='org';assert.equal((await h.post(request('/rotate',{candidateId:ID,expectedVersion:3}),'rotate')).status,200);assert.equal(rotated,1);
    assert.equal((await h.post(request('/apply',{candidateId:ID,expectedVersion:0,selection:{kind:'create',name:'New'}}),'apply')).status,503);
    assert.equal((await h.post(request('/sync',{expectedVersion:3}),'sync')).status,503);
    status='connected';assert.equal((await h.post(request('/rotate',{candidateId:ID,expectedVersion:3}),'rotate')).status,503);assert.equal(rotated,1);
});
