import 'server-only';
import {randomUUID} from 'node:crypto';
import {resolveDefaultServerPanelAccessRuntime} from '../server-panel-access/default.ts';
import {resolveServerTrendyolRuntime} from '../server-trendyol/runtime.ts';
import {createTrendyolHttpHandlers} from './handler.ts';
export const trendyolHandlers=createTrendyolHttpHandlers({resolveRuntime:async()=>resolveServerTrendyolRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID});
