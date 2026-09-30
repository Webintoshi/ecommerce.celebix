import 'server-only';
import { randomUUID } from 'node:crypto';
import { resolveDefaultServerPanelAccessRuntime } from '../server-panel-access/default.ts';
import { resolveServerSeoRuntime } from '../server-seo/runtime.ts';
import { createSeoHttpHandlers } from './handler.ts';

export const seoHandlers=createSeoHttpHandlers({resolveRuntime:async()=>resolveServerSeoRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID});
