import 'server-only';
import type{MerchantAdminRecord,TenantContext}from'@celebix/saas-contracts';
import type{ContentResourceAuthoringRepository}from'../../../../packages/saas-data/src/content-resource-authoring/types.ts';
import type{ServerPanelAccessRuntime}from'../server-panel-access/runtime.ts';
import{resolveServerToshiProviderRuntime}from'../server-toshi-providers/runtime.ts';
import{resolveServerMerchantAdminRuntime}from'../server-merchant-admin/runtime.ts';
import{resolveServerMerchantContentRuntime}from'../server-merchant-content/runtime.ts';
import{createToshiGenerationRegistry}from'../toshi-generation/registry.ts';
import{createContentResourceAuthoringService,ContentResourceAuthoringError,type ContentResourceAuthoringService}from'./service.ts';
export{contentResearchEnabled}from'../server-content-research/flag.ts';

type ResearchReader=Parameters<typeof createContentResourceAuthoringService>[0]['researchRepository'];
export type ServerContentResourceAuthoringRuntime=Readonly<{access:ServerPanelAccessRuntime&Readonly<{panelOrigin:string}>;service:ContentResourceAuthoringService;enabled(tenant:TenantContext):boolean}>;
const runtimes=new WeakMap<ServerPanelAccessRuntime,ServerContentResourceAuthoringRuntime>();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function contentResourceAuthoringEnabled(storeId:string,env:Readonly<Record<string,string|undefined>>=process.env){return env.CONTENT_RESOURCE_AUTHORING_ENABLED==='true'||(env.CONTENT_RESOURCE_AUTHORING_ENABLED_STORE_IDS??'').split(',').map(x=>x.trim()).filter(x=>UUID.test(x)).includes(storeId);}
export function assertContentResourcePreferences(settings:readonly MerchantAdminRecord[],fields:readonly string[]){
 if(!settings.length)return;
 if(settings.length!==1||settings[0]!.kind!=='ai_setting')throw new ContentResourceAuthoringError('unavailable');
 const setting=settings[0]!,features=setting.config.enabledFeatures;
 if(!Array.isArray(features)||features.some(f=>!['description_suggestions','seo_suggestions','campaign_drafts'].includes(f as string))||new Set(features).size!==features.length)throw new ContentResourceAuthoringError('unavailable');
 if(setting.status!=='active'||fields.some(field=>!features.includes(['seoTitle','seoDescription'].includes(field)?'seo_suggestions':'description_suggestions')))throw new ContentResourceAuthoringError('feature_not_enabled');
}
/** Research wiring is injected after its private evidence repository is installed. */
export function registerServerContentResourceAuthoringRuntime(access:ServerPanelAccessRuntime,repository:ContentResourceAuthoringRepository,researchRepository?:ResearchReader):ServerContentResourceAuthoringRuntime{
 const provider=resolveServerToshiProviderRuntime(access),merchant=resolveServerMerchantAdminRuntime(access),content=resolveServerMerchantContentRuntime(access);
 if(!provider||!merchant||!content||runtimes.has(access))throw Error('server_content_resource_runtime_invalid');
 const service=createContentResourceAuthoringService({repository,contentRepository:content.merchantContent,researchRepository:researchRepository??{async get(){throw new ContentResourceAuthoringError('unavailable');}},providers:provider.repository,keyring:()=>provider.keyring,generations:createToshiGenerationRegistry(),now:()=>new Date(),async authorizePreferences({tenantContext,now,request}){
  const settings=await merchant.merchantAdmin.list({tenantContext,now,kind:'ai_setting'});
  assertContentResourcePreferences(settings,request.stage==='outline'?['body']:request.fields);
 }});
 const runtime=Object.freeze({access:provider.access,service,enabled:(tenant:TenantContext)=>contentResourceAuthoringEnabled(tenant.store.id)});
 runtimes.set(access,runtime);return runtime;
}
export function resolveServerContentResourceAuthoringRuntime(access:ServerPanelAccessRuntime):ServerContentResourceAuthoringRuntime|null{return access?.readiness.mode==='approved_staging'?runtimes.get(access)??null:null;}
