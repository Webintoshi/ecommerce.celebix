import "server-only";

import {
  resolveDefaultCheckoutReconciliationRuntime,
  runQuickOrderReconciliation,
} from "../lib/checkout/runtime.ts";

const failed = Object.freeze({ status: "failed", claimed: 0, settled: 0, unknown: 0, failures: 1 });

async function main() {
  if (process.argv.length !== 2) return failed;
  const runtime = await resolveDefaultCheckoutReconciliationRuntime();
  if (runtime === null) return failed;
  try {
    return await runQuickOrderReconciliation({ paymentRepository: runtime.paymentRepository, keyring: runtime.keyring });
  } finally {
    await runtime.close().catch(() => undefined);
  }
}

const result = await main().catch(() => failed);
const serialized = `${JSON.stringify(result)}\n`;
if (result.status === "failed" || result.failures !== 0) {
  process.stderr.write(serialized);
  process.exitCode = 1;
} else {
  process.stdout.write(serialized);
}
