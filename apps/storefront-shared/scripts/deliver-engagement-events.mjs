import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
async function main() {
  const { initializeCustomerEngagementWorker } = require('../.engagement-worker/runtime.cjs');
  const runtime = await initializeCustomerEngagementWorker();
  if (process.argv.includes('--check-runtime')) { await runtime.close(); return; }
  let stopped = false, wake;
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { stopped = true; wake?.(); });
  try {
    while (!stopped) {
      try {
        const result = await runtime.tick();
        if (result.reviews === 'failed' || result.restock === null || result.restock.recordingErrors) console.error('engagement_worker_tick_degraded');
        else if (result.reviews === 'processed' || result.restock.claimed) console.info(JSON.stringify({ event: 'engagement_worker_tick', ...result }));
      } catch { console.error('engagement_worker_tick_failed'); }
      if (stopped) break;
      await new Promise(resolve => { const timer = setTimeout(resolve, 10_000); wake = () => { clearTimeout(timer); resolve(); }; }); wake = undefined;
    }
  } finally { await runtime.close(); }
}
main().catch(() => { console.error('engagement_worker_start_failed'); process.exitCode = 1; });
