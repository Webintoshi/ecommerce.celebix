const RUNTIME = Symbol.for("celebix.owner.merchant-provider-worker");

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const root = globalThis as typeof globalThis & { [RUNTIME]?: unknown };
  if (root[RUNTIME] !== undefined) return;
  const { startDefaultMerchantProviderProductionWorker } = await import(
    "./lib/merchant-provider-execution/default.ts"
  );
  const { startDefaultStoreDomainProductionWorker } = await import(
    "./lib/store-domain-reconciliation/default.ts"
  );
  const { startDefaultOrderEmailProductionWorker } = await import(
    "./lib/order-email/default.ts"
  );
  const emailMarketing = await import("./lib/email-marketing/default.ts")
    .then(module => module.startDefaultEmailMarketingProductionWorker())
    .catch(() => { console.error("email_marketing_worker_degraded"); return Object.freeze({ async stop() {} }); });
  root[RUNTIME] = Object.freeze({
    emailMarketing,
    merchantProvider: await startDefaultMerchantProviderProductionWorker(),
    storeDomains: await startDefaultStoreDomainProductionWorker(),
    orderEmail: await startDefaultOrderEmailProductionWorker(),
  });
}
