const assert = require('node:assert/strict');
const test = require('node:test');
let runSupervisedStandardCheckout;
try { ({ runSupervisedStandardCheckout } = require('./standard-checkout-supervisor-run.cjs')); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

test('readiness opens the exact approved runtime and closes it without running reconciliation', async () => {
  assert.equal(typeof runSupervisedStandardCheckout, 'function', 'approved readiness gate must exist');
  const events = [];
  const result = await runSupervisedStandardCheckout({
    checkOnly: true,
    resolveRuntime: async () => { events.push('approved authority preflight'); return { close: async () => events.push('close') }; },
    runReconciliation: async () => { throw new Error('financial writes forbidden during readiness'); },
  });
  assert.deepEqual(events, ['approved authority preflight', 'close']);
  assert.deepEqual(result, { status: 'ready' });
});

test('missing exact authority rejects a normal run without querying or mutating payment state', async () => {
  assert.equal(typeof runSupervisedStandardCheckout, 'function');
  await assert.rejects(runSupervisedStandardCheckout({
    resolveRuntime: async () => null,
    runReconciliation: async () => { throw new Error('must not run'); },
  }), /standard_checkout_runtime_unavailable/);
});

test('a normal run uses the approved repositories and always closes after a failure', async () => {
  assert.equal(typeof runSupervisedStandardCheckout, 'function');
  let closed = 0;
  const sessions = {}, attempts = {}, runtime = {};
  await assert.rejects(runSupervisedStandardCheckout({
    resolveRuntime: async () => ({ sessions, attempts, runtime, close: async () => { closed += 1; } }),
    runReconciliation: async (dependencies) => {
      assert.equal(dependencies.sessions, sessions); assert.equal(dependencies.attempts, attempts); assert.equal(dependencies.runtime, runtime);
      assert.ok(dependencies.now() instanceof Date); assert.match(dependencies.randomUUID(), /^[0-9a-f-]{36}$/);
      throw new Error('private provider payload');
    },
  }), /private provider payload/);
  assert.equal(closed, 1);
});

test('worker output exposes only finite counters and rejects malformed summaries', async () => {
  assert.equal(typeof runSupervisedStandardCheckout, 'function');
  const infrastructure = { close: async () => {} };
  const dependencies = { resolveRuntime: async () => infrastructure };
  const result = await runSupervisedStandardCheckout({ ...dependencies, runReconciliation: async () => ({
    status: 'completed', expired: 0, candidates: 1, captured: 0, failed: 0, processing: 1, rejected: 0, failures: 0,
    providerReference: 'private', customer: 'private',
  }) });
  assert.deepEqual(result, { status: 'completed', expired: 0, candidates: 1, captured: 0, failed: 0, processing: 1, rejected: 0, failures: 0 });
  await assert.rejects(runSupervisedStandardCheckout({ ...dependencies, runReconciliation: async () => ({ status: 'completed', failures: NaN }) }), /standard_checkout_result_invalid/);
});

test('production supervisor forwards approved scope to the real reconciliation worker before processing an eligible attempt', async () => {
  const { runStandardCheckoutReconciliation } = await import('./reconcile-standard-checkouts.mjs');
  const authority = Object.freeze({ providerCode: 'paytr_iframe', environment: 'live', adapterVersion: 1,
    evidenceDigest: `sha256:${'a'.repeat(64)}` });
  const executionAuthorities = Object.freeze([authority]);
  let selected = 0; let reconciled = 0; let closed = 0;
  const attemptId = '10000000-0000-4000-8000-000000000193';
  const result = await runSupervisedStandardCheckout({
    resolveRuntime: async () => ({
      executionAuthorities,
      sessions: { expireCreated: async () => 0, reconciliationCandidatesScoped: async (input) => {
        selected += 1; assert.deepEqual(input.authorities, executionAuthorities); assert.equal(input.limit, 25);
        return [{ attemptId, attemptVersion: 4, attemptStatus: 'provider_outcome_unknown',
          credentialVersion: 2, providerReference: 'safe-193', ...authority }];
      }, reconciliationCandidates: async () => { throw new Error('unscoped selection forbidden'); } },
      attempts: { markUnknown: async () => { throw new Error('already unknown'); } },
      runtime: { reconcile: async (input) => { reconciled += 1; assert.equal(input.attemptId, attemptId); return { kind: 'captured' }; } },
      close: async () => { closed += 1; },
    }),
    runReconciliation: runStandardCheckoutReconciliation,
  });
  assert.deepEqual(result, { status: 'completed', expired: 0, candidates: 1, captured: 1,
    failed: 0, processing: 0, rejected: 0, failures: 0 });
  assert.equal(selected, 1); assert.equal(reconciled, 1); assert.equal(closed, 1);
});
