import {randomUUID} from 'node:crypto';
import {resolveDefaultServerPanelAccessRuntime} from '@/lib/server-panel-access/default';
import {resolveServerContentResearchRuntime} from '@/lib/server-content-research/runtime';
import {createContentResearchHttpHandlers} from '@/lib/content-research-http/handler';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=30;
export const GET=createContentResearchHttpHandlers({resolveRuntime:async()=>resolveServerContentResearchRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID}).get;
