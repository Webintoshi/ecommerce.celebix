import assert from"node:assert/strict";import{spawnSync}from"node:child_process";import test from"node:test";import{readFile}from"node:fs/promises";import ts from"typescript";const root=new URL("../",import.meta.url);async function source(path:string){return readFile(new URL(path,root),"utf8")}
const routes=Object.freeze([
 ["app/discounts/page.tsx","discount"],["app/discounts/new/page.tsx","discount"],["app/discounts/lucky-wheel/page.tsx","lucky_wheel"],
 ["app/marketing/page.tsx","MerchantMarketingOverview"],["app/marketing/email/page.tsx","email_campaign"],["app/marketing/phone/page.tsx","phone_campaign"],["app/marketing/whatsapp/page.tsx","whatsapp_campaign"],
 ["app/content/blog/page.tsx","blog_post"],["app/content/pages/page.tsx","page"],["app/content/policies/page.tsx","policy"],["app/marketplaces/page.tsx","marketplace_connection"],
 ["app/settings/general/page.tsx","general_setting"],["app/settings/theme/page.tsx","theme_setting"],["app/settings/language/page.tsx","language_setting"],["app/settings/shipping/page.tsx","shipping_setting"],["app/settings/administrators/page.tsx","administrator_invite"],
 ["app/accounting/page.tsx","accounting_profile"],["app/accounting/invoicing-integration/page.tsx","invoice_integration"],["app/seo/page.tsx","seo_control"],["app/seo/sitemap/page.tsx","sitemap"],["app/seo/social-preview/page.tsx","social_preview"],["app/seo/code-integrations/page.tsx","code_integration"],["app/seo/fast-indexing/page.tsx","indexing_request"],
]as const);
test("every donor merchant module route is real and server-authorized",async()=>{for(const[path,kind]of routes){const value=await source(path);assert.match(value,/requireServerPanelAccess/);assert.match(value,new RegExp(kind));assert.match(value,/isMerchantActionAllowed/)}});
test("shared console has truthful durable states, audit, archive and no fake provider send",async()=>{const value=await source("components/merchant-admin/MerchantModuleConsole.tsx");assert.match(value,/merchantAdminApi\.records/);assert.match(value,/merchantAdminApi\.events/);assert.match(value,/merchantAdminApi\.save/);assert.match(value,/merchantAdminApi\.archive/);assert.match(value,/Yükleniyor|yükleniyor/);assert.match(value,/Henüz/);assert.match(value,/role="alert"/);assert.doesNotMatch(value,/sendEmail|sendWhatsapp|sendSms|Math\.random|fake|mock/i)});
test("starter presentation singleton modules edit the durable winner instead of offering duplicate active records",async()=>{const value=await source("components/merchant-admin/MerchantModuleConsole.tsx");assert.match(value,/isSingletonMerchantModule/);assert.match(value,/selectSingletonEditorRecord/);assert.match(value,/Vitrinde etkin/);assert.match(value,/Yerine yeni kayıt geçti/);assert.match(value,/Ayarı düzenle/)});
test("merchant console never accepts browser tenant or provider secret authority",async()=>{const value=(await Promise.all(["components/merchant-admin/MerchantModuleConsole.tsx","lib/merchant-admin-ui/client.ts"].map(source))).join("\n");assert.doesNotMatch(value,/x-store-id|x-tenant-id|localStorage|sessionStorage|supabase|\/api\/admin|apiSecret|clientSecret|accessToken/)});
test("production merchant records retain all five headers without shared three-column sizing",async()=>{
  const [consoleSource,shellCss]=await Promise.all([
    source("components/merchant-admin/MerchantModuleConsole.tsx"),
    source("components/panel/panel-shell.module.css"),
  ]);
  assert.match(consoleSource,/<thead><tr><th>Ad<\/th><th>Durum<\/th><th>Yapılandırma<\/th><th>Güncelleme<\/th><th><span[^>]*>İşlemler<\/span><\/th><\/tr><\/thead>/);
  assert.doesNotMatch(shellCss,/table-layout:\s*fixed/);
  assert.doesNotMatch(shellCss,/\.tableScroll\s+(?:th|td):nth-child\(/);
  for(const declaration of[/text-align:\s*left/,/vertical-align:\s*top/,/overflow-wrap:\s*anywhere/,/padding:\s*0\.5rem/])assert.match(shellCss,declaration);
});
test("marketing overview derives all channel counts from durable APIs",async()=>{const value=await source("components/merchant-admin/MerchantMarketingOverview.tsx");for(const kind of["email_campaign","phone_campaign","whatsapp_campaign"])assert.match(value,new RegExp(`merchantAdminApi\\.records\\(\\"${kind}\\"\\)`));assert.doesNotMatch(value,/Math\.random|mock|fake/i)});
test("approved merchant record subpages are server-authorized and keep fixed kinds",async()=>{for(const[path,kind,permission]of[
 ["app/discounts/[recordId]/edit/page.tsx","discount","promotions.manage"],
 ["app/content/blog/new/page.tsx","blog_post","content.manage"],["app/content/blog/[recordId]/edit/page.tsx","blog_post","content.manage"],
 ["app/content/pages/new/page.tsx","page","content.manage"],["app/content/pages/[recordId]/edit/page.tsx","page","content.manage"],
 ["app/content/policies/new/page.tsx","policy","content.manage"],["app/content/policies/[recordId]/edit/page.tsx","policy","content.manage"],
]as const){const value=await source(path);assert.match(value,/requireServerPanelAccess\(\)/);assert.match(value,new RegExp(`kind=\\"${kind}\\"`));assert.match(value,new RegExp(permission.replace(".","\\.")));assert.doesNotMatch(value,/searchParams|x-store-id|x-tenant-id|localStorage|sessionStorage/)} });

test("payment settings use the dedicated console and legacy routes only redirect",async()=>{
  const [page,create,edit]=await Promise.all([source("app/settings/payment/page.tsx"),source("app/settings/payment/new/page.tsx"),source("app/settings/payment/[recordId]/edit/page.tsx")]);
  assert.match(page,/PaymentSettingsConsole/);assert.doesNotMatch(page,/MerchantModuleConsole|kind="payment_setting"/);
  assert.match(page,/configuration\.manage/);assert.match(page,/integrations\.manage/);assert.match(page,/requireServerPanelAccess\(\)/);
  assert.match(create,/redirect\("\/settings\/payment\?dialog=provider-catalog"\)/);assert.doesNotMatch(create,/MerchantRecordEditor/);
  assert.match(edit,/LOWERCASE_UUID/);assert.match(edit,/redirect\(`\/settings\/payment\?method=\$\{recordId\}`\)/);assert.match(edit,/redirect\("\/settings\/payment"\)/);assert.doesNotMatch(edit,/MerchantRecordEditor/);
});

test("typed storefront settings render closed enum, local datetime roundtrip, finite list bounds and enum-list controls",async()=>{
  const value=await source("components/merchant-admin/MerchantModuleConsole.tsx");
  for(const evidence of["field.type === \"enum\"","field.type === \"enum-list\"","field.type === \"datetime\"","field.type === \"string-list\"","field.maxItems","field.allowedValues","field.optionLabels","datetime-local","getFullYear","new Date(raw)","timestamp.toISOString","invalid_enum_value","invalid_enum_list","invalid_string_list_","activeSubmissionRef","loadVersionRef"])assert.match(value,new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.doesNotMatch(value,/localStorage|sessionStorage|document[.]cookie|apiSecret|clientSecret|accessToken/);
  assert.match(value,/defaultChecked=\{enumListDefaultChecked\(editing, field[.]key, value\)\}/);
});

test("bounded numeric theme choices serialize as numbers rather than strings",async()=>{
  const value=await source("components/merchant-admin/MerchantModuleConsole.tsx");
  assert.match(value,/field\.type === "number" && field\.allowedValues/);
  assert.match(value,/field\.allowedValues\.includes\(raw\)/);
  assert.match(value,/entries\[field\.key\] = number/);
});

test("datetime-local, bounded list, and finite enum-list parsing reject unknown or duplicate values",async()=>{
  const value=await source("components/merchant-admin/MerchantModuleConsole.tsx");
  const dateStart=value.indexOf("function dateTimeInputSnapshot");const dateEnd=value.indexOf("\n}\n\nfunction parseFormConfig",dateStart)+2;
  const parseStart=value.indexOf("function parseFormConfig");const parseEnd=value.indexOf("\n}\n\nfunction statusPresentation",parseStart)+2;
  const program=ts.transpileModule(`${value.slice(dateStart,dateEnd)}\n${value.slice(parseStart,parseEnd)}\nconst fields=[{key:"items",type:"string-list",maxItems:12},{key:"areas",type:"string-list",maxItems:24},{key:"features",type:"enum-list",maxItems:3,allowedValues:["description_suggestions","seo_suggestions","campaign_drafts"]},{key:"startsAt",type:"datetime"}];const original="2026-11-01T06:30:00.123Z";const data=new FormData();data.set("items",Array.from({length:12},(_,index)=>\` item-${"${"}index+1} \`).join("\\n"));data.set("areas",Array.from({length:24},(_,index)=>\` area-${"${"}index+1} \`).join("\\n"));data.append("features","description_suggestions");data.append("features","seo_suggestions");data.set("startsAt","2026-11-01T01:30:00.123");const parsed=parseFormConfig(fields,data,{startsAt:original});console.log(JSON.stringify({local:dateTimeInputValue({config:{startsAt:original}},"startsAt"),parsed,featuresFrozen:Object.isFrozen(parsed.features)}));const tooMany=new FormData();tooMany.set("items",Array.from({length:13},(_,index)=>\`item-${"${"}index+1}\`).join("\\n"));try{parseFormConfig([{key:"items",type:"string-list",maxItems:12}],tooMany)}catch(error){console.log(error.message)}const tooManyAreas=new FormData();tooManyAreas.set("areas",Array.from({length:25},(_,index)=>\`area-${"${"}index+1}\`).join("\\n"));try{parseFormConfig([{key:"areas",type:"string-list",maxItems:24}],tooManyAreas)}catch(error){console.log(error.message)}const duplicate=new FormData();duplicate.append("features","description_suggestions");duplicate.append("features","description_suggestions");try{parseFormConfig([{key:"features",type:"enum-list",maxItems:3,allowedValues:["description_suggestions","seo_suggestions","campaign_drafts"]}],duplicate)}catch(error){console.log(error.message)}const unknown=new FormData();unknown.append("features","unknown");try{parseFormConfig([{key:"features",type:"enum-list",maxItems:3,allowedValues:["description_suggestions","seo_suggestions","campaign_drafts"]}],unknown)}catch(error){console.log(error.message)}const missingLimit=new FormData();missingLimit.set("items","item-1");try{parseFormConfig([{key:"items",type:"string-list"}],missingLimit)}catch(error){console.log(error.message)}const fractionalLimit=new FormData();fractionalLimit.set("items","item-1");try{parseFormConfig([{key:"items",type:"string-list",maxItems:1.5}],fractionalLimit)}catch(error){console.log(error.message)}const missingAllowedValues=new FormData();missingAllowedValues.append("features","description_suggestions");try{parseFormConfig([{key:"features",type:"enum-list",maxItems:3}],missingAllowedValues)}catch(error){console.log(error.message)}` ,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const result=spawnSync(process.execPath,["-e",program],{encoding:"utf8",env:{...process.env,TZ:"America/New_York"}});
  assert.equal(result.status,0,result.stderr);
  const [payload,rejection]=result.stdout.trim().split("\n");
  assert.equal(JSON.parse(payload!).local,"2026-11-01T01:30:00.123");
  assert.equal(JSON.parse(payload!).parsed.startsAt,"2026-11-01T06:30:00.123Z");
  assert.equal(JSON.parse(payload!).parsed.items.length,12);
  assert.equal(JSON.parse(payload!).parsed.areas.length,24);
  assert.deepEqual(JSON.parse(payload!).parsed.features,["description_suggestions","seo_suggestions"]);
  assert.equal(JSON.parse(payload!).featuresFrozen,true);
  assert.equal(rejection,"invalid_string_list_12");
  assert.equal(JSON.stringify(result.stdout.trim().split("\n").slice(2)),JSON.stringify(["invalid_string_list_24","invalid_enum_list","invalid_enum_list","invalid_list_definition","invalid_list_definition","invalid_enum_list"]));
});

test("enum-list defaults select only a persisted matching value",async()=>{
  const value=await source("components/merchant-admin/MerchantModuleConsole.tsx");
  const start=value.indexOf("function enumListDefaultChecked");
  assert.notEqual(start,-1,"enumListDefaultChecked helper is required");
  const end=value.indexOf("\n}\n",start)+2;
  const program=ts.transpileModule(`${value.slice(start,end)}\nconst record={config:{features:["description_suggestions",7]}};console.log(JSON.stringify([enumListDefaultChecked(record,"features","description_suggestions"),enumListDefaultChecked(record,"features","campaign_drafts"),enumListDefaultChecked(null,"features","description_suggestions")]));`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const result=spawnSync(process.execPath,["-e",program],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),[true,false,false]);
});

test("list validation exposes the exact per-field Turkish bound message",async()=>{
  const value=await source("components/merchant-admin/MerchantModuleConsole.tsx");
  assert.match(value,/Liste 1 ile \$\{limit\} arasında/);
  assert.match(value,/setError\(formErrorMessage\(caught\)\)/);
});
