import assert from 'node:assert/strict';
import test from 'node:test';
const api = await import('./handler.ts').catch(() => ({})) as typeof import('./handler.ts');
const ORIGIN='https://panel.saas-staging.celebix.net',ID='25200000-0000-4000-8000-000000000001',OP='25200000-0000-4000-8000-000000000002';
const BASE='/api/marketing/native-email',COOKIE=`__Host-celebix_panel=v1.panel.current.${Buffer.alloc(32,1).toString('base64url')}`;
const CONTENT={subject:'Yeni ürünler',heading:'Sizin için seçtik',body:'Mağazamıza bekleriz.',buttonLabel:'Ürünleri gör',buttonPath:'/urunler'};
const projection={recipient:'preview@example.invalid',senderLabel:'Fixture',storeName:'Fixture',primaryColor:'#222222',storefrontOrigin:'https://fixture.example.test',supportUrl:'https://fixture.example.test/iletisim',template:{id:'new_products',version:1,...CONTENT},items:[],recoveryNeeded:false,isTest:true};
function req(path='',body?:unknown,headers:Record<string,string>={}) {return new Request('http://internal:3400'+BASE+path,{method:body===undefined?'GET':'POST',headers:{host:new URL(ORIGIN).hostname,cookie:COOKIE,...(body===undefined?{}:{origin:ORIGIN,'content-type':'application/json','idempotency-key':OP}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}
function fixture(repository:any,role='store_owner',plan='growth',credential=true) {
 const tenantContext:any={schemaVersion:1,requestId:ID,principal:{id:ID},store:{id:ID,slug:'fixture',status:'active'},membership:{id:ID,role,status:'active'},entitlements:{status:'active',features:['integrations'],planId:plan==='growth'?'00000000-0000-4000-8000-000000000009':'00000000-0000-4000-8000-000000000008',planCode:plan,version:2}};
 return api.createNativeMarketingHttpHandlers({now:()=>new Date('2026-10-18T12:00:00.000Z'),requestId:()=>ID,resolveRuntime:async()=>({email:repository,senderEmail:'noreply@posta.example.test',publicOrigin:'https://owner.example.test',access:{readiness:{mode:'approved_staging'},panelOrigin:ORIGIN,resolveCredential:async(i:any)=>credential&&i.hostname===new URL(ORIGIN).hostname?{kind:'authenticated',tenantContext}:{kind:'unauthorized'}}}) as any});
}
test('workspace and campaign effect are bound to the authenticated tenant and exact operation',async()=>{
 assert.equal(typeof api.createNativeMarketingHttpHandlers,'function');const calls:any[]=[];
 const h=fixture({overview:async()=>({templates:[],campaigns:[]}),queueCampaign:async(i:any)=>{calls.push(i);return{id:ID,status:'queued'};}});
 const r=await h.get(req(),'overview');assert.equal(r.status,200);assert.equal((await r.json()).senderEmail,'noreply@posta.example.test');
 assert.equal((await h.post(req('/campaigns/send',{name:'Yeni ürünler',templateId:'new_products',content:CONTENT,productIds:[ID]}),'send')).status,200);
 assert.equal(calls.length,1);assert.equal(calls[0].tenantContext.store.id,ID);assert.equal(calls[0].operationId,OP);assert.deepEqual(calls[0].productIds,[ID]);
 for(const body of [{name:'X',templateId:'offer',storeId:ID},{name:'X',templateId:'cart'},{name:'X',templateId:'offer',recipients:['foreign@example.test']}])assert.equal((await h.post(req('/campaigns/send',body),'send')).status,400);
 assert.equal(calls.length,1);
});
test('foreign host/origin, missing session, cashier and lower plan cannot create campaign effects',async()=>{
 let effects=0;const repository={queueCampaign:async()=>{effects++;return{};}};const b={name:'Test',templateId:'offer'};
 for(const headers of [{origin:'https://attacker.test'},{host:'attacker.test'},{cookie:''}] as Record<string,string>[])assert.ok([401,403].includes((await fixture(repository).post(req('/campaigns/send',b,headers),'send')).status));
 for(const [role,plan]of [['cashier','growth'],['analyst','growth'],['store_owner','starter']])assert.equal((await fixture(repository,role,plan).post(req('/campaigns/send',b),'send')).status,403);
 assert.equal(effects,0);
});
test('unsafe content, authority headers, oversize bodies and invalid schedules are refused before enqueue',async()=>{
 let effects=0;const h=fixture({queueCampaign:async()=>{effects++;return{};}});const b={name:'Test',templateId:'offer'};
 for(const body of [{...b,content:{...CONTENT,subject:'Header\r\nInjection'}},{...b,content:{...CONTENT,buttonPath:'//attacker.test'}},{...b,productIds:Array.from({length:9},()=>ID)},{...b,extra:'x'.repeat(17000)}])assert.equal((await h.post(req('/campaigns/send',body),'send')).status,400);
 for(const headers of [{'x-store-id':ID},{'x-tenant-id':ID},{authorization:'Bearer secret'},{'idempotency-key':'bad'}] as Record<string,string>[])assert.equal((await h.post(req('/campaigns/send',b,headers),'send')).status,400);
 for(const scheduledAt of ['not-a-date','2026-10-18T11:59:00.000Z','2027-01-01T12:00:00.000Z'])assert.equal((await h.post(req('/campaigns/schedule',{...b,scheduledAt}),'schedule')).status,400);
 assert.equal(effects,0);
});
test('preview renders only server canonical branding and selected products without enqueuing',async()=>{
 const calls:any[]=[];const h=fixture({preview:async(i:any)=>{calls.push(i);return projection;}});
 const r=await h.post(req('/preview',{templateId:'new_products',content:CONTENT,productIds:[ID]}),'preview');assert.equal(r.status,200);const v=await r.json();assert.match(v.html,/Fixture/);assert.match(v.from,/Fixture/);assert.equal(calls[0].tenantContext.store.id,ID);
 assert.equal((await h.post(req('/preview',{templateId:'offer',branding:{storeName:'Forged'}}),'preview')).status,400);
});
test('test recipient is explicit and single; cart test uses the test path, not a real audience',async()=>{
 const calls:any[]=[];const h=fixture({testCampaign:async(i:any)=>{calls.push(i);return{id:ID,isTest:true};}});
 assert.equal((await h.post(req('/test',{name:'Kontrol',templateId:'cart',recipient:'owner@example.test'}),'test')).status,200);
 assert.equal(calls[0].recipient,'owner@example.test');assert.equal(calls[0].operationId,OP);
 for(const recipient of ['bad','a@example.test,b@example.test','a@example.test\r\nBcc:x@example.test'])assert.equal((await h.post(req('/test',{name:'Kontrol',templateId:'offer',recipient}),'test')).status,400);
 assert.equal(calls.length,1);
});
test('settings, product selection and cancellation preserve explicit versions and do not trust query authority',async()=>{
 const calls:any[]=[];const h=fixture({products:async(i:any)=>{calls.push(i);return[];},saveSettings:async(i:any)=>{calls.push(i);return{version:2};},cancelCampaign:async(i:any)=>{calls.push(i);return{id:ID,status:'cancelled'};}});
 assert.deepEqual(await(await h.get(req('/products?q=kolye'),'products')).json(),{items:[],nextCursor:null});assert.equal(calls[0].query,'kolye');
 assert.equal((await h.get(req('/products?q=x&q=y'),'products')).status,400);assert.equal((await h.get(req('/products?storeId='+ID),'products')).status,400);
 assert.equal((await h.post(req('/cart-settings',{expectedVersion:1,enabled:true,cartReminderEnabled:true,secondCartReminderEnabled:false}),'settings')).status,200);
 assert.equal((await h.post(req('/campaigns/'+ID+'/cancel',{expectedVersion:3}),'cancel',ID)).status,200);assert.equal(calls[2].campaignId,ID);assert.equal(calls[2].expectedVersion,3);
});
test('unknown backend errors expose no secret or arbitrary provider detail',async()=>{
 const h=fixture({overview:async()=>{throw new Error('private-secret-key');}});const r=await h.get(req(),'overview');assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'unavailable'});
});
