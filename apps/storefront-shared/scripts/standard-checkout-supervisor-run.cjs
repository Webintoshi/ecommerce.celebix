const { randomUUID } = require('node:crypto');
const COUNTERS = ['expired', 'candidates', 'captured', 'failed', 'processing', 'rejected', 'failures'];

async function runSupervisedStandardCheckout({ checkOnly = false, resolveRuntime, runReconciliation }) {
  // This resolver checks compiled and database-approved authority before exposing any repository.
  const infrastructure = await resolveRuntime();
  if (infrastructure === null) throw new Error('standard_checkout_runtime_unavailable');
  try {
    if (checkOnly) return { status: 'ready' };
    const result = await runReconciliation({
      sessions: infrastructure.sessions, attempts: infrastructure.attempts, runtime: infrastructure.runtime,
      now: () => new Date(), randomUUID,
    });
    if (!['completed', 'failed'].includes(result?.status)
      || COUNTERS.some(key => !Number.isSafeInteger(result[key]) || result[key] < 0)) {
      throw new Error('standard_checkout_result_invalid');
    }
    return Object.fromEntries([['status', result.status], ...COUNTERS.map(key => [key, result[key]])]);
  } finally { await infrastructure.close(); }
}

async function main() {
  const arguments = process.argv.slice(2);
  if (arguments.length > 1 || (arguments.length === 1 && arguments[0] !== '--check-runtime')) {
    throw new Error('standard_checkout_arguments_invalid');
  }
  const { resolveDefaultStandardCheckoutReconciliationRuntime } = await import('../lib/default-runtime.ts');
  const { runStandardCheckoutReconciliation } = await import('./reconcile-standard-checkouts.mjs');
  const result = await runSupervisedStandardCheckout({
    checkOnly: arguments[0] === '--check-runtime',
    resolveRuntime: resolveDefaultStandardCheckoutReconciliationRuntime,
    runReconciliation: runStandardCheckoutReconciliation,
  });
  if (result.status === 'failed' || result.failures > 0) process.exitCode = 1;
  if (result.status === 'ready' || result.candidates > 0 || result.expired > 0 || result.failures > 0) {
    process.stdout.write(`${JSON.stringify({ event: 'standard_checkout_worker_tick', ...result })}\n`);
  }
}
module.exports = { runSupervisedStandardCheckout };
if (require.main === module) main().catch(() => {
  process.stderr.write('standard_checkout_worker_unavailable\n'); process.exitCode = 1;
});
