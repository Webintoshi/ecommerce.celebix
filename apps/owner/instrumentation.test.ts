import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("instrumentation keeps node-only worker dependencies behind the node runtime dynamic import", () => {
  const source = readFileSync(new URL("./instrumentation.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import .*merchant-provider-execution/m);
  assert.doesNotMatch(source, /^import .*store-domain-reconciliation/m);
  const guard = source.indexOf('process.env.NEXT_RUNTIME !== "nodejs"');
  const dynamicImport = source.indexOf('await import(\n    "./lib/merchant-provider-execution/default.ts"');
  assert.ok(guard >= 0);
  assert.ok(dynamicImport > guard);
  const domainImport = source.indexOf('await import(\n    "./lib/store-domain-reconciliation/default.ts"');
  assert.ok(domainImport > guard);
  assert.doesNotMatch(source, /startDefaultMerchantProviderProductionWorker\(\)\.catch/);
  assert.doesNotMatch(source, /merchant_provider_worker_start_failed/);
});
