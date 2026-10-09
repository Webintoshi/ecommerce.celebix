import assert from 'node:assert/strict';import test from 'node:test';import {existsSync,readFileSync} from 'node:fs';import {act} from 'react';import {compile,mounted,click,input} from '../../lib/mira-final-test-support.ts';
const ID='22800000-0000-4000-8000-000000000001';const overview={configured:true,connections:[],sync:{queued:0,verified:0,blocked:0,failed:0,pendingVerification:0,asOf:'2026-10-09T12:00:00Z',suppressionCheckedAt:null}};
function consumer(){assert.ok(existsSync(new URL('./EmailMarketingConnections.tsx',import.meta.url)));return compile('components/email-marketing/EmailMarketingConnections.tsx').EmailMarketingConnections;}
async function select(window:any,host:HTMLElement,value:string){const field=host.querySelector('select[aria-label="Aktarım listesi"]') as HTMLSelectElement;assert.ok(field);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new window.Event('change',{bubbles:true}));});}
function fixture(){const applies:any[]=[];let validated=0;const api:any={overview:async()=>overview,validate:async()=>{validated++;return {candidateId:ID,provider:'brevo',accountId:'org',accountName:'Fixture',expiresAt:'2030-01-01T00:00:00Z'};},lists:async()=>({items:[{id:'managed',name:'Celebix'}]}),preview:async()=>({eligible:5,denied:1,missingEvidence:2,needsRenewal:0,providerBlocked:null,unchecked:5,overLimit:null,providerCheckedAt:null}),apply:async(i:any)=>{applies.push(i);if(applies.length===1)throw {code:'outcome_unknown'};return {id:ID,provider:'brevo',version:1,generation:1,credentialVersion:1,accountId:'org',accountName:'Fixture',listId:'managed',listName:'Celebix',status:'connected',senderStatus:'unknown',lastCheckedAt:null,lastSyncedAt:null,errorCode:null};}};return {api,applies,get validated(){return validated;}};}
test('two branded provider cards are lazy and read-only access has no mutation controls',async()=>{const f=fixture();await mounted(consumer(),{canManage:false,configured:true,api:f.api},async(host:HTMLElement)=>{assert.equal(host.querySelectorAll('article').length,2);for(const provider of ['brevo','klaviyo'])assert.equal(host.querySelectorAll(`img[src="/brands/${provider}.svg"]`).length,1);assert.ok(host.querySelector('a[href="/marketing/email/history"]'));assert.equal(f.validated,0);assert.equal([...host.querySelectorAll('button')].some(b=>b.textContent==='Bağla'),false);assert.equal(host.querySelectorAll('h1:not(.srOnly)').length,0);});});
test('brand and recovery are accessible; failed Apply retains selection and exact operation',async()=>{const f=fixture();await mounted(consumer(),{canManage:true,configured:true,api:f.api},async(host:HTMLElement,window)=>{await click(host,'Brevo bağlantısını yönet');await input(window,host.querySelector('input[aria-label="API anahtarı"]'),'fixture-secret');await click(host,'Anahtarı kontrol et');await select(window,host,'managed');assert.match(host.textContent??'',/5 izinli kişi/);assert.match(host.textContent??'',/Bilinmiyor/);await click(host,'Uygula');assert.match(host.textContent??'',/aynı işlemi/i);assert.equal((host.querySelector('select[aria-label="Aktarım listesi"]') as HTMLSelectElement).value,'managed');await click(host,'Tekrar uygula');assert.equal(f.applies.length,2);assert.equal(f.applies[0].operationId,f.applies[1].operationId);assert.deepEqual(f.applies[0].selection,f.applies[1].selection);assert.equal(host.querySelector('input[aria-label="API anahtarı"]'),null);assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0);});});
test('closing removes the key and a reopen does not reuse a cleared credential',async()=>{const f=fixture();await mounted(consumer(),{canManage:true,configured:true,api:f.api},async(host:HTMLElement,window)=>{await click(host,'Brevo bağlantısını yönet');await input(window,host.querySelector('input[aria-label="API anahtarı"]'),'fixture-secret');await click(host,'Vazgeç');await click(host,'Brevo bağlantısını yönet');assert.equal((host.querySelector('input[aria-label="API anahtarı"]') as HTMLInputElement).value,'');assert.equal(f.validated,0);});});
test('official assets are passive SVGs with proportional viewBoxes',()=>{for(const provider of ['brevo','klaviyo']){const path=new URL(`../../public/brands/${provider}.svg`,import.meta.url);assert.ok(existsSync(path));const svg=readFileSync(path,'utf8');assert.match(svg,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);assert.match(svg,/viewBox="0 0 [\d.]+ [\d.]+"/);assert.doesNotMatch(svg,/<(?:script|foreignObject|iframe|image|font|style)\b|\bon\w+\s*=|(?:href|src)\s*=|<!DOCTYPE|url\(/i);}});

test('unknown Apply survives closing without keeping an API key; recovery is the same operation', async () => {
  const f = fixture();
  await mounted(consumer(), {canManage: true, configured: true, api: f.api}, async (host, window) => {
    await click(host, 'Brevo bağlantısını yönet');
    await input(window, host.querySelector('input[aria-label="API anahtarı"]'), 'fixture-secret');
    await click(host, 'Anahtarı kontrol et');
    await select(window, host, 'managed');
    await click(host, 'Uygula');
    await click(host, 'Vazgeç');
    await click(host, 'Brevo bağlantısını yönet');
    assert.equal(host.querySelector('input[aria-label="API anahtarı"]'), null);
    await click(host, 'Tekrar uygula');
    assert.deepEqual(f.applies[0], f.applies[1]);
  });
});

test('expired validation keeps the list choice for fresh key validation', async () => {
  const f = fixture();
  f.api.apply = async (value: any) => {f.applies.push(value); throw {code: 'candidate_expired'};};
  await mounted(consumer(), {canManage: true, configured: true, api: f.api}, async (host, window) => {
    await click(host, 'Brevo bağlantısını yönet');
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
    await click(host, 'Brevo bağlantısını yönet');
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
    await click(host, 'Brevo bağlantısını yönet');
    await input(window, host.querySelector('input[aria-label="API anahtarı"]'), 'fixture-secret');
    await click(host, 'Anahtarı kontrol et');
    assert.ok(host.querySelector('select[aria-label="Aktarım listesi"]'));
  });
});
