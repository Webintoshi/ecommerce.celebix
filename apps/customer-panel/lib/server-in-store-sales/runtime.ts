import type {InStoreSalesRepository} from '@celebix/saas-data';
import type {ServerPanelAccessRuntime} from '../server-panel-access/runtime.ts';
export type ServerInStoreSalesRuntime=Readonly<{access:ServerPanelAccessRuntime & Readonly<{panelOrigin:string}>;sales:InStoreSalesRepository}>;
const repositories=new WeakMap<ServerPanelAccessRuntime,InStoreSalesRepository>();
const methods=['bootstrap','searchProducts','listSales','getSale','getOperation','createSale','updateSale','holdSale','prepareSale','confirmPayment','completeSale','cancelSale','takeoverSale','listStaff','setStaffGrant'] as const;
export function registerServerInStoreSalesRepository(access:ServerPanelAccessRuntime,repository:InStoreSalesRepository):void {
  if(!access||access.readiness.mode!=='approved_staging'||access.panelOrigin===null||repositories.has(access)||!repository||methods.some(method=>typeof repository[method]!=='function'))throw new Error('server_in_store_sales_runtime_invalid');
  repositories.set(access,Object.freeze(Object.fromEntries(methods.map(method=>[method,repository[method].bind(repository)]))) as unknown as InStoreSalesRepository);
}
export function resolveServerInStoreSalesRuntime(access:ServerPanelAccessRuntime):ServerInStoreSalesRuntime|null {
  if(!access||access.readiness.mode!=='approved_staging'||access.panelOrigin===null)return null;
  const sales=repositories.get(access);return sales?Object.freeze({access:access as ServerInStoreSalesRuntime['access'],sales}):null;
}
