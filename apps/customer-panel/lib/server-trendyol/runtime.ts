import type {MerchantProviderCredentialKeyring} from '@celebix/saas-data';
import type {TrendyolRepository,TrendyolWorkflowRepository} from '../../../../packages/saas-data/src/trendyol/repository.ts';
import type {TrendyolProvider} from '../../../../packages/saas-data/src/trendyol/provider.ts';
import type {ServerPanelAccessRuntime} from '../server-panel-access/runtime.ts';
type Approved=ServerPanelAccessRuntime&Readonly<{readiness:Readonly<{mode:'approved_staging'}>;panelOrigin:string}>;
export type ServerTrendyolRuntime=Readonly<{access:Approved;repository:TrendyolRepository;workflow:TrendyolWorkflowRepository;keyring:MerchantProviderCredentialKeyring;provider:TrendyolProvider}>;
const runtimes=new WeakMap<ServerPanelAccessRuntime,ServerTrendyolRuntime>();
export function registerServerTrendyolRuntime(access:ServerPanelAccessRuntime,dependencies:Omit<ServerTrendyolRuntime,'access'>):void{
 if(access.readiness.mode!=='approved_staging'||!access.panelOrigin||runtimes.has(access))throw Error('trendyol_runtime_invalid');
 runtimes.set(access,Object.freeze({access:access as Approved,...dependencies}));
}
export function resolveServerTrendyolRuntime(access:ServerPanelAccessRuntime):ServerTrendyolRuntime|null{return runtimes.get(access)??null;}
