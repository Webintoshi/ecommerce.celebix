import{randomUUID}from'node:crypto';
import{resolveDefaultServerPanelAccessRuntime}from'@/lib/server-panel-access/default';
import{resolveServerContentResourceAuthoringRuntime}from'@/lib/server-content-resource-authoring/runtime';
import{createContentResourceAuthoringHttpHandlers}from'@/lib/content-resource-authoring-http/handler';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=60;
export const GET=createContentResourceAuthoringHttpHandlers({resolveRuntime:async()=>resolveServerContentResourceAuthoringRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID}).get;
