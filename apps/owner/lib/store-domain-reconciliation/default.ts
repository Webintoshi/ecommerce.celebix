import process from "node:process";

import { parseStoreDomainWorkerConfig, resolveStoreDomainWorkerMode } from "./config.ts";
import { initializeStoreDomainProductionRuntime } from "./production.ts";

type ScheduledWorker = Readonly<{ stop(): Promise<void> }>;

export async function startDefaultStoreDomainProductionWorker(): Promise<ScheduledWorker> {
  if (resolveStoreDomainWorkerMode(process.env) === "disabled") return Object.freeze({ async stop() {} });
  const runtime = await initializeStoreDomainProductionRuntime(parseStoreDomainWorkerConfig(process.env));
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async (): Promise<void> => {
    let delay = 15_000;
    try {
      const result = await runtime.runOnce();
      delay = result === "empty" || result === "failed" ? 15_000 : 0;
    } catch { console.error("store_domain_worker_run_failed"); }
    if (!stopped) timer = setTimeout(() => void run(), delay);
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
