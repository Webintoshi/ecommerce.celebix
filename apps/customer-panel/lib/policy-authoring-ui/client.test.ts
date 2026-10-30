import assert from 'node:assert/strict';
import test from 'node:test';
import { createPolicyAuthoringClient, PolicyAuthoringApiError } from './client.ts';
import type { PolicyAuthoringRequest } from '../policy-authoring/types.ts';

const operationId = '11111111-1111-4111-8111-111111111111';
const request: PolicyAuthoringRequest = { kind: 'policy', draftId: '22222222-2222-4222-8222-222222222222', policyKey: 'kvkk', policyVersion: 2, currentBody: '<p>Özgün metin.</p>', locale: 'tr' };
const result = { kind: 'policy', operationId, draftId: request.draftId, policyKey: request.policyKey, policyVersion: request.policyVersion, requestFingerprint: 'a'.repeat(64), body: '<p>Hazırlanan metin.</p>', suggestions: [], chargedCredits: 7, wallet: { balance: 13, reserved: 0, available: 13 } };

test('policy client sends the exact request and operation key and validates the reply target and cost', async () => {
  const sent: { url: string; init: RequestInit }[] = [];
  let reply = result;
  const client = createPolicyAuthoringClient(async (url, init) => { sent.push({ url: String(url), init: init! }); return Response.json(reply); });
  assert.deepEqual(await client.generate(request, operationId), result);
  assert.equal(sent[0].url, '/api/content-ai/policies');
  assert.equal(sent[0].init.credentials, 'same-origin');
  assert.equal(sent[0].init.method, 'POST');
  assert.equal(new Headers(sent[0].init.headers).get('idempotency-key'), operationId);
  assert.deepEqual(JSON.parse(String(sent[0].init.body)), request);
  for (const changed of [{ policyKey: 'membership' }, { policyVersion: 3 }, { chargedCredits: 1 }, { operationId: request.draftId }, { body: '<script>alert(1)</script>' }]) {
    reply = { ...result, ...changed } as typeof result;
    await assert.rejects(client.generate(request, operationId), (error: unknown) => error instanceof PolicyAuthoringApiError && error.code === 'invalid_response');
  }
});

test('errors and oversized replies never become a successful preview or an automatic retry', async () => {
  let calls = 0;
  const denied = createPolicyAuthoringClient(async () => { calls++; return Response.json({ code: 'insufficient_credits' }, { status: 409 }); });
  await assert.rejects(denied.generate(request, operationId), (error: unknown) => error instanceof PolicyAuthoringApiError && error.code === 'insufficient_credits');
  assert.equal(calls, 1);
  const oversized = createPolicyAuthoringClient(async () => new Response('x'.repeat(524_289), { headers: { 'content-type': 'application/json' } }));
  await assert.rejects(oversized.generate(request, operationId), (error: unknown) => error instanceof PolicyAuthoringApiError && error.code === 'invalid_response');
});
