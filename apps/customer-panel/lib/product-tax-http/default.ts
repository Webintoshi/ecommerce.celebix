import 'server-only';
import {randomUUID} from 'node:crypto';
import {resolveDefaultServerPanelAccessRuntime} from '../server-panel-access/default.ts';
import {resolveServerProductTaxRuntime} from '../server-product-tax/runtime.ts';
import {createProductTaxHttpHandlers} from './handler.ts';
const handlers=createProductTaxHttpHandlers({resolveRuntime:async()=>resolveServerProductTaxRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID});
export async function handleDefaultProductTaxRead(request:Request,context:Readonly<{params:Promise<Readonly<{productId:string}>>}>){const {productId}=await context.params;return handlers.get(request,productId);}
