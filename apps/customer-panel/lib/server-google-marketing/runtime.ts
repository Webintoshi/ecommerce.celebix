import type { GoogleMarketingRepository } from '@celebix/saas-data';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';

type Approved = ServerPanelAccessRuntime & Readonly<{readiness:Readonly<{mode:'approved_staging'}>;panelOrigin:string}>;
export type ServerGoogleMarketingRuntime = Readonly<{access:Approved;google:GoogleMarketingRepository}>;
const repositories = new WeakMap<ServerPanelAccessRuntime, GoogleMarketingRepository>();
const METHODS = ['overview','begin','resolveOAuthReturn','complete','resources','apply','disconnect','publicProjection'] as const;
export function registerServerGoogleMarketingRepository(access:ServerPanelAccessRuntime,repository:GoogleMarketingRepository):void {
  if(access.readiness.mode!=='approved_staging'||!access.panelOrigin||repositories.has(access)||METHODS.some(method=>typeof repository[method]!=='function'))throw Error('server_google_marketing_runtime_invalid');
  repositories.set(access,Object.freeze(Object.fromEntries(METHODS.map(method=>[method,repository[method].bind(repository)]))) as unknown as GoogleMarketingRepository);
}
export function resolveServerGoogleMarketingRuntime(access:ServerPanelAccessRuntime):ServerGoogleMarketingRuntime|null {
  const google=repositories.get(access);
  return access.readiness.mode==='approved_staging'&&access.panelOrigin&&google?Object.freeze({access:access as Approved,google}):null;
}
