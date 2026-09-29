import { randomUUID } from 'node:crypto';
import { resolveDefaultServerPanelAccessRuntime } from '../../../../lib/server-panel-access/default.ts';
import { resolveServerContentAuthoringRuntime } from '../../../../lib/server-content-authoring/runtime.ts';
import { createContentAuthoringHttpHandlers } from '../../../../lib/content-authoring-http/handler.ts';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
export const POST=createContentAuthoringHttpHandlers({resolveRuntime:async()=>resolveServerContentAuthoringRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID}).post;
