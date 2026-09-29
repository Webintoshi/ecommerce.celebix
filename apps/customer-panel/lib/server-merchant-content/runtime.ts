import type{MerchantContentRepository}from'@celebix/saas-data';
import type{ServerPanelAccessRuntime}from'../server-panel-access/runtime.ts';
type Approved=ServerPanelAccessRuntime&Readonly<{readiness:Readonly<{mode:'approved_staging'}>;panelOrigin:string}>;
export type ServerMerchantContentRuntime=Readonly<{access:Approved;merchantContent:MerchantContentRepository}>;
const repositories=new WeakMap<ServerPanelAccessRuntime,MerchantContentRepository>();
const METHODS=['get','save','listVersions','recoverOperation'] as const;
function invalid():never{throw new Error('server_merchant_content_runtime_invalid');}
function facade(repository:MerchantContentRepository):MerchantContentRepository{if(!repository||METHODS.some(method=>typeof repository[method]!=='function'))invalid();return Object.freeze(Object.fromEntries(METHODS.map(method=>[method,repository[method].bind(repository)]))as unknown as MerchantContentRepository);}
export function registerServerMerchantContentRepository(access:ServerPanelAccessRuntime,repository:MerchantContentRepository){try{if(!access||access.readiness.mode!=='approved_staging'||access.panelOrigin===null||repositories.has(access))invalid();repositories.set(access,facade(repository));}catch{invalid();}}
export function resolveServerMerchantContentRuntime(access:ServerPanelAccessRuntime):ServerMerchantContentRuntime|null{try{if(!access||access.readiness.mode!=='approved_staging'||access.panelOrigin===null)return null;const merchantContent=repositories.get(access);return merchantContent?Object.freeze({access:access as Approved,merchantContent}):null;}catch{return null;}}
