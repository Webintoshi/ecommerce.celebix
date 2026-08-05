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
  root[RUNTIME] = Object.freeze({
    merchantProvider: await startDefaultMerchantProviderProductionWorker(),
    storeDomains: await startDefaultStoreDomainProductionWorker(),
  });
}
