import type {AccountingRepository} from '@celebix/saas-data';
import type {ServerPanelAccessRuntime} from '../server-panel-access/runtime.ts';
export type ServerAccountingRuntime=Readonly<{access:ServerPanelAccessRuntime&Readonly<{panelOrigin:string}>;accounting:AccountingRepository}>;
const repositories=new WeakMap<ServerPanelAccessRuntime,AccountingRepository>();
const METHODS=['overview','receivables','customerAccount','orderFinance','previewCollection','collectionAccounts','accounts','expenses','collect','openingDebt','saveAccount','openBalance','expense','transfer','settleCard','reverse','returnCredit','refund','operation'] as const;
export function registerServerAccountingRepository(access:ServerPanelAccessRuntime,repository:AccountingRepository):void{
  if(!access||access.readiness.mode!=='approved_staging'||!access.panelOrigin||repositories.has(access)||!repository||METHODS.some(method=>typeof repository[method]!=='function'))throw Error('server_accounting_runtime_invalid');
  repositories.set(access,Object.freeze(Object.fromEntries(METHODS.map(method=>[method,repository[method].bind(repository)]))) as unknown as AccountingRepository);
}
export function resolveServerAccountingRuntime(access:ServerPanelAccessRuntime):ServerAccountingRuntime|null{
  if(!access||access.readiness.mode!=='approved_staging'||!access.panelOrigin)return null;
  const accounting=repositories.get(access);return accounting?Object.freeze({access:access as ServerAccountingRuntime['access'],accounting}):null;
}
