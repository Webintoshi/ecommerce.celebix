import 'server-only';
import{randomUUID}from'node:crypto';
import{resolveDefaultServerPanelAccessRuntime}from'../server-panel-access/default.ts';
import{resolveServerMerchantContentRuntime}from'../server-merchant-content/runtime.ts';
import{createMerchantContentHttpHandlers}from'./handler.ts';
const handlers=createMerchantContentHttpHandlers({async resolveRuntime(){return resolveServerMerchantContentRuntime(await resolveDefaultServerPanelAccessRuntime());},now:()=>new Date(),requestId:randomUUID});
type Context=Readonly<{params:Promise<Readonly<{kind:string;recordId?:string}>>}>;
export async function handleMerchantContentGet(request:Request,context:Context){const params=await context.params;return handlers.get(request,params.kind,params.recordId??'');}
export async function handleMerchantContentSave(request:Request,context:Context){return handlers.save(request,(await context.params).kind);}
export async function handleMerchantContentVersions(request:Request,context:Context){const params=await context.params;return handlers.versions(request,params.kind,params.recordId??'');}
