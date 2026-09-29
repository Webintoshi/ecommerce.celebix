import 'server-only';
import type{MerchantAdminRecord,TenantContext}from'@celebix/saas-contracts';
import{resolveDefaultServerPanelAccessRuntime}from'../server-panel-access/default.ts';
import{resolveServerMerchantAdminRuntime}from'../server-merchant-admin/runtime.ts';
const LOCALE=/^[a-z]{2,3}(?:-[A-Z]{2})?$/;
function invalid():never{throw new Error('content_locale_unavailable');}
/** Keep the new editor's locale identical to the public reader's exact active setting. */
export function selectInitialContentLocale(settings:readonly MerchantAdminRecord[]):string{
 const active=settings.filter(record=>record.kind==='language_setting'&&record.status==='active');
 if(!active.length)return'tr';if(active.length!==1)invalid();
 const config=active[0]!.config,selected=config.defaultLocale,enabled=config.enabledLocales;
 if(typeof selected!=='string'||selected.length>35||!LOCALE.test(selected)||!Array.isArray(enabled)||enabled.length<1||enabled.length>20||enabled.some(value=>typeof value!=='string'||value.length>35||!LOCALE.test(value))||new Set(enabled).size!==enabled.length||!enabled.includes(selected))invalid();
 return selected;
}
export async function resolveInitialContentLocale(tenantContext:TenantContext):Promise<string>{
 const access=await resolveDefaultServerPanelAccessRuntime(),runtime=resolveServerMerchantAdminRuntime(access);
 if(!runtime)invalid();
 return selectInitialContentLocale(await runtime.merchantAdmin.list({tenantContext,now:new Date(),kind:'language_setting'}));
}
