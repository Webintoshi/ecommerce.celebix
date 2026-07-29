import process from "node:process";

import {
  parseMerchantProviderProductionConfig,
  resolveMerchantProviderProductionMode,
} from "./production-config.ts";
import { initializeMerchantProviderProductionRuntime } from "./production.ts";

type ScheduledWorker = Readonly<{ stop(): Promise<void> }>;

const INTERVAL_MS = 5_000;

export async function startDefaultMerchantProviderProductionWorker(): Promise<ScheduledWorker> {
  if (resolveMerchantProviderProductionMode(process.env) === "disabled") {
    return Object.freeze({ async stop() {} });
  }
  const runtime = await initializeMerchantProviderProductionRuntime(
    parseMerchantProviderProductionConfig(process.env),
  );
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async (): Promise<void> => {
    try { await runtime.runOnce(); }
    catch { console.error("merchant_provider_worker_run_failed"); }
    if (!stopped) timer = setTimeout(() => void run(), INTERVAL_MS);
  };
  void run();
  return Object.freeze({
    async stop() {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      await runtime.close();
    },
  });
}
