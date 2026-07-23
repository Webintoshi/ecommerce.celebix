import assert from"node:assert/strict";import{spawnSync}from"node:child_process";import test from"node:test";import{readFile}from"node:fs/promises";import ts from"typescript";const root=new URL("../",import.meta.url);async function source(path:string){return readFile(new URL(path,root),"utf8")}
const routes=Object.freeze([
 ["app/discounts/page.tsx","discount"],["app/discounts/new/page.tsx","discount"],["app/discounts/lucky-wheel/page.tsx","lucky_wheel"],
 ["app/marketing/page.tsx","MerchantMarketingOverview"],["app/marketing/email/page.tsx","email_campaign"],["app/marketing/phone/page.tsx","phone_campaign"],["app/marketing/whatsapp/page.tsx","whatsapp_campaign"],
 ["app/content/blog/page.tsx","blog_post"],["app/content/pages/page.tsx","page"],["app/content/policies/page.tsx","policy"],["app/marketplaces/page.tsx","marketplace_connection"],
 ["app/settings/general/page.tsx","general_setting"],["app/settings/language/page.tsx","language_setting"],["app/settings/payment/page.tsx","payment_setting"],["app/settings/shipping/page.tsx","shipping_setting"],["app/settings/administrators/page.tsx","administrator_invite"],
 ["app/accounting/page.tsx","accounting_profile"],["app/accounting/invoicing-integration/page.tsx","invoice_integration"],["app/seo/page.tsx","seo_control"],["app/seo/sitemap/page.tsx","sitemap"],["app/seo/social-preview/page.tsx","social_preview"],["app/seo/code-integrations/page.tsx","code_integration"],["app/seo/fast-indexing/page.tsx","indexing_request"],
]as const);
test("every donor merchant module route is real and server-authorized",async()=>{for(const[path,kind]of routes){const value=await source(path);assert.match(value,/requireServerPanelAccess/);assert.match(value,new RegExp(kind));assert.match(value,/isMerchantActionAllowed/)}});
test("shared console has truthful durable states, audit, archive and no fake provider send",async()=>{const value=await source("components/merchant-admin/MerchantModuleConsole.tsx");assert.match(value,/merchantAdminApi\.records/);assert.match(value,/merchantAdminApi\.events/);assert.match(value,/merchantAdminApi\.save/);assert.match(value,/merchantAdminApi\.archive/);assert.match(value,/Yükleniyor|yükleniyor/);assert.match(value,/Henüz/);assert.match(value,/role="alert"/);assert.doesNotMatch(value,/sendEmail|sendWhatsapp|sendSms|Math\.random|fake|mock/i)});
test("merchant console never accepts browser tenant or provider secret authority",async()=>{const value=(await Promise.all(["components/merchant-admin/MerchantModuleConsole.tsx","lib/merchant-admin-ui/client.ts"].map(source))).join("\n");assert.doesNotMatch(value,/x-store-id|x-tenant-id|localStorage|sessionStorage|supabase|\/api\/admin|apiSecret|clientSecret|accessToken/)});
test("marketing overview derives all channel counts from durable APIs",async()=>{const value=await source("components/merchant-admin/MerchantMarketingOverview.tsx");for(const kind of["email_campaign","phone_campaign","whatsapp_campaign"])assert.match(value,new RegExp(`merchantAdminApi\\.records\\(\\"${kind}\\"\\)`));assert.doesNotMatch(value,/Math\.random|mock|fake/i)});
test("approved merchant record subpages are server-authorized and keep fixed kinds",async()=>{for(const[path,kind,permission]of[
 ["app/discounts/[recordId]/edit/page.tsx","discount","promotions.manage"],
 ["app/content/blog/new/page.tsx","blog_post","content.manage"],["app/content/blog/[recordId]/edit/page.tsx","blog_post","content.manage"],
 ["app/content/pages/new/page.tsx","page","content.manage"],["app/content/pages/[recordId]/edit/page.tsx","page","content.manage"],
 ["app/content/policies/new/page.tsx","policy","content.manage"],["app/content/policies/[recordId]/edit/page.tsx","policy","content.manage"],
 ["app/settings/payment/new/page.tsx","payment_setting","configuration.manage"],["app/settings/payment/[recordId]/edit/page.tsx","payment_setting","configuration.manage"],
]as const){const value=await source(path);assert.match(value,/requireServerPanelAccess\(\)/);assert.match(value,new RegExp(`kind=\\"${kind}\\"`));assert.match(value,new RegExp(permission.replace(".","\\.")));assert.doesNotMatch(value,/searchParams|x-store-id|x-tenant-id|localStorage|sessionStorage/)} });

test("typed storefront settings render closed enum, local datetime roundtrip, and bounded announcement-list controls",async()=>{
  const value=await source("components/merchant-admin/MerchantModuleConsole.tsx");
  for(const evidence of["field.type === \"enum\"","field.type === \"datetime\"","field.type === \"string-list\"","field.allowedValues","field.optionLabels","datetime-local","getFullYear","new Date(raw)","timestamp.toISOString","invalid_enum_value","invalid_string_list","activeSubmissionRef","loadVersionRef"])assert.match(value,new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.doesNotMatch(value,/localStorage|sessionStorage|document[.]cookie|apiSecret|clientSecret|accessToken/);
});

test("datetime-local and announcement parsing keep local wall time and reject a thirteenth item",async()=>{
  const value=await source("components/merchant-admin/MerchantModuleConsole.tsx");
  const dateStart=value.indexOf("function dateTimeInputSnapshot");const dateEnd=value.indexOf("\n}\n\nfunction parseFormConfig",dateStart)+2;
  const parseStart=value.indexOf("function parseFormConfig");const parseEnd=value.indexOf("\n}\n\nfunction statusPresentation",parseStart)+2;
  const program=ts.transpileModule(`${value.slice(dateStart,dateEnd)}\n${value.slice(parseStart,parseEnd)}\nconst fields=[{key:"items",type:"string-list"},{key:"startsAt",type:"datetime"}];const original="2026-11-01T06:30:00.123Z";const data=new FormData();data.set("items",Array.from({length:12},(_,index)=>\` item-${"${"}index+1} \`).join("\\n"));data.set("startsAt","2026-11-01T01:30:00.123");console.log(JSON.stringify({local:dateTimeInputValue({config:{startsAt:original}},"startsAt"),parsed:parseFormConfig(fields,data,{startsAt:original})}));const tooMany=new FormData();tooMany.set("items",Array.from({length:13},(_,index)=>\`item-${"${"}index+1}\`).join("\\n"));try{parseFormConfig([{key:"items",type:"string-list"}],tooMany)}catch(error){console.log(error.message)}` ,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const result=spawnSync(process.execPath,["-e",program],{encoding:"utf8",env:{...process.env,TZ:"America/New_York"}});
  assert.equal(result.status,0,result.stderr);
  const [payload,rejection]=result.stdout.trim().split("\n");
  assert.equal(JSON.parse(payload!).local,"2026-11-01T01:30:00.123");
  assert.equal(JSON.parse(payload!).parsed.startsAt,"2026-11-01T06:30:00.123Z");
  assert.equal(JSON.parse(payload!).parsed.items.length,12);
  assert.equal(rejection,"invalid_string_list");
});

test("announcement validation exposes a fixed Turkish 1-to-12 message",async()=>{
  const value=await source("components/merchant-admin/MerchantModuleConsole.tsx");
  assert.match(value,/1 ile 12 arasında/);
  assert.match(value,/setError\(formErrorMessage\(caught\)\)/);
});
