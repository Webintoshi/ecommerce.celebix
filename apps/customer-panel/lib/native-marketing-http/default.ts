import 'server-only';
import { randomUUID } from 'node:crypto';
import { resolveDefaultServerPanelAccessRuntime } from '../server-panel-access/default.ts';
import { resolveServerNativeMarketingRuntime } from '../server-native-marketing/runtime.ts';
import { createNativeMarketingHttpHandlers } from './handler.ts';
export const nativeMarketingHandlers=createNativeMarketingHttpHandlers({resolveRuntime:async()=>resolveServerNativeMarketingRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID});
