import type {ServerPanelAccessRuntime} from '../server-panel-access/runtime.ts';
import type {PlatformCommerceRepository} from './repository.ts';
export type ServerPlatformCommerceRuntime=Readonly<{access:ServerPanelAccessRuntime&Readonly<{panelOrigin:string}>;commerce:PlatformCommerceRepository}>;
const repositories=new WeakMap<ServerPanelAccessRuntime,PlatformCommerceRepository>();
export function registerServerPlatformCommerceRepository(access:ServerPanelAccessRuntime,repository:PlatformCommerceRepository):void{
 if(access.readiness.mode!=='approved_staging'||!access.panelOrigin||repositories.has(access)||typeof repository?.createCheckout!=='function')throw TypeError('platform_commerce_runtime_invalid');
 repositories.set(access,Object.freeze({createCheckout:repository.createCheckout.bind(repository)}));
}
export function resolveServerPlatformCommerceRuntime(access:ServerPanelAccessRuntime):ServerPlatformCommerceRuntime|null{
 const commerce=repositories.get(access);return commerce&&access.readiness.mode==='approved_staging'&&access.panelOrigin?Object.freeze({access:access as ServerPlatformCommerceRuntime['access'],commerce}):null;
}
export function resolvePlatformCommerceRepository(access:ServerPanelAccessRuntime):PlatformCommerceRepository|undefined{return resolveServerPlatformCommerceRuntime(access)?.commerce;}
