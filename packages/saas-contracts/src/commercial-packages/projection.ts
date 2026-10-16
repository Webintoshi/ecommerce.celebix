import {COMMERCIAL_PACKAGES} from './catalog.ts';

export interface CommercialUpgradeRequest {
 readonly requestId:string; readonly storeId:string; readonly planId:string;
 readonly status:'pending'|'applied'; readonly createdAt:string; readonly replayed?:boolean;
}
export interface CommercialPlanOverview {
 readonly plan:Readonly<{planId:string;planCode:string;version:number}>;
 readonly usage:Readonly<{products:number;variants:number;staff:number;storageBytes:number;monthlyOrders:number;customDomains:number}>;
 readonly request?:CommercialUpgradeRequest;
}
export interface CommercialUpgradeIntent {readonly planId:string;readonly operationId:string}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function invalid():never{throw new TypeError('commercial_plan_invalid');}
function object(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();
 const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)invalid();
 const descriptors=Object.getOwnPropertyDescriptors(value),allowed=new Set([...required,...optional]);
 if(required.some(key=>!Object.hasOwn(descriptors,key))||Object.keys(descriptors).some(key=>!allowed.has(key)||!Object.hasOwn(descriptors[key]!,'value')))invalid();
 return value as Record<string,unknown>;
}
export function commercialUuid(value:unknown):string{if(typeof value!=='string'||!UUID.test(value))invalid();return value;}
function integer(value:unknown,min=0):number{if(!Number.isSafeInteger(value)||(value as number)<min)invalid();return value as number;}
export function parseCommercialUpgradeRequest(value:unknown):CommercialUpgradeRequest{
 const row=object(value,['requestId','storeId','planId','status','createdAt'],['replayed']);
 if(row.status!=='pending'&&row.status!=='applied')invalid();
 if(typeof row.createdAt!=='string'||row.createdAt.length>40||!/^\d{4}-\d{2}-\d{2}T/.test(row.createdAt)||!Number.isFinite(Date.parse(row.createdAt)))invalid();
 if(Object.hasOwn(row,'replayed')&&typeof row.replayed!=='boolean')invalid();
 const planId=commercialUuid(row.planId);if(!COMMERCIAL_PACKAGES.some(plan=>plan.id===planId))invalid();
 return Object.freeze({requestId:commercialUuid(row.requestId),storeId:commercialUuid(row.storeId),planId,status:row.status,createdAt:row.createdAt,...Object.hasOwn(row,'replayed')?{replayed:row.replayed as boolean}:{}});
}
export function parseCommercialPlanOverview(value:unknown):CommercialPlanOverview{
 const row=object(value,['plan','usage'],['request']),plan=object(row.plan,['planId','planCode','version']);
 if(typeof plan.planCode!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(plan.planCode))invalid();
 const usage=object(row.usage,['products','variants','staff','storageBytes','monthlyOrders','customDomains']);
 return Object.freeze({plan:Object.freeze({planId:commercialUuid(plan.planId),planCode:plan.planCode,version:integer(plan.version,1)}),usage:Object.freeze({products:integer(usage.products),variants:integer(usage.variants),staff:integer(usage.staff),storageBytes:integer(usage.storageBytes),monthlyOrders:integer(usage.monthlyOrders),customDomains:integer(usage.customDomains)}),...Object.hasOwn(row,'request')?{request:parseCommercialUpgradeRequest(row.request)}:{}});
}
export function parseCommercialUpgradeIntent(value:unknown):CommercialUpgradeIntent{
 const row=object(value,['planId','operationId']),planId=commercialUuid(row.planId);
 if(!COMMERCIAL_PACKAGES.some(plan=>plan.id===planId))invalid();
 return Object.freeze({planId,operationId:commercialUuid(row.operationId)});
}
