import { randomUUID } from 'node:crypto';
import { resolveDefaultServerPanelAccessRuntime } from '../../../../lib/server-panel-access/default.ts';
import { resolveServerPolicyAuthoringRuntime } from '../../../../lib/server-policy-authoring/runtime.ts';
import { createPolicyAuthoringHttpHandler } from '../../../../lib/policy-authoring-http/handler.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = createPolicyAuthoringHttpHandler({
  resolveRuntime: async () => resolveServerPolicyAuthoringRuntime(await resolveDefaultServerPanelAccessRuntime()),
  now: () => new Date(),
  requestId: randomUUID,
});
