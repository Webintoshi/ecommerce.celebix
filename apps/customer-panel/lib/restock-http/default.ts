import 'server-only';
import { randomUUID } from 'node:crypto';
import { resolveDefaultServerPanelAccessRuntime } from '../server-panel-access/default.ts';
import { resolveServerRestockRuntime } from '../server-restock/runtime.ts';
import { createRestockStatsHandler } from './handler.ts';
export const handleRestockStats = createRestockStatsHandler({
  resolveRuntime: async () => resolveServerRestockRuntime(await resolveDefaultServerPanelAccessRuntime()),
  now: () => new Date(), requestId: randomUUID,
});
