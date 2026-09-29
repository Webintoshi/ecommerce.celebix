import 'server-only';
import type {TenantContext} from '@celebix/saas-contracts';
import type {ContentResearchRepository} from '../../../../packages/saas-data/src/content-research/types.ts';
import type {ServerPanelAccessRuntime} from '../server-panel-access/runtime.ts';
import {createContentResearchFetcher} from '../content-research/fetcher.ts';
import {contentResearchEnabled} from './flag.ts';
import {createContentResearchService,type ContentResearchService} from './service.ts';

type Approved=ServerPanelAccessRuntime&Readonly<{panelOrigin:string}>;
export type ServerContentResearchRuntime=Readonly<{access:Approved;service:ContentResearchService;enabled(tenant:TenantContext):boolean}>;
const runtimes=new WeakMap<ServerPanelAccessRuntime,ServerContentResearchRuntime>();
export function registerServerContentResearchRuntime(access:ServerPanelAccessRuntime,repository:ContentResearchRepository,fetcher:ReturnType<typeof createContentResearchFetcher>=createContentResearchFetcher()):ServerContentResearchRuntime{
 if(!access||access.readiness.mode!=='approved_staging'||!access.panelOrigin||runtimes.has(access)||!repository||['begin','claim','complete','fail','get'].some(method=>typeof repository[method as keyof ContentResearchRepository]!=='function'))throw Error('server_content_research_runtime_invalid');
 const service=createContentResearchService({repository,fetcher,now:()=>new Date()});
 const runtime=Object.freeze({access:access as Approved,service,enabled:(tenant:TenantContext)=>contentResearchEnabled(tenant.store.id)});
 runtimes.set(access,runtime);return runtime;
}
export function resolveServerContentResearchRuntime(access:ServerPanelAccessRuntime):ServerContentResearchRuntime|null{return access?.readiness.mode==='approved_staging'?runtimes.get(access)??null:null;}
