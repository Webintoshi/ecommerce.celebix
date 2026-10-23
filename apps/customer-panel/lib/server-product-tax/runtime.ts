import 'server-only';
import type {ProductTaxRepository,ProductTaxReadInput} from '../../../../packages/saas-data/src/product-tax/repository.ts';
import type {ServerPanelAccessRuntime} from '../server-panel-access/runtime.ts';
type Approved=ServerPanelAccessRuntime&Readonly<{readiness:Readonly<{mode:'approved_staging'}>;panelOrigin:string}>;
export type ServerProductTaxRuntime=Readonly<{access:Approved;repository:ProductTaxRepository}>;
const repositories=new WeakMap<ServerPanelAccessRuntime,ProductTaxRepository>();
export function registerServerProductTaxRepository(access:ServerPanelAccessRuntime,repository:ProductTaxRepository):void{
 if(access.readiness.mode!=='approved_staging'||!access.panelOrigin||repositories.has(access)||typeof repository?.read!=='function')throw Error('product_tax_runtime_invalid');
 repositories.set(access,Object.freeze({read:(input:ProductTaxReadInput)=>repository.read(input)}));
}
export function resolveServerProductTaxRuntime(access:ServerPanelAccessRuntime):ServerProductTaxRuntime|null{
 if(access.readiness.mode!=='approved_staging'||!access.panelOrigin)return null;const repository=repositories.get(access);return repository?Object.freeze({access:access as Approved,repository}):null;
}
