import 'server-only';
import type {LoyaltyRepository} from '@celebix/saas-data';
import type {ServerPanelAccessRuntime} from '../server-panel-access/runtime.ts';
export type ServerLoyaltyRuntime=Readonly<{access:ServerPanelAccessRuntime&Readonly<{panelOrigin:string}>;loyalty:LoyaltyRepository}>;
const repositories=new WeakMap<ServerPanelAccessRuntime,LoyaltyRepository>();
export function registerServerLoyaltyRepository(access:ServerPanelAccessRuntime,repository:LoyaltyRepository):void{
 if(!access||access.readiness.mode!=='approved_staging'||access.panelOrigin===null||repositories.has(access)||typeof repository?.command!=='function'||typeof repository?.recover!=='function')throw new Error('server_loyalty_runtime_invalid');
 repositories.set(access,Object.freeze({command:repository.command.bind(repository),recover:repository.recover.bind(repository)}));
}
export function resolveServerLoyaltyRuntime(access:ServerPanelAccessRuntime):ServerLoyaltyRuntime|null{
 if(!access||access.readiness.mode!=='approved_staging'||access.panelOrigin===null)return null;const loyalty=repositories.get(access);return loyalty?Object.freeze({access:access as ServerLoyaltyRuntime['access'],loyalty}):null;
}
