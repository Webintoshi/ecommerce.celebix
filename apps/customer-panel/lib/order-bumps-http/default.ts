import 'server-only';
import { randomUUID } from 'node:crypto';
import { resolveDefaultServerPanelAccessRuntime } from '../server-panel-access/default.ts';
import { resolveServerOrderBumpRuntime } from '../server-order-bumps/runtime.ts';
import { createOrderBumpHandlers } from './handler.ts';

export const orderBumpHandlers = createOrderBumpHandlers({
  resolveRuntime: async () => resolveServerOrderBumpRuntime(await resolveDefaultServerPanelAccessRuntime()),
  now: () => new Date(), requestId: randomUUID,
});
