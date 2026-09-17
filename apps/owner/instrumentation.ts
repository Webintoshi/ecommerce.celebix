const RUNTIME = Symbol.for("celebix.owner.merchant-provider-worker");

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // An invitation startup failure never aborts ordinary auth or other workers.
  try {
    const { startDefaultInvitationWorker } = await import("./lib/store-admin-invitations/worker-default.ts");
    const worker = await startDefaultInvitationWorker();
    const invitationSymbol = Symbol.for("celebix.owner.invitation-worker-signals");
    const signals = globalThis as typeof globalThis & { [invitationSymbol]?: boolean };
    if (!signals[invitationSymbol]) {
      signals[invitationSymbol] = true;
      process.once("SIGTERM", () => { void worker.stop(); });
      process.once("SIGINT", () => { void worker.stop(); });
    }
  } catch { /* Separate disabled/unavailable subsystem. */ }
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
  root[RUNTIME] = Object.freeze({
    merchantProvider: await startDefaultMerchantProviderProductionWorker(),
    storeDomains: await startDefaultStoreDomainProductionWorker(),
    orderEmail: await startDefaultOrderEmailProductionWorker(),
  });
}
