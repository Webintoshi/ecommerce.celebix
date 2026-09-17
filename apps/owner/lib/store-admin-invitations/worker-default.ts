import { initializeInvitationWorkerRuntime } from "./worker-runtime.ts";
type Worker = { runOnce(): Promise<unknown>; close(): Promise<void> };
type Handle = Readonly<{ stop(): Promise<void> }>;
export function createInvitationWorkerStarter(d: { source: Record<string, string | undefined>; initialize(): Promise<Worker | null>; intervalMs?: number }) {
  let singleton: Promise<Handle> | undefined;
  return () => singleton ??= (async () => {
    const noop = Object.freeze({ async stop() {} });
    if (d.source.CELEBIX_ADMIN_INVITATIONS_WORKER_ENABLED !== "true") return noop;
    let worker: Worker | null;
    try { worker = await d.initialize(); } catch { return noop; }
    if (!worker) return noop;
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, current: Promise<void>, closing: Promise<void> | undefined;
    const interval = d.intervalMs ?? 5000;
    if (!Number.isSafeInteger(interval) || interval < 1000 || interval > 60000) { await worker.close(); return noop; }
    const run = async () => {
      try { await worker.runOnce(); } catch { /* Failure is isolated; next tick remains delayed. */ }
      if (!stopped) timer = setTimeout(() => { current = run(); }, interval);
    };
    current = run();
    return Object.freeze({ stop() { return closing ??= (async () => { stopped = true; if (timer) clearTimeout(timer); await current; await worker.close(); })(); } });
  })();
}
export const startDefaultInvitationWorker = createInvitationWorkerStarter({ source: process.env, initialize: () => initializeInvitationWorkerRuntime(process.env) });
