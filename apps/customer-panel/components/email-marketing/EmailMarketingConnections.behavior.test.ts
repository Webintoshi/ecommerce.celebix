import assert from 'node:assert/strict';import test from 'node:test';import {existsSync,readFileSync} from 'node:fs';import {act} from 'react';import {compile,mounted,click,input} from '../../lib/mira-final-test-support.ts';
const ID='22800000-0000-4000-8000-000000000001';const overview={configured:true,providerAvailability:{brevo:true,klaviyo:true},connections:[],sync:{queued:0,verified:0,blocked:0,failed:0,pendingVerification:0,asOf:'2026-10-09T12:00:00Z',suppressionCheckedAt:null}};
function consumer(){assert.ok(existsSync(new URL('./EmailMarketingConnections.tsx',import.meta.url)));return compile('components/email-marketing/EmailMarketingConnections.tsx').EmailMarketingConnections;}
async function select(window:any,host:HTMLElement,value:string){const field=host.querySelector('select[aria-label="Aktarım listesi"]') as HTMLSelectElement;assert.ok(field);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new window.Event('change',{bubbles:true}));});}
function fixture(provider="klaviyo"){const applies:any[]=[];let validated=0;const api:any={overview:async()=>overview,validate:async()=>{validated++;return {candidateId:ID,provider,accountId:'org',accountName:'Fixture',expiresAt:'2030-01-01T00:00:00Z'};},lists:async()=>({items:[{id:'managed',name:'Celebix'}]}),preview:async()=>({eligible:5,denied:1,missingEvidence:2,needsRenewal:0,providerBlocked:null,unchecked:5,overLimit:null,providerCheckedAt:null}),apply:async(i:any)=>{applies.push(i);if(applies.length===1)throw {code:'outcome_unknown'};return {id:ID,provider,version:1,generation:1,credentialVersion:1,accountId:'org',accountName:'Fixture',listId:'managed',listName:'Celebix',status:'connected',senderStatus:'unknown',lastCheckedAt:null,lastSyncedAt:null,errorCode:null};}};return {api,applies,get validated(){return validated;}};}
test('two branded provider cards are lazy and read-only access has no mutation controls',async()=>{const f=fixture();await mounted(consumer(),{canManage:false,configured:true,api:f.api},async(host:HTMLElement)=>{assert.equal(host.querySelectorAll('article').length,2);for(const provider of ['brevo','klaviyo'])assert.equal(host.querySelectorAll(`img[src="/brands/${provider}.svg"]`).length,1);assert.ok(host.querySelector('a[href="/marketing/email/history"]'));assert.equal(f.validated,0);assert.equal([...host.querySelectorAll('button')].some(b=>b.textContent==='Bağla'),false);assert.equal(host.querySelectorAll('h1:not(.srOnly)').length,0);});});
test('brand and recovery are accessible; failed Apply retains selection and exact operation',async()=>{const f=fixture();await mounted(consumer(),{canManage:true,configured:true,api:f.api},async(host:HTMLElement,window)=>{await click(host,'Klaviyo bağlantısını yönet');await input(window,host.querySelector('input[aria-label="API anahtarı"]'),'fixture-secret');await click(host,'Anahtarı kontrol et');await select(window,host,'managed');assert.match(host.textContent??'',/Aktarılacak müşteriler: 5/);assert.match(host.textContent??'',/İzin vermeyen1/);assert.match(host.textContent??'',/satın alma.*sözleşme.*pazarlama izni/i);assert.match(host.textContent??'',/Bilinmiyor/);await click(host,'Uygula');assert.match(host.textContent??'',/aynı işlemi/i);assert.equal((host.querySelector('select[aria-label="Aktarım listesi"]') as HTMLSelectElement).value,'managed');await click(host,'Tekrar uygula');assert.equal(f.applies.length,2);assert.equal(f.applies[0].operationId,f.applies[1].operationId);assert.deepEqual(f.applies[0].selection,f.applies[1].selection);assert.equal(host.querySelector('input[aria-label="API anahtarı"]'),null);assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0);});});
test('closing removes the key and a reopen does not reuse a cleared credential',async()=>{const f=fixture();await mounted(consumer(),{canManage:true,configured:true,api:f.api},async(host:HTMLElement,window)=>{await click(host,'Klaviyo bağlantısını yönet');await input(window,host.querySelector('input[aria-label="API anahtarı"]'),'fixture-secret');await click(host,'Vazgeç');await click(host,'Klaviyo bağlantısını yönet');assert.equal((host.querySelector('input[aria-label="API anahtarı"]') as HTMLInputElement).value,'');assert.equal(f.validated,0);});});
test('official assets are passive SVGs with proportional viewBoxes',()=>{for(const provider of ['brevo','klaviyo']){const path=new URL(`../../public/brands/${provider}.svg`,import.meta.url);assert.ok(existsSync(path));const svg=readFileSync(path,'utf8');assert.match(svg,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);assert.match(svg,/viewBox="0 0 [\d.]+ [\d.]+"/);assert.doesNotMatch(svg,/<(?:script|foreignObject|iframe|image|font|style)\b|\bon\w+\s*=|(?:href|src)\s*=|<!DOCTYPE|url\(/i);}});

test('unknown Apply survives closing without keeping an API key; recovery is the same operation', async () => {
  const f = fixture();
  await mounted(consumer(), {canManage: true, configured: true, api: f.api}, async (host, window) => {
    await click(host, 'Klaviyo bağlantısını yönet');
    await input(window, host.querySelector('input[aria-label="API anahtarı"]'), 'fixture-secret');
    await click(host, 'Anahtarı kontrol et');
    await select(window, host, 'managed');
    await click(host, 'Uygula');
    await click(host, 'Vazgeç');
    await click(host, 'Klaviyo bağlantısını yönet');
    assert.equal(host.querySelector('input[aria-label="API anahtarı"]'), null);
    await click(host, 'Tekrar uygula');
    assert.deepEqual(f.applies[0], f.applies[1]);
  });
});

test('expired validation keeps the list choice for fresh key validation', async () => {
  const f = fixture();
  f.api.apply = async (value: any) => {f.applies.push(value); throw {code: 'candidate_expired'};};
  await mounted(consumer(), {canManage: true, configured: true, api: f.api}, async (host, window) => {
    await click(host, 'Klaviyo bağlantısını yönet');
    await input(window, host.querySelector('input[aria-label="API anahtarı"]'), 'fixture-secret');
    await click(host, 'Anahtarı kontrol et');
    await select(window, host, 'managed');
    await click(host, 'Uygula');
    assert.match(host.textContent ?? '', /Liste seçiminiz korundu/);
    await input(window, host.querySelector('input[aria-label="API anahtarı"]'), 'fixture-secret');
    await click(host, 'Anahtarı kontrol et');
    assert.equal((host.querySelector('select') as HTMLSelectElement).value, 'managed');
  });
});

test('new list uses one immutable Apply while repeated clicks wait', async () => {
  const f = fixture(); let resolve: (value: any) => void;
  f.api.apply = async (value: any) => {f.applies.push(value); return new Promise(r => {resolve = r;});};
  await mounted(consumer(), {canManage: true, configured: true, api: f.api}, async (host, window) => {
    await click(host, 'Klaviyo bağlantısını yönet');
    await input(window, host.querySelector('input[aria-label="API anahtarı"]'), 'fixture-secret');
    await click(host, 'Anahtarı kontrol et');
    await select(window, host, '__create__');
    await input(window, host.querySelector('input[aria-label="Liste adı"]'), 'Mağaza listesi');
    await click(host, 'Uygula');
    await act(async () => {host.querySelector('dialog footer button:last-child')!.dispatchEvent(new window.Event('click', {bubbles: true}));});
    assert.equal(f.applies.length, 1);
    assert.deepEqual(f.applies[0].selection, {kind: 'create', name: 'Mağaza listesi'});
    await act(async () => resolve!({id: ID, provider: 'brevo', status: 'connected'}));
  });
});

test('disconnect warns about external schedules and draining blocks another provider', async () => {
  const f = fixture();
  const connection = {id: ID, provider: 'brevo', version: 1, generation: 1, status: 'connected', accountName: 'Fixture', listName: 'Celebix', lastSyncedAt: null, senderStatus: 'unknown'};
  f.api.overview = async () => ({...overview, connections: [connection]});
  f.api.disconnect = async () => ({...connection, version: 2, status: 'draining'});
  await mounted(consumer(), {canManage: true, configured: true, api: f.api}, async host => {
    await click(host, 'Brevo bağlantısını yönet');
    await click(host, 'Bağlantıyı kaldır');
    assert.match(host.textContent ?? '', /önceden planlanmış kampanyalar devam edebilir/);
    await click(host, 'Uygula');
    assert.match(host.textContent ?? '', /Bağlantı kaldırılıyor/);
    assert.equal((host.querySelector('button[aria-label="Klaviyo bağlantısını yönet"]') as HTMLButtonElement).disabled, true);
  });
});

test('React Strict Mode effect replay does not discard a successful validation', async () => {
  const {createElement, StrictMode} = await import('react');
  const Component = consumer();
  const StrictConsumer = (props: any) => createElement(StrictMode, null, createElement(Component, props));
  const f = fixture();
  await mounted(StrictConsumer, {canManage: true, configured: true, api: f.api}, async (host, window) => {
    await click(host, 'Klaviyo bağlantısını yönet');
    await input(window, host.querySelector('input[aria-label="API anahtarı"]'), 'fixture-secret');
    await click(host, 'Anahtarı kontrol et');
    assert.ok(host.querySelector('select[aria-label="Aktarım listesi"]'));
  });
});

test('a replacement live connection wins over older disconnected generations',async()=>{const f=fixture();f.api.overview=async()=>({...overview,connections:[{id:ID,provider:'brevo',generation:2,status:'disconnected'},{id:ID.replace(/1$/,'2'),provider:'brevo',generation:1,status:'connected',accountName:'Replacement account',listName:'New list',lastSyncedAt:null}]});await mounted(consumer(),{canManage:true,configured:true,api:f.api},async(host)=>{const card=host.querySelector('article[aria-label="Brevo"]')!;assert.match(card.textContent??'',/Replacement account/);assert.match(card.textContent??'',/Kampanyaları aç/);});});
test('Brevo first import offers only a dedicated new list and warns about automations',async()=>{const f=fixture('brevo');await mounted(consumer(),{canManage:true,configured:true,api:f.api},async(host,window)=>{await click(host,'Brevo bağlantısını yönet');await input(window,host.querySelector('input[aria-label="API anahtarı"]'),'fixture');await click(host,'Anahtarı kontrol et');assert.equal(host.querySelector('option[value="managed"]'),null);await select(window,host,'__create__');assert.match(host.textContent??'',/otomasyonlar.*tetiklenebilir/i);});});

const connected = {id: ID, provider: 'brevo', version: 3, generation: 1, credentialVersion: 1, accountId: 'org', accountName: 'Fixture', listId: 'managed', listName: 'Celebix', status: 'connected', senderStatus: 'unknown', lastCheckedAt: null, lastSyncedAt: null, errorCode: null};
test('a saved connection loads without export and manual sync refreshes the queued batch without a key', async () => {
  const f = fixture(); let reads = 0; const syncs: any[] = [];
  f.api.overview = async () => {reads++; return {...overview, connections: [connected], sync: {...overview.sync, queued: syncs.length ? 5 : 0}};};
  f.api.sync = async (value: any) => {syncs.push(value); return connected;};
  await mounted(consumer(), {canManage: true, configured: true, api: f.api}, async host => {
    assert.equal(reads, 1);
    assert.equal(syncs.length, 0);
    assert.match(host.textContent ?? '', /Bağlantı kurmak müşterileri aktarmaz/);
    assert.match(host.textContent ?? '', /tek seferlik/i);
    const card = host.querySelector('article[aria-label="Brevo"]')!;
    assert.match(card.textContent ?? '', /ayrı pazarlama izni kanıtlanan müşteriler/);
    assert.match(card.textContent ?? '', /Satın alma veya sözleşme onayı/);
    assert.match(card.textContent ?? '', /otomasyonları tetikleyebilir/);
    await click(host, 'Eşitle');
    assert.equal(syncs.length, 1);
    assert.equal(syncs[0].expectedVersion, 3);
    assert.equal(f.validated, 0);
    assert.equal(host.querySelector('input[aria-label="API anahtarı"]'), null);
    assert.equal(reads, 2);
    assert.match(host.textContent ?? '', /Bekleyen 5/);
    assert.match(host.textContent ?? '', /aktarım.*sıraya alındı/i);
  });
});
test('manual sync keeps the exact operation after an uncertain result and rejects rapid duplicate clicks', async () => {
  const f = fixture(); const syncs: any[] = []; let resolve: (value: any) => void;
  f.api.overview = async () => ({...overview, connections: [connected]});
  f.api.sync = async (value: any) => {syncs.push(value); if (syncs.length === 1) throw {code: 'outcome_unknown'}; return new Promise(r => {resolve = r;});};
  await mounted(consumer(), {canManage: true, configured: true, api: f.api}, async (host, window) => {
    await click(host, 'Eşitle');
    assert.match(host.textContent ?? '', /aynı işlemi/i);
    await click(host, 'Durumu yenile');
    await click(host, 'Tekrar eşitle');
    const button = host.querySelector('button[aria-label="Brevo müşterilerini eşitle"]')!;
    await act(async () => {button.dispatchEvent(new window.Event('click', {bubbles: true}));});
    assert.equal(syncs.length, 2);
    assert.deepEqual(syncs[0], syncs[1]);
    await act(async () => resolve!(connected));
    assert.equal(window.localStorage.length, 0);
    assert.equal(window.sessionStorage.length, 0);
  });
});
test('connecting never starts export and read-only users cannot sync', async () => {
  const f = fixture(); let synced = 0;
  f.api.sync = async () => {synced++; return connected;};
  f.api.apply = async () => ({...connected, provider: 'klaviyo'});
  await mounted(consumer(), {canManage: true, configured: true, api: f.api}, async (host, window) => {
    await click(host, 'Klaviyo bağlantısını yönet');
    await input(window, host.querySelector('input[aria-label="API anahtarı"]'), 'fixture-secret');
    await click(host, 'Anahtarı kontrol et');
    await select(window, host, 'managed');
    await click(host, 'Uygula');
    assert.equal(synced, 0);
    assert.ok(host.querySelector('button[aria-label="Klaviyo müşterilerini eşitle"]'));
  });
  f.api.overview = async () => ({...overview, connections: [connected]});
  await mounted(consumer(), {canManage: false, configured: true, api: f.api}, async host => {
    assert.equal(host.querySelector('button[aria-label="Brevo müşterilerini eşitle"]'), null);
    assert.equal(synced, 0);
  });
});

test('a stale sync waits for the current saved version before a new explicit operation', async () => {
  const f = fixture(); const syncs: any[] = []; let reads = 0; let resolveOverview: (value: any) => void;
  f.api.overview = async () => {reads++; return reads === 1 ? {...overview, connections: [connected]} : new Promise(r => {resolveOverview = r;});};
  f.api.sync = async (value: any) => {syncs.push(value); if (syncs.length === 1) throw {code: 'version_conflict'}; return {...connected, version: 4};};
  await mounted(consumer(), {canManage: true, configured: true, api: f.api}, async (host, window) => {
    await click(host, 'Eşitle');
    assert.equal((host.querySelector('button[aria-label="Brevo müşterilerini eşitle"]') as HTMLButtonElement).disabled, true);
    await act(async () => resolveOverview!({...overview, connections: [{...connected, version: 4}]}));
    await click(host, 'Eşitle');
    assert.equal(syncs.length, 2);
    assert.equal(syncs[1].expectedVersion, 4);
    assert.notEqual(syncs[0].operationId, syncs[1].operationId);
    await act(async () => resolveOverview!({...overview, connections: [{...connected, version: 4}]}));
  });
});

test('a leased uncertain sync keeps the same batch intent until its outcome is resolved', async () => {
  const f = fixture(); const syncs: any[] = [];
  f.api.overview = async () => ({...overview, connections: [connected]});
  f.api.sync = async (value: any) => {syncs.push(value); if (syncs.length < 3) throw {code: syncs.length === 1 ? 'outcome_unknown' : 'cleanup_pending'}; return connected;};
  await mounted(consumer(), {canManage: true, configured: true, api: f.api}, async host => {
    await click(host, 'Eşitle');
    await click(host, 'Tekrar eşitle');
    await click(host, 'Tekrar eşitle');
    assert.equal(syncs.length, 3);
    assert.deepEqual(syncs[0], syncs[1]);
    assert.deepEqual(syncs[0], syncs[2]);
    assert.match(host.textContent ?? '', /aktarım.*sıraya alındı/i);
  });
});

test('server availability keeps Brevo visible and disabled while Klaviyo can connect', async () => {
  const f=fixture();f.api.overview=async()=>({...overview,providerAvailability:{brevo:false,klaviyo:true}});
  await mounted(consumer(),{canManage:true,configured:true,api:f.api},async host=>{
    const brevo=host.querySelector('article[aria-label="Brevo"]')!;
    assert.match(brevo.textContent??'',/Bağlantı hazırlığı sürüyor/);
    assert.equal((brevo.querySelector('button[aria-label="Brevo bağlantısını yönet"]') as HTMLButtonElement).disabled,true);
    assert.equal((host.querySelector('button[aria-label="Klaviyo bağlantısını yönet"]') as HTMLButtonElement).disabled,false);
    await click(host,'Klaviyo bağlantısını yönet');assert.ok(host.querySelector('input[aria-label="API anahtarı"]'));
    assert.equal(f.validated,0);
  });
});

test('a disabled connected provider retains disconnect but offers no positive sync or recheck', async () => {
  const f=fixture();let removed=0;
  f.api.overview=async()=>({...overview,providerAvailability:{brevo:false,klaviyo:true},connections:[connected]});
  f.api.disconnect=async()=>{removed++;return {...connected,status:'draining'};};
  await mounted(consumer(),{canManage:true,configured:true,api:f.api},async host=>{
    const sync=host.querySelector('button[aria-label="Brevo müşterilerini eşitle"]') as HTMLButtonElement|null;
    assert.ok(!sync||sync.disabled);
    await click(host,'Brevo bağlantısını yönet');
    assert.equal([...host.querySelectorAll('button')].some(b=>b.textContent==='Yeniden kontrol et'),false);
    assert.equal([...host.querySelectorAll('button')].some(b=>b.textContent==='API anahtarını değiştir'),false);
    await click(host,'Bağlantıyı kaldır');await click(host,'Uygula');assert.equal(removed,1);
  });
});

test('disabling a provider after an uncertain sync leaves its disconnect reachable', async () => {
  const f=fixture();let available=true,removed=0;
  f.api.overview=async()=>({...overview,providerAvailability:{brevo:available,klaviyo:true},connections:[connected]});
  f.api.sync=async()=>{throw {code:'outcome_unknown'};};
  f.api.disconnect=async()=>{removed++;return {...connected,status:'draining'};};
  await mounted(consumer(),{canManage:true,configured:true,api:f.api},async host=>{
    await click(host,'Eşitle');available=false;await click(host,'Durumu yenile');
    assert.equal((host.querySelector('button[aria-label="Brevo bağlantısını yönet"]') as HTMLButtonElement).disabled,false);
    await click(host,'Brevo bağlantısını yönet');await click(host,'Bağlantıyı kaldır');await click(host,'Uygula');assert.equal(removed,1);
  });
});

test('a disabled draining connection can renew its own key solely to finish cleanup', async () => {
  const f=fixture('brevo');const validations:any[]=[];const rotations:any[]=[];let discoveries=0;
  f.api.overview=async()=>({...overview,providerAvailability:{brevo:false,klaviyo:true},connections:[{...connected,status:'draining'}]});
  f.api.validate=async(input:any)=>{validations.push(input);return {candidateId:ID,provider:'brevo',accountId:'org',accountName:'Fixture',expiresAt:'2030-01-01T00:00:00Z'};};
  f.api.lists=async()=>{discoveries++;throw Error('cleanup renewal needs no list discovery');};
  f.api.rotate=async(input:any)=>{rotations.push(input);return {...connected,status:'draining',version:4};};
  await mounted(consumer(),{canManage:true,configured:true,api:f.api},async(host,window)=>{
    await click(host,'Brevo bağlantısını yönet');await click(host,'Temizlik için API anahtarını yenile');
    await input(window,host.querySelector('input[aria-label="API anahtarı"]'),'cleanup-fixture-key');await click(host,'Anahtarı kontrol et');
    assert.equal(validations.length,1);assert.equal(validations[0].connectionId,ID);assert.equal(discoveries,0);
    await click(host,'Uygula');assert.equal(rotations.length,1);assert.equal(rotations[0].expectedVersion,3);
    assert.match(host.textContent??'',/Bağlantı kaldırılıyor/);assert.equal(host.querySelector('input[aria-label="API anahtarı"]'),null);
    assert.equal(host.querySelector('button[aria-label="Brevo müşterilerini eşitle"]'),null);
  });
});
