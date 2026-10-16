import 'server-only';
import {randomUUID} from 'node:crypto';
import {resolveDefaultServerPanelAccessRuntime} from '../server-panel-access/default.ts';
import {resolveServerCommercialPlanRuntime} from '../server-commercial-plan/runtime.ts';
import {createCommercialPlanHttpHandlers} from './handler.ts';
const handlers=createCommercialPlanHttpHandlers({resolveRuntime:async()=>resolveServerCommercialPlanRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID});
export const handleCommercialPlanGet=handlers.GET;
export const handleCommercialPlanPost=handlers.POST;
