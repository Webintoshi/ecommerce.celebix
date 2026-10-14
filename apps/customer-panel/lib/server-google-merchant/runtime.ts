import type {GoogleMerchantRepository} from '@celebix/saas-data';
import type {ServerPanelAccessRuntime} from '../server-panel-access/runtime.ts';
type Approved=ServerPanelAccessRuntime&Readonly<{readiness:Readonly<{mode:'approved_staging'}>;panelOrigin:string}>;
export type ServerGoogleMerchantRuntime=Readonly<{access:Approved;merchant:GoogleMerchantRepository}>;
const repositories=new WeakMap<ServerPanelAccessRuntime,GoogleMerchantRepository>();
export function registerServerGoogleMerchantRepository(access:ServerPanelAccessRuntime,repository:GoogleMerchantRepository):void {
 if(access.readiness.mode!=='approved_staging'||!access.panelOrigin||repositories.has(access))throw Error('server_google_merchant_runtime_invalid');
 repositories.set(access,repository);
}
export function resolveServerGoogleMerchantRuntime(access:ServerPanelAccessRuntime):ServerGoogleMerchantRuntime|null {
 const merchant=repositories.get(access);return access.readiness.mode==='approved_staging'&&access.panelOrigin&&merchant?{access:access as Approved,merchant}:null;
}
