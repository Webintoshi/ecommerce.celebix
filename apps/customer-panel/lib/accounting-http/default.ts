import 'server-only';
import {randomUUID} from 'node:crypto';
import {resolveDefaultServerPanelAccessRuntime} from '../server-panel-access/default.ts';
import {resolveServerAccountingRuntime} from '../server-accounting/runtime.ts';
import {createAccountingHttpHandlers,type AccountingReadArea} from './handler.ts';
import type {AccountingMutation} from '@celebix/saas-contracts';
const handlers=createAccountingHttpHandlers({resolveRuntime:async()=>resolveServerAccountingRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID});
const MUTATIONS:Readonly<Record<string,AccountingMutation>>={collections:'collect','opening-debts':'openingDebt',accounts:'saveAccount','opening-balances':'openBalance',expenses:'expense',transfers:'transfer','card-settlements':'settleCard',reversals:'reverse',returns:'returnCredit',refunds:'refund'};
type Context=Readonly<{params:Promise<Readonly<{path:readonly string[]}>>}>;
function missing(){return Response.json({code:'not_found'},{status:404,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
export async function handleDefaultAccountingGet(request:Request,context:Context){
  const {path}=await context.params;
  if(path.length===1&&path[0]==='collection-preview')return handlers.preview(request);
  if(path.length===1&&['overview','receivables','accounts','expenses','collection-accounts'].includes(path[0]!))return handlers.get(request,path[0] as AccountingReadArea);
  if(path.length===2){if(path[0]==='customers')return handlers.customer(request,path[1]);if(path[0]==='orders')return handlers.order(request,path[1]);if(path[0]==='operations')return handlers.operation(request,path[1]);}
  return missing();
}
export async function handleDefaultAccountingPost(request:Request,context:Context){const {path}=await context.params;const kind=path.length===1?MUTATIONS[path[0]!]:undefined;return kind?handlers.mutate(request,kind):missing();}
