import type {CommercialPlanRepository} from '@celebix/saas-data';
import type {ServerPanelAccessRuntime} from '../server-panel-access/runtime.ts';
export type ServerCommercialPlanRuntime=Readonly<{access:ServerPanelAccessRuntime&Readonly<{panelOrigin:string}>;plans:CommercialPlanRepository}>;
const repositories=new WeakMap<ServerPanelAccessRuntime,CommercialPlanRepository>();
export function registerServerCommercialPlanRepository(access:ServerPanelAccessRuntime,plans:CommercialPlanRepository):void{
 if(access.readiness.mode!=='approved_staging'||!access.panelOrigin||repositories.has(access)||typeof plans.read!=='function'||typeof plans.request!=='function')throw TypeError('commercial_plan_runtime_invalid');
 repositories.set(access,Object.freeze({read:plans.read.bind(plans),request:plans.request.bind(plans)}));
}
export function resolveServerCommercialPlanRuntime(access:ServerPanelAccessRuntime):ServerCommercialPlanRuntime|null{
 const plans=repositories.get(access);return plans&&access.readiness.mode==='approved_staging'&&access.panelOrigin?Object.freeze({access:access as ServerCommercialPlanRuntime['access'],plans}):null;
}
