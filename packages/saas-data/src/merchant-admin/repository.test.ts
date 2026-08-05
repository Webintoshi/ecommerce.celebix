import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import { MerchantAdminRepositoryError, PostgresMerchantAdminRepository, type MerchantAdminRepository } from "./index.ts";

const STORE="33333333-3333-4333-8333-333333333333", PRINCIPAL="44444444-4444-4444-8444-444444444444", MEMBERSHIP="55555555-5555-4555-8555-555555555555", PLAN="66666666-6666-4666-8666-666666666666", RECORD="71000000-0000-4000-8000-000000000001", OP="72000000-0000-4000-8000-000000000001", NOW=new Date("2026-07-22T19:00:00.000Z");
function tenant(): TenantContext { return { schemaVersion:1, requestId:"private", principal:{id:PRINCIPAL,issuer:"https://id.test/oidc",subject:"private"}, store:{id:STORE,slug:"store",status:"active"}, membership:{id:MEMBERSHIP,role:"store_owner",status:"active"}, entitlements:{schemaVersion:1,planId:PLAN,planCode:"growth",version:2,status:"active",features:["catalog"],limits:{products:100,staff:5,storageBytes:1024},validFrom:"2026-01-01T00:00:00.000Z"}, locale:"tr-TR" } as TenantContext }
type Row=Record<string,unknown>; type Responder=(text:string,values:unknown[])=>Row[]|Promise<Row[]>;
class Client { readonly calls:Array<{text:string;values:unknown[]}>=[]; readonly releases:unknown[]=[]; readonly responder:Responder; constructor(responder:Responder=()=>[]){this.responder=responder} async query(text:string,values:unknown[]=[]){this.calls.push({text,values});const rows=await this.responder(text,values);return{rows,rowCount:rows.length,command:"",oid:0,fields:[]}} release(value?:unknown){this.releases.push(value)} }
class Pool { private index=0; readonly clients:Client[]; constructor(clients:Client[]){this.clients=clients} async connect(){const client=this.clients[this.index++];if(!client)throw new Error("checkout");return client} }
function repository(pool:Pool,audit:string[]=[]){return new PostgresMerchantAdminRepository({pool,role:"celebix_saas_app",timeouts:{poolCheckoutMs:100,statementMs:500,lockMs:300,idleTransactionMs:700},uuid:()=>RECORD,audit:(event)=>{audit.push(event.type)}})}
function call(client:Client,name:string){const found=client.calls.find((entry)=>entry.text.includes(`saas.${name}`));assert.ok(found);return found}
function mutation(status="active"){return{id:RECORD,kind:"discount",status,version:1,updatedAt:NOW.toISOString()}}
function providerKindTypeBoundary(api:MerchantAdminRepository){if(false){
 // @ts-expect-error non-provider records must not compile at the provider list boundary
 void api.listProviderJobs({tenantContext:tenant(),now:NOW,kind:"discount"});
 // @ts-expect-error non-provider records must not compile at the provider prepare boundary
 void api.prepareProviderJob({tenantContext:tenant(),now:NOW,operationId:OP,recordId:RECORD,expectedRecordVersion:1,kind:"discount"});
 // @ts-expect-error non-provider records must not compile at the provider cancel boundary
 void api.cancelProviderJob({tenantContext:tenant(),now:NOW,operationId:OP,jobId:RECORD,expectedVersion:1,kind:"discount"});
}}
void providerKindTypeBoundary;

test("reads the exact effective starter presentation through durable merchant authority",async()=>{
 const presentation={schemaVersion:1,displayName:"Güzide",theme:{colorScheme:"warm",headingStyle:"sans",productCardStyle:"compact",productImageRatio:"square",homeProductLimit:12,showBrandStory:false},hero:{enabled:true,headline:"Yeni sezon",body:"Koleksiyonu keşfedin.",destination:"/products"},seo:{allowIndex:false}};
 const reader=new Client((text)=>text.includes("merchant_admin_effective_starter_presentation")?[{outcome:"found",result_payload:presentation}]:[]);
 const result=await repository(new Pool([reader])).getEffectiveStarterPresentation({tenantContext:tenant(),now:NOW,hostname:"store.saas-staging.celebix.site"});
 assert.deepEqual(result,presentation);
 assert.deepEqual(call(reader,"merchant_admin_effective_starter_presentation").values,[STORE,PRINCIPAL,MEMBERSHIP,PLAN,"growth",2,NOW,"store.saas-staging.celebix.site"]);
});

test("gets one exact fixed-kind record with durable authority",async()=>{
 const projected={id:RECORD,kind:"discount",name:"Yaz Indirimi",config:{discountType:"percent",value:15},status:"active",version:1,createdAt:NOW.toISOString(),updatedAt:NOW.toISOString()};
 const reader=new Client((text)=>text.includes("merchant_admin_get_record")?[{outcome:"found",result_payload:projected}]:[]);
 const result=await repository(new Pool([reader])).get({tenantContext:tenant(),now:NOW,kind:"discount",recordId:RECORD});
 assert.deepEqual(result,projected);
 assert.deepEqual(call(reader,"merchant_admin_get_record").values.slice(-2),["discount",RECORD]);
 const mismatch=new Client((text)=>text.includes("merchant_admin_get_record")?[{outcome:"found",result_payload:{...projected,kind:"page"}}]:[]);
 await assert.rejects(()=>repository(new Pool([mismatch])).get({tenantContext:tenant(),now:NOW,kind:"discount",recordId:RECORD}),error=>error instanceof MerchantAdminRepositoryError&&error.code==="unavailable");
});

test("lists durable tenant records and immutable audit events",async()=>{
 const reader=new Client((text)=>text.includes("merchant_admin_list_events")?[{outcome:"listed",result_payload:{items:[{id:OP,recordId:RECORD,recordKind:"discount",eventKind:"coupon_used",summary:{orderReference:"safe"},occurredAt:NOW.toISOString()}]}}]:text.includes("merchant_admin_list")?[{outcome:"listed",result_payload:{items:[{id:RECORD,kind:"discount",name:"Yaz Indirimi",config:{discountType:"percent",value:15},status:"active",version:1,createdAt:NOW.toISOString(),updatedAt:NOW.toISOString()}]}}]:[]);
 const repo=repository(new Pool([reader,new Client(reader.responder)]));
 assert.equal((await repo.list({tenantContext:tenant(),now:NOW,kind:"discount"}))[0]?.name,"Yaz Indirimi");
 assert.equal((await repo.listEvents({tenantContext:tenant(),now:NOW,kind:"discount"}))[0]?.eventKind,"coupon_used");
 assert.deepEqual(call(reader,"merchant_admin_list").values,[STORE,PRINCIPAL,MEMBERSHIP,PLAN,"growth",2,NOW,"discount"]);
});

test("saves and archives with exact versioned authority",async()=>{
 const writer=new Client((text)=>text.includes("merchant_admin_save")?[{outcome:"saved",result_payload:mutation()}]:[]);
 const saved=await repository(new Pool([writer])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"discount",name:"Yaz Indirimi",config:{discountType:"percent",value:15},status:"active"});
 assert.equal(saved.id,RECORD); assert.equal(call(writer,"merchant_admin_save").values[11],"discount");
 const archive=new Client((text)=>text.includes("merchant_admin_archive")?[{outcome:"archived",result_payload:{...mutation("archived"),version:2}}]:[]);
 assert.equal((await repository(new Pool([archive])).archive({tenantContext:tenant(),now:NOW,operationId:OP,recordId:RECORD,expectedVersion:1})).status,"archived");
});

test("rejects secret-bearing config before SQL",async()=>{
 await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"marketplace_connection",name:"Pazar",config:{apiSecret:"never"},status:"draft"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
 await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"discount",name:"Yaz",config:{unexpectedField:"never"},status:"draft"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
});

test("typed settings accept only finite public configuration before SQL",async()=>{
 const configurations={
  notification_setting:{emailEnabled:true,smsEnabled:false,pushEnabled:true,orderNotificationsEnabled:true,notificationEmail:"orders@example.test",senderLabel:"Celebix",replyToEmail:"support@example.test"},
  hero_banner:{headline:"Yeni sezon",body:"Göz atın",assetId:RECORD,destination:"/collections/new",enabled:true},
  social_preview:{title:"Celebix",description:"Paylaşım",assetId:RECORD},
  promotion_banner:{headline:"Yaz indirimi",body:"Sınırlı süre",destination:"/sale",startsAt:NOW.toISOString(),endsAt:"2026-08-22T19:00:00.000Z",enabled:true},
  marquee_setting:{items:["Ücretsiz kargo"],icon:"truck",speed:"normal",direction:"left",animation:"continuous",enabled:true},
  theme_setting:{colorScheme:"warm",headingStyle:"sans",productCardStyle:"compact",productImageRatio:"square",homeProductLimit:12,showBrandStory:false},
  category_showcase:{heading:"Koleksiyonları keşfedin",enabled:true,items:[{categoryId:"81000000-0000-4000-8000-000000000001",assetId:"82000000-0000-4000-8000-000000000001"}]},
 } as const;
 for(const [kind,config] of Object.entries(configurations)){
  const writer=new Client((text)=>text.includes("merchant_admin_save")?[{outcome:"saved",result_payload:{...mutation(),kind}}]:[]);
  await assert.doesNotReject(()=>repository(new Pool([writer])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:kind as never,name:"Ayar",config,status:"active"}));
 }
 for(const hostile of [{smtpPassword:"x"},{apiKey:"x"},{pushToken:"x"},{html:"<script>x</script>"}]) await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"notification_setting" as never,name:"Ayar",config:hostile as unknown as Record<string,string>,status:"active"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
 for(const hostile of [{orderNotificationsEnabled:"true"},{notificationEmail:"bad"},{notificationEmail:".lead@example.test"},{notificationEmail:"orders@example.test",unknown:true}]) await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"notification_setting",name:"Ayar",config:hostile as never,status:"active"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
 await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"hero_banner",name:"Ayar",config:{imageUrl:"https://cdn.example.test/hero.webp"},status:"active"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
 await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"social_preview",name:"Ayar",config:{assetId:"not-a-uuid"},status:"active"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
 for(const hostile of [
  {colorScheme:"red"},{headingStyle:"display"},{productCardStyle:"dense"},{productImageRatio:"landscape"},{homeProductLimit:6},{homeProductLimit:"8"},{showBrandStory:"true"},{customCss:"body{}"},
 ]) await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"theme_setting" as never,name:"Tema",config:hostile as never,status:"active"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
 for(const hostile of [
  {heading:"Kategoriler",enabled:true,items:[]},
  {heading:"Kategoriler",enabled:true,items:[{categoryId:RECORD,assetId:RECORD},{categoryId:RECORD,assetId:"82000000-0000-4000-8000-000000000002"}]},
  {heading:"Kategoriler",enabled:true,items:[{categoryId:RECORD,assetId:RECORD},{categoryId:"81000000-0000-4000-8000-000000000002",assetId:RECORD}]},
  {heading:"Kategoriler",enabled:true,items:[{categoryId:"not-a-uuid",assetId:RECORD}]},
 ]) await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"category_showcase",name:"Kategoriler",config:hostile as never,status:"active"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
});

test("active storefront settings cannot exceed or omit the public presentation contract",async()=>{
 const hostile=[
  ["hero_banner",{body:"x".repeat(1001)}],
  ["hero_banner",{destination:"/products?sort=new"}],
  ["promotion_banner",{enabled:true}],
  ["promotion_banner",{headline:"Kampanya",body:"x".repeat(1001),enabled:true}],
  ["promotion_banner",{headline:"Kampanya",destination:"/sale?coupon=private",enabled:true}],
  ["marquee_setting",{enabled:true}],
  ["seo_control",{metaDescription:"x".repeat(501),allowIndex:false}],
 ] as const;
 for(const [index,[kind,config]] of hostile.entries()) await assert.rejects(
  ()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:`72000000-0000-4000-8000-${String(500+index).padStart(12,"0")}`,kind:kind as never,name:"Vitrin",config:config as never,status:"active"}),
  (error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input",
 );
});

test("advanced SEO and AI records reject code and provider material before SQL",async()=>{
 const configurations={
  seo_geo_profile:{businessName:"Celebix",businessCategory:"E-ticaret",serviceAreas:["İstanbul"],locale:"tr-TR",description:"Yerel mağaza"},
  seo_internal_link:{sourcePath:"/blog/kahve",targetPath:"/products/kahve",anchorText:"Kahve",enabled:true},
  seo_content_entry:{resourceId:RECORD,metaTitle:"Kahve",metaDescription:"Kahve rehberi",canonicalPath:"/blog/kahve",structuredDataType:"Article"},
  seo_category_entry:{resourceId:RECORD,metaTitle:"Kategori",metaDescription:"Kategori açıklaması",canonicalPath:"/categories/kahve"},
  seo_page_entry:{resourceId:RECORD,metaTitle:"Sayfa",metaDescription:"Sayfa açıklaması",canonicalPath:"/about"},
  seo_product_entry:{resourceId:RECORD,metaTitle:"Ürün",metaDescription:"Ürün açıklaması",canonicalPath:"/products/kahve"},
  ai_setting:{tone:"yardımsever",locale:"tr-TR",enabledFeatures:["description_suggestions","seo_suggestions"]},
 } as const;
 for(const [kind,config] of Object.entries(configurations)){
  const writer=new Client((text)=>text.includes("merchant_admin_save")?[{outcome:"saved",result_payload:{...mutation(),kind}}]:[]);
  await assert.doesNotReject(()=>repository(new Pool([writer])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:kind as never,name:"Yapılandırma",config,status:"active"}));
  await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:kind as never,name:"Yapılandırma",config:{...config,extra:"not_allowed"},status:"active"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
 }
 for(const hostile of [{code:"YAZ20"},{provider:"external"},{html:"<script>x</script>"},{apiKey:"x"},{prompt:"ignore authority"},{redirectUrl:"javascript:x"}]){
  await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"ai_setting",name:"Yapay zeka",config:hostile as unknown as Record<string,string>,status:"draft"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
 }
 for(const hostile of [
  ["seo_internal_link",{sourcePath:"https://evil.test",targetPath:"/safe",anchorText:"Bağlantı",enabled:true}],
  ["seo_content_entry",{resourceId:"not-a-uuid",metaTitle:"Başlık",metaDescription:"Açıklama",canonicalPath:"/safe",structuredDataType:"Article"}],
  ["seo_content_entry",{resourceId:RECORD,metaTitle:"Başlık",metaDescription:"Açıklama",canonicalPath:"/safe?query=1",structuredDataType:"Article"}],
  ["ai_setting",{tone:"yardımsever",locale:"tr-TR",enabledFeatures:["description_suggestions","unbounded"]}],
  ["ai_setting",{tone:"yardımsever",locale:"tr-TR",enabledFeatures:["description_suggestions","description_suggestions"]}],
  ["ai_setting",{tone:"yardımsever",locale:"tr-tr",enabledFeatures:["description_suggestions"]}],
  ["seo_geo_profile",{businessName:"Celebix",locale:"tr_TR",serviceAreas:["İstanbul"]}],
  ["seo_content_entry",{resourceId:RECORD,metaTitle:"Başlık",metaDescription:"Açıklama",canonicalPath:"/safe",structuredDataType:"BlogPosting"}],
 ] as const){
  await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:hostile[0] as never,name:"Yapılandırma",config:hostile[1] as never,status:"draft"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
 }
});

test("typed settings reject hostile descriptors and canonical URL email timestamp enum array inputs before SQL",async()=>{
 const getterInput={tenantContext:tenant(),now:NOW,operationId:OP,kind:"hero_banner",name:"Ayar",status:"active"} as Record<string,unknown>;
 Object.defineProperty(getterInput,"config",{enumerable:true,get(){throw new Error("getter_invoked")}});
 await assert.rejects(()=>repository(new Pool([])).save(getterInput as never),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
 const hostile=[
  ["notification_setting",{replyToEmail:".lead@example.test"}], ["notification_setting",{replyToEmail:"lead..dot@example.test"}],
  ["hero_banner",{headline:"Hero",imageUrl:"https://cdn..example.test/hero.webp"}], ["hero_banner",{headline:"Hero",imageUrl:"https://cdn.example.test/a/../hero.webp"}], ["hero_banner",{headline:"Hero",imageUrl:"https://cdn.example.test/%zz"}], ["hero_banner",{headline:"Hero",destination:"/a/../b"}], ["hero_banner",{headline:"Hero",destination:"//evil.test"}], ["hero_banner",{headline:"Hero",destination:"/sale?next=%zz"}],
  ["promotion_banner",{headline:"Promo",startsAt:"2026-08-22T19:00:00.000Z",endsAt:"2026-07-22T19:00:00.000Z"}], ["promotion_banner",{headline:"Promo",startsAt:Date.now()}],
  ["marquee_setting",{items:[]}], ["marquee_setting",{items:["Duyuru"],icon:"rocket"}], ["marquee_setting",{items:["Duyuru"],speed:"warp"}], ["marquee_setting",{items:["Duyuru"],direction:"up"}], ["marquee_setting",{items:["Duyuru"],animation:"blink"}],
 ] as const;
 for(const [index,[kind,config]] of hostile.entries()) await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:`72000000-0000-4000-8000-${String(300+index).padStart(12,"0")}`,kind:kind as never,name:"Ayar",config:config as never,status:"active"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
});

test("typed settings reject finite-grammar URL email and Unicode-boundary bypasses before SQL",async()=>{
 const hostile=[
  ["hero_banner",{headline:"Hero",imageUrl:"https://999.999.999.999/hero"}], ["hero_banner",{headline:"Hero",imageUrl:"https://cdn.example.test/%A"}], ["hero_banner",{headline:"Hero",imageUrl:"https://cdn.example.test/%00"}], ["hero_banner",{headline:"Hero",imageUrl:"https://cdn.example.test/%7e"}], ["hero_banner",{headline:"Hero",imageUrl:"https://cdn.example.test/a\\b"}], ["hero_banner",{headline:"Hero",destination:"/sale?next=%00"}], ["hero_banner",{headline:"Hero",destination:"/sale?next=%7e"}],
  ["notification_setting",{replyToEmail:"a@x.1"}], ["notification_setting",{replyToEmail:"a@toolongtld.1"}], ["notification_setting",{replyToEmail:`${"a".repeat(65)}@example.test`}], ["notification_setting",{senderLabel:"<b>Html</b>"}], ["notification_setting",{senderLabel:"\u00a0Ayar"}], ["notification_setting",{senderLabel:"Ayar\ufeff"}], ["notification_setting",{senderLabel:"Ayar\u0085"}],
 ] as const;
 for(const [index,[kind,config]] of hostile.entries()) await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:`72000000-0000-4000-8000-${String(400+index).padStart(12,"0")}`,kind:kind as never,name:"Ayar",config:config as never,status:"active"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
});

test("typed settings unknown commit recovers once without repeating the write",async()=>{
 let commits=0;const writer=new Client((text)=>{if(text.includes("merchant_admin_save"))return[{outcome:"saved",result_payload:{...mutation(),kind:"hero_banner"}}];if(text==="COMMIT"&&commits++===0)throw new Error("wire");return[]});
 const recovery=new Client((text)=>text.includes("merchant_admin_recover_operation")?[{outcome:"operation_replayed",result_payload:{...mutation(),kind:"hero_banner"}}]:[]);
 const result=await repository(new Pool([writer,recovery])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"hero_banner",name:"Ayar",config:{headline:"Hero",body:"Metin",assetId:RECORD,destination:"/hero",enabled:true},status:"active"});
 assert.equal(result.replayed,true);assert.equal(writer.calls.filter((entry)=>entry.text.includes("merchant_admin_save")).length,1);assert.equal(recovery.calls[0]?.text,"BEGIN READ ONLY");
});

test("unknown commit destroys writer and performs one read-only recovery",async()=>{
 let commits=0;const writer=new Client((text)=>{if(text.includes("merchant_admin_save"))return[{outcome:"saved",result_payload:mutation()}];if(text==="COMMIT"&&commits++===0)throw new Error("wire");return[]});
 const recovery=new Client((text)=>text.includes("merchant_admin_recover_operation")?[{outcome:"operation_replayed",result_payload:mutation()}]:[]),audit:string[]=[];
 const result=await repository(new Pool([writer,recovery]),audit).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"discount",name:"Yaz",config:{value:15},status:"active"});
 assert.equal(result.replayed,true);assert.deepEqual(writer.releases,[true]);assert.equal(recovery.calls[0]?.text,"BEGIN READ ONLY");assert.deepEqual(audit,["merchant_admin_commit_unknown"]);
});

test("prepares and cancels provider work without projecting an external success",async()=>{
 const providerJob={id:RECORD,recordId:RECORD,recordKind:"marketplace_connection",action:"synchronization",status:"awaiting_provider_activation",version:1,updatedAt:NOW.toISOString()};
 const prepareClient=new Client((text)=>text.includes("merchant_provider_prepare")?[{outcome:"prepared",result_payload:providerJob}]:[]);
 const prepared=await repository(new Pool([prepareClient])).prepareProviderJob({tenantContext:tenant(),now:NOW,operationId:OP,recordId:RECORD,expectedRecordVersion:1,kind:"marketplace_connection"});
 assert.equal(prepared.status,"awaiting_provider_activation");
 assert.equal(call(prepareClient,"merchant_provider_prepare").values[12],"marketplace_connection");
 const cancelClient=new Client((text)=>text.includes("merchant_provider_cancel")?[{outcome:"cancelled",result_payload:{...providerJob,status:"cancelled",version:2}}]:[]);
 const cancelled=await repository(new Pool([cancelClient])).cancelProviderJob({tenantContext:tenant(),now:NOW,operationId:OP,jobId:providerJob.id,expectedVersion:1,kind:"marketplace_connection"});
 assert.equal(cancelled.status,"cancelled");
 assert.equal(JSON.stringify(cancelled).includes("completed"),false);
});

test("lists only exact bounded provider preparation projections",async()=>{
 const job={id:"73000000-0000-4000-8000-000000000001",recordId:RECORD,recordKind:"indexing_request",action:"indexing",status:"awaiting_provider_activation",version:1,requestedAt:NOW.toISOString(),updatedAt:NOW.toISOString()};
 const reader=new Client((text)=>text.includes("merchant_provider_list")?[{outcome:"listed",result_payload:{items:[job]}}]:[]);
 const result=await repository(new Pool([reader])).listProviderJobs({tenantContext:tenant(),now:NOW,kind:"indexing_request"});
 assert.deepEqual(result,[{...job,profileId:null,providerCode:null,credentialVersion:null,attempt:0,safeProviderReference:null,outcomeCode:null}]);
 await assert.rejects(()=>repository(new Pool([])).prepareProviderJob({tenantContext:tenant(),now:NOW,operationId:OP,recordId:RECORD,expectedRecordVersion:1,kind:"discount" as never}),error=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
});

test("queues one prepared provider job against an exact active profile version",async()=>{
 const profileId="74000000-0000-4000-8000-000000000001";
 const queued={id:RECORD,recordId:RECORD,recordKind:"marketplace_connection",action:"synchronization",status:"queued",profileId,providerCode:"fixture_provider",credentialVersion:2,attempt:0,safeProviderReference:null,outcomeCode:null,version:2,updatedAt:NOW.toISOString()};
 const writer=new Client((text)=>text.includes("merchant_provider_queue")?[{outcome:"queued",result_payload:queued}]:[]);
 const result=await repository(new Pool([writer])).queueProviderJob({tenantContext:tenant(),now:NOW,operationId:OP,jobId:RECORD,expectedJobVersion:1,profileId,expectedProfileVersion:3,kind:"marketplace_connection"});
 assert.equal(result.status,"queued");
 assert.equal(result.profileId,profileId);
 assert.deepEqual(call(writer,"merchant_provider_queue").values.slice(-4),[RECORD,1,profileId,3]);
});
