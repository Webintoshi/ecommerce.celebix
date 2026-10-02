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
