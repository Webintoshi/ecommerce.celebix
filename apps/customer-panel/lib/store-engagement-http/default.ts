import 'server-only';
import { randomUUID } from 'node:crypto';
import { resolveDefaultServerPanelAccessRuntime } from '../server-panel-access/default.ts';
import { resolveServerStoreEngagementRuntime } from '../server-store-engagement/runtime.ts';
import { createStoreEngagementHandlers } from './handler.ts';
export const storeEngagementHandlers=createStoreEngagementHandlers({resolveRuntime:async()=>resolveServerStoreEngagementRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID});
