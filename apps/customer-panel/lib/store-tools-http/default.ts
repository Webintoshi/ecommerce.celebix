import 'server-only';
import { randomUUID } from 'node:crypto';
import { resolveDefaultServerPanelAccessRuntime } from '../server-panel-access/default.ts';
import { resolveServerStoreToolsRuntime } from '../server-store-tools/runtime.ts';
import { createStoreToolsHttpHandlers } from './handler.ts';
const handlers = createStoreToolsHttpHandlers({ resolveRuntime: async () => resolveServerStoreToolsRuntime(await resolveDefaultServerPanelAccessRuntime()), now: () => new Date(), requestId: randomUUID });
export const handleStoreToolsGet = handlers.GET;
export const handleStoreToolsRequest = handlers.POST;
