const RUNTIME = Symbol.for("celebix.owner.merchant-provider-worker");

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const root = globalThis as typeof globalThis & { [RUNTIME]?: unknown };
  if (root[RUNTIME] !== undefined) return;
  const { startDefaultMerchantProviderProductionWorker } = await import(
    "./lib/merchant-provider-execution/default.ts"
  );
  root[RUNTIME] = await startDefaultMerchantProviderProductionWorker();
}
