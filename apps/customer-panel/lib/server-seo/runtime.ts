import type { SeoRepository } from '@celebix/saas-data';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';

type Approved = ServerPanelAccessRuntime & Readonly<{readiness: Readonly<{mode:'approved_staging'}>; panelOrigin:string}>;
export type ServerSeoRuntime = Readonly<{access:Approved; seo:SeoRepository}>;
const repositories = new WeakMap<ServerPanelAccessRuntime, SeoRepository>();
const METHODS = ['overview','resources','saveResource','settings','saveSettings','links','saveLink','notifications','notify','startCheck'] as const;
export function registerServerSeoRepository(access:ServerPanelAccessRuntime, repository:SeoRepository):void {
  if(access.readiness.mode!=='approved_staging'||!access.panelOrigin||repositories.has(access)||METHODS.some(method=>typeof repository[method]!=='function'))throw Error('server_seo_runtime_invalid');
  repositories.set(access,Object.freeze(Object.fromEntries(METHODS.map(method=>[method,repository[method].bind(repository)]))) as unknown as SeoRepository);
}
export function resolveServerSeoRuntime(access:ServerPanelAccessRuntime):ServerSeoRuntime|null {
  const seo = repositories.get(access);
  return access.readiness.mode==='approved_staging'&&access.panelOrigin&&seo?Object.freeze({access:access as Approved,seo}):null;
}
