import 'server-only';
import type { TenantContext, MerchantAdminRecord } from '@celebix/saas-contracts';
import type { ContentAuthoringRepository } from '../../../../packages/saas-data/src/content-authoring/types.ts';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';
import { resolveServerToshiProviderRuntime } from '../server-toshi-providers/runtime.ts';
import { resolveServerMerchantAdminRuntime } from '../server-merchant-admin/runtime.ts';
import { resolveServerCatalogOnboardingRuntime } from '../server-catalog-onboarding/runtime.ts';
import { createToshiGenerationRegistry } from '../toshi-generation/registry.ts';
import { buildProductFactPacket } from './facts.ts';
import { createContentAuthoringService, ContentAuthoringError, type ContentAuthoringService } from './service.ts';
export type ServerContentAuthoringRuntime=Readonly<{access:ServerPanelAccessRuntime & Readonly<{panelOrigin:string}>;service:ContentAuthoringService;enabled(tenant:TenantContext):boolean}>;
const RUNTIMES=new WeakMap<ServerPanelAccessRuntime,ServerContentAuthoringRuntime>();
export function contentAuthoringEnabled(storeId:string,env:Readonly<Record<string,string|undefined>>=process.env):boolean {return env.CONTENT_AUTHORING_ENABLED==='true'||(env.CONTENT_AUTHORING_ENABLED_STORE_IDS??'').split(',').map(s=>s.trim()).filter(s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s)).includes(storeId);}
export function registerServerContentAuthoringRuntime(access:ServerPanelAccessRuntime,repository:ContentAuthoringRepository):ServerContentAuthoringRuntime {
 const provider=resolveServerToshiProviderRuntime(access),catalog=resolveServerCatalogOnboardingRuntime(access),merchant=resolveServerMerchantAdminRuntime(access);if(!provider||!catalog||!merchant||RUNTIMES.has(access))throw Error('server_content_authoring_runtime_invalid');
 const service=createContentAuthoringService({async authorizeContentFields({tenantContext,now,fields}) {
  const settings=await merchant.merchantAdmin.list({tenantContext,now,kind:'ai_setting'});assertContentAuthoringPreferences(settings,fields);
 },repository,providers:provider.repository,keyring:()=>provider.keyring,generations:createToshiGenerationRegistry(),now:()=>new Date(),async loadFacts({tenantContext,now,request}){
  const base={tenantContext,now};const [options,editor]=await Promise.all([catalog.onboarding.getOptions(base),request.productId?catalog.onboarding.getProductEditor({...base,productId:request.productId}):Promise.resolve(null)]);
  if(editor&&(editor.product.id!==request.productId||editor.product.storeId!==tenantContext.store.id))throw new ContentAuthoringError('membership_denied');
  if(editor&&(editor.product.version!==request.productVersion||editor.profile.version!==request.profileVersion))throw new ContentAuthoringError('version_conflict');
  const ref=(kind:string,id:string)=>options.resources.find(r=>r.kind===kind&&r.id===id)??null;
  return buildProductFactPacket(editor?{id:editor.product.id,title:editor.product.title}:null,request.currentDraft,{category:id=>options.categories.find(c=>c.id===id)??null,brand:id=>ref('brand',id),attribute:id=>ref('attribute',id),variant:id=>editor?.variants.some(v=>v.variant.id===id)?{id,productId:editor.product.id}:null});
 }});
 const runtime=Object.freeze({access:provider.access,service,enabled:(tenant:TenantContext)=>contentAuthoringEnabled(tenant.store.id)});RUNTIMES.set(access,runtime);return runtime;
}
export function resolveServerContentAuthoringRuntime(access:ServerPanelAccessRuntime):ServerContentAuthoringRuntime|null {return access?.readiness.mode==='approved_staging'?RUNTIMES.get(access)??null:null;}

export function assertContentAuthoringPreferences(settings:readonly MerchantAdminRecord[],fields:readonly string[]):void {
 if(!settings.length)return;
 if(settings.length!==1||settings[0]!.kind!=='ai_setting')throw new ContentAuthoringError('unavailable');
 const setting=settings[0]!;const features=setting.config.enabledFeatures;
 if(!Array.isArray(features)||features.some(f=>!['description_suggestions','seo_suggestions','campaign_drafts'].includes(f as string))||new Set(features).size!==features.length)throw new ContentAuthoringError('unavailable');
 if(setting.status!=='active'||!features.some(f=>f==='description_suggestions'||f==='seo_suggestions')||fields.some(f=>!features.includes(f==='description'?'description_suggestions':'seo_suggestions')))throw new ContentAuthoringError('feature_unavailable');
}
