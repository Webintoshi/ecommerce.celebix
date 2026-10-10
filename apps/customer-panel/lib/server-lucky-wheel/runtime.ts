import type { PostgresLuckyWheelAdminRepository } from '@celebix/saas-data';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';
import { resolveServerCatalogAdminRuntime, type ServerCatalogAdminRuntime } from '../server-catalog-admin/runtime.ts';
export type LuckyWheelAdminRepository=Pick<PostgresLuckyWheelAdminRepository,'list'|'save'|'deleteCampaign'|'history'|'revokeCoupons'|'managedPromotions'>;
export type ServerLuckyWheelRuntime=ServerCatalogAdminRuntime & Readonly<{luckyWheel:LuckyWheelAdminRepository}>;
const METHODS=['list','save','deleteCampaign','history','revokeCoupons','managedPromotions'] as const;
const repositories=new WeakMap<ServerPanelAccessRuntime,LuckyWheelAdminRepository>();
export function registerServerLuckyWheelRepository(access:ServerPanelAccessRuntime,repository:LuckyWheelAdminRepository):void {
 if(access.readiness.mode!=='approved_staging'||access.panelOrigin===null||repositories.has(access)||METHODS.some(method=>typeof repository?.[method]!=='function'))throw new Error('lucky_wheel_runtime_invalid');
 repositories.set(access,Object.freeze(Object.fromEntries(METHODS.map(method=>[method,repository[method].bind(repository)])) as unknown as LuckyWheelAdminRepository));
}
export function resolveServerLuckyWheelRuntime(access:ServerPanelAccessRuntime):ServerLuckyWheelRuntime|null {
 const catalog=resolveServerCatalogAdminRuntime(access),luckyWheel=repositories.get(access);
 return catalog&&luckyWheel?Object.freeze({...catalog,luckyWheel}):null;
}
