import 'server-only';
import {randomUUID} from 'node:crypto';
import {resolveDefaultServerPanelAccessRuntime} from '../server-panel-access/default.ts';
import {resolveServerInStoreSalesRuntime} from '../server-in-store-sales/runtime.ts';
import {createInStoreSalesHttpHandlers} from './handler.ts';
const handlers=createInStoreSalesHttpHandlers({resolveRuntime:async()=>resolveServerInStoreSalesRuntime(await resolveDefaultServerPanelAccessRuntime()),now:()=>new Date(),requestId:randomUUID});
type RouteContext=Readonly<{params:Promise<Readonly<Record<string,string>>>}>;
export const handleDefaultInStoreBootstrap=handlers.bootstrap;
export const handleDefaultInStoreProducts=handlers.searchProducts;
export const handleDefaultInStoreListSales=handlers.listSales;
export const handleDefaultInStoreCreateSale=handlers.createSale;
export const handleDefaultInStoreListStaff=handlers.listStaff;
export async function handleDefaultInStoreGetSale(request:Request,context:RouteContext){return handlers.getSale(request,(await context.params).saleId);}
export async function handleDefaultInStoreUpdateSale(request:Request,context:RouteContext){return handlers.updateSale(request,(await context.params).saleId);}
export async function handleDefaultInStoreHoldSale(request:Request,context:RouteContext){return handlers.holdSale(request,(await context.params).saleId);}
export async function handleDefaultInStorePrepareSale(request:Request,context:RouteContext){return handlers.prepareSale(request,(await context.params).saleId);}
export async function handleDefaultInStoreConfirmPayment(request:Request,context:RouteContext){return handlers.confirmPayment(request,(await context.params).saleId);}
export async function handleDefaultInStoreCompleteSale(request:Request,context:RouteContext){return handlers.completeSale(request,(await context.params).saleId);}
export async function handleDefaultInStoreCancelSale(request:Request,context:RouteContext){return handlers.cancelSale(request,(await context.params).saleId);}
export async function handleDefaultInStoreTakeoverSale(request:Request,context:RouteContext){return handlers.takeoverSale(request,(await context.params).saleId);}
export async function handleDefaultInStoreGetOperation(request:Request,context:RouteContext){return handlers.getOperation(request,(await context.params).operationId);}
export async function handleDefaultInStoreSetStaffGrant(request:Request,context:RouteContext){return handlers.setStaffGrant(request,(await context.params).membershipId);}
