import type { NativeMarketingAdminRepository } from '@celebix/saas-data';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';

export type ServerNativeMarketingRuntime = Readonly<{
  access: ServerPanelAccessRuntime & {readonly panelOrigin:string};
  email: NativeMarketingAdminRepository;
  senderEmail: string;
  publicOrigin: string;
}>;
const repositories = new WeakMap<ServerPanelAccessRuntime,ServerNativeMarketingRuntime>();
const METHODS=['overview','products','preview','saveSettings','saveTemplate','queueCampaign','testCampaign','cancelCampaign'] as const;
const DOMAIN=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function nativeMarketingPublicConfiguration(source:Readonly<Record<string,string|undefined>>):Readonly<{senderEmail:string;publicOrigin:string}>|null {
  if(source.CELEBIX_NATIVE_MARKETING_ENABLED!=='true')return null;
  const senderEmail=source.CELEBIX_MARKETING_EMAIL_FROM,publicOrigin=source.CELEBIX_MARKETING_EMAIL_PUBLIC_ORIGIN;
  if(!senderEmail||senderEmail.length>254||!senderEmail.startsWith('noreply@')||!DOMAIN.test(senderEmail.slice(8))||!publicOrigin)return null;
  try {const u=new URL(publicOrigin);if(u.protocol!=='https:'||u.origin!==publicOrigin||u.username||u.password||u.port||!DOMAIN.test(u.hostname))return null;}
  catch{return null;}
  return Object.freeze({senderEmail,publicOrigin});
}

export function registerServerNativeMarketingRepository(access:ServerPanelAccessRuntime,email:NativeMarketingAdminRepository,configuration:Readonly<{senderEmail:string;publicOrigin:string}>):void {
  if(access.readiness.mode!=='approved_staging'||!access.panelOrigin||repositories.has(access)||METHODS.some(m=>typeof email[m]!=='function'))throw Error('native_marketing_runtime_invalid');
  const parsed=nativeMarketingPublicConfiguration({CELEBIX_NATIVE_MARKETING_ENABLED:'true',CELEBIX_MARKETING_EMAIL_FROM:configuration.senderEmail,CELEBIX_MARKETING_EMAIL_PUBLIC_ORIGIN:configuration.publicOrigin});
  if(!parsed)throw Error('native_marketing_runtime_invalid');
  const bound=Object.freeze(Object.fromEntries(METHODS.map(m=>[m,email[m].bind(email)]))) as unknown as NativeMarketingAdminRepository;
  repositories.set(access,Object.freeze({access:access as ServerNativeMarketingRuntime['access'],email:bound,...parsed}));
}
export function resolveServerNativeMarketingRuntime(access:ServerPanelAccessRuntime):ServerNativeMarketingRuntime|null {
  return access.readiness.mode==='approved_staging'&&access.panelOrigin?repositories.get(access)??null:null;
}
