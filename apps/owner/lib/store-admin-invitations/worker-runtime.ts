import { invitationOwnerConfig } from "./default.ts";
import { initializeInvitationRuntime, INVITATION_TIMEOUTS } from "./runtime.ts";
import { createInvitationWorkflowRepository } from "./repository.ts";
import { createInvitationWorker } from "./worker.ts";
export async function initializeInvitationWorkerRuntime(source: Record<string, string | undefined>) {
  if (source.CELEBIX_ADMIN_INVITATIONS_WORKER_ENABLED !== "true") return null;
  const runtime = await initializeInvitationRuntime(source, invitationOwnerConfig(source), { role: "workflow" });
  if (runtime.state !== "ready") return null;
  const worker = createInvitationWorker({ repository: createInvitationWorkflowRepository({ pool: runtime.pool, timeouts: INVITATION_TIMEOUTS, scope: runtime.config.delivery }), config: runtime.config.delivery, keyring: runtime.config.keyring, workerId: runtime.config.workerId, clock: () => new Date() });
  return { runOnce: worker.runOnce, close: runtime.close };
}
