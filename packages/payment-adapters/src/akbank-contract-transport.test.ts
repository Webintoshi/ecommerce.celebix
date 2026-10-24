import assert from 'node:assert/strict';
import test from 'node:test';
import { AKBANK_HOSTED_FORM_FIELD_NAMES } from './contracts.ts';
import { AKBANK_JSON_PACKET } from './providers/akbank/packet.ts';
import { parsePaymentAdapterPacket } from './validation.ts';

test('Akbank admits only its fixed bank-hosted form action and field set', () => {
  assert.equal(AKBANK_HOSTED_FORM_FIELD_NAMES.length, 29);
  assert.equal(AKBANK_HOSTED_FORM_FIELD_NAMES.at(-1), 'hash');
  assert.equal(AKBANK_JSON_PACKET.presentation.live.kind, 'provider_form_post');
  for (const replacement of [
    { url: 'https://attacker.example/payhosting' },
    { fieldNames: [...AKBANK_HOSTED_FORM_FIELD_NAMES, 'cardNumber'] },
    { fieldNames: AKBANK_HOSTED_FORM_FIELD_NAMES.slice(1) },
    { fieldNames: [...AKBANK_HOSTED_FORM_FIELD_NAMES].reverse() },
  ]) {
    const packet = structuredClone(AKBANK_JSON_PACKET);
    Object.assign(packet.presentation.live, replacement);
    assert.throws(() => parsePaymentAdapterPacket(packet), /payment_adapter_packet_invalid/);
  }
});

import type { ProviderTransportRequestHeaders } from './transport.ts';
import { createBoundedProviderTransport } from './transport.ts';
const mac = Buffer.alloc(64, 17).toString('base64');
function request(headers: Record<string,string> = {'content-type':'application/json','auth-hash':mac}) {
  return {packet:AKBANK_JSON_PACKET, environment:'live' as const, method:'POST' as const,
    url: AKBANK_JSON_PACKET.endpoints.live[0]!, headers: headers as ProviderTransportRequestHeaders, body:new TextEncoder().encode('{"txnCode":"1010"}')};
}
test('Akbank transport preserves raw authenticated body and only the MAC response header', async () => {
  const transport = createBoundedProviderTransport({timeoutMs:1000,maximumResponseBytes:1000,fetch:async r => {
    assert.equal(r.headers.get('auth-hash'),mac);
    assert.equal(r.headers.get('authorization'),null);
    return new Response('{ "terminal" : {} }',{headers:{'content-type':'application/json','Auth-Hash':mac,'x-secret':'not exported'}});
  }});
  const result = await transport.request(request());
  assert.equal(result.kind,'response');
  if(result.kind==='response') {
    assert.equal(new TextDecoder().decode(result.body),'{ "terminal" : {} }');
    assert.deepEqual(result.headers,{'auth-hash':mac});
  }
});
test('Akbank transport rejects absent MAC and unauthorized headers but leaves raw JSON authentication to its adapter', async () => {
  let calls=0;
  const transport = createBoundedProviderTransport({timeoutMs:1000,maximumResponseBytes:1000,fetch:async () => {
    calls++; return new Response('{}',{headers:{'content-type':'application/json'}});
  }});
  assert.equal((await transport.request(request())).kind,'unknown');
  assert.equal((await transport.request(request({'content-type':'application/json','auth-hash':mac,'authorization':'bad'}))).kind,'unknown');
  assert.equal(calls,1);
  const duplicate = createBoundedProviderTransport({timeoutMs:1000,maximumResponseBytes:1000,fetch:async () => new Response('{"a":1,"a":2}',{headers:{'content-type':'application/json','auth-hash':mac}})});
  const raw = await duplicate.request(request());
  assert.equal(raw.kind,'response');
  if(raw.kind==='response') assert.equal(new TextDecoder().decode(raw.body),'{"a":1,"a":2}');
});
test('only Akbank documented empty HTTP 401 can omit JSON and MAC', async () => {
  const transport = createBoundedProviderTransport({timeoutMs:1000,maximumResponseBytes:1000,fetch:async () => new Response(null,{status:401})});
  const result = await transport.request(request());
  assert.equal(result.kind,'response');
  if(result.kind==='response') {assert.equal(result.status,401);assert.equal(result.body.length,0);}
});
