import assert from'node:assert/strict';
import test from'node:test';
import{ProductMediaRepositoryError}from'@celebix/saas-data';
import{createToshiImageSourceHttpHandler}from'./handler.ts';
const STORE='28500000-0000-4000-8000-000000000001',PRODUCT='28500000-0000-4000-8000-000000000002',MEDIA='28500000-0000-4000-8000-000000000003',OTHER='28500000-0000-4000-8000-000000000004',NOW=new Date('2026-10-27T12:00:00Z');
const COOKIE=`v1.panel.current.${Buffer.alloc(32,1).toString('base64url')}`,KEY=`stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`,SOURCE=`https://media.saas-staging.celebix.site/${KEY}`,PATH=`/api/content-ai/image-source/${PRODUCT}/${MEDIA}`,BYTES=new Uint8Array([82,73,70,70,1,2,3,4]);
const context=()=>({params:Promise.resolve({productId:PRODUCT,mediaId:MEDIA})});
function req(headers:HeadersInit={},suffix=''){return new Request('https://fixture.admin.celebix.site'+PATH+suffix,{headers:{host:'fixture.admin.celebix.site',cookie:`__Host-celebix_panel=${COOKIE}`,...Object.fromEntries(new Headers(headers))}});}
function fixture(options:{media?:Record<string,unknown>;role?:string;storeStatus?:string;memberStatus?:string;items?:unknown[];source?:string;response?:()=>Response|Promise<Response>;budget?:number;auth?:()=>Promise<unknown>;listError?:Error}={}){
 let fetches=0,lists=0;const fetched:{url:unknown;init:RequestInit}[]=[],tenantContext={store:{id:STORE,slug:'fixture',status:options.storeStatus??'active'},membership:{status:options.memberStatus??'active',role:options.role??'editor'}};
 const item={id:MEDIA,storeId:STORE,productId:PRODUCT,status:'active',objectKey:KEY,publicUrl:'https://attacker.example/not-used',mediaType:'image/webp',byteSize:BYTES.byteLength,...options.media};
 const handler=createToshiImageSourceHttpHandler({resolveRuntime:async()=>({access:{resolveCredential:async(input:unknown)=>{assert.deepEqual(input,{credential:COOKIE,hostname:'fixture.admin.celebix.site',requestId:MEDIA,now:NOW});return options.auth?options.auth():{kind:'authenticated',tenantContext};}},media:{listProductMedia:async(input:unknown)=>{lists++;assert.deepEqual(input,{tenantContext,now:NOW,productId:PRODUCT});if(options.listError)throw options.listError;return options.items??[item];}},storage:{publicUrl:(key:string)=>{assert.equal(key,KEY);return options.source??SOURCE;}}}as never),now:()=>NOW,requestId:()=>MEDIA,requestBudgetMs:options.budget,fetcher:async(url,init)=>{fetches++;fetched.push({url,init:init!});return options.response?options.response():new Response(BYTES,{headers:{'content-type':'image/webp','content-length':String(BYTES.byteLength)}});}});
 return{handler,fetches:()=>fetches,lists:()=>lists,fetched};
}
test('authenticated tenant image bytes use configured storage URL and private cookie-varying cache',async()=>{
 const f=fixture(),response=await f.handler(req(),context());assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),BYTES);assert.equal(response.headers.get('content-type'),'image/webp');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('cache-control'),'private, max-age=300');assert.equal(response.headers.get('vary'),'Cookie');assert.equal(f.fetches(),1);
 assert.equal(f.fetched[0]!.url,SOURCE);assert.equal(f.fetched[0]!.init.redirect,'error');assert.equal(f.fetched[0]!.init.credentials,'omit');assert.deepEqual(f.fetched[0]!.init.headers,{accept:'image/webp'});assert.equal(f.fetched[0]!.init.method,'GET');
});
test('unknown, archived, foreign-store and foreign-product media cannot trigger fetch',async()=>{
 for(const options of[{items:[]},{media:{id:OTHER}},{media:{status:'archived'}},{media:{storeId:OTHER}},{media:{productId:OTHER}}]){const f=fixture(options);assert.equal((await f.handler(req(),context())).status,404);assert.equal(f.fetches(),0);}
 const denied=fixture({listError:new ProductMediaRepositoryError('product_not_found')});assert.equal((await denied.handler(req(),context())).status,404);assert.equal(denied.fetches(),0);
});
test('forged tenant prefixes, traversal, URLs, query-bearing keys and oversized metadata are rejected before fetch',async()=>{
 for(const media of[{objectKey:`stores/${OTHER}/products/${PRODUCT}/${MEDIA}.webp`},{objectKey:`stores/${STORE}/products/${PRODUCT}/../${MEDIA}.webp`},{objectKey:'https://127.0.0.1/private'},{objectKey:KEY+'?url=https://attacker.example'},{mediaType:'image/svg+xml'},{byteSize:8*1024*1024+1}]){const f=fixture({media});assert.equal((await f.handler(req(),context())).status,502);assert.equal(f.fetches(),0);}
 for(const source of['http://127.0.0.1/'+KEY,'https://user:pass@media.saas-staging.celebix.site/'+KEY,SOURCE+'?redirect=https://attacker.example','https://media.saas-staging.celebix.site/wrong-path']){const f=fixture({source});assert.equal((await f.handler(req(),context())).status,502);assert.equal(f.fetches(),0);}
});
test('upstream redirects, wrong response URLs and MIME mismatches are never returned as images',async()=>{
 const wrongUrl=()=>{const r=new Response(BYTES,{headers:{'content-type':'image/webp'}});Object.defineProperty(r,'url',{value:'https://attacker.example/image.webp'});return r;};
 for(const response of[()=>Response.redirect('https://attacker.example',302),wrongUrl,()=>new Response(BYTES,{headers:{'content-type':'text/html'}}),()=>new Response(BYTES,{headers:{'content-type':'image/webp; charset=utf-8'}})]){const f=fixture({response});assert.equal((await f.handler(req(),context())).status,502);assert.equal(f.fetches(),1);}
});
test('declared length, streamed length and the eight MiB ceiling are all enforced',async()=>{
 for(const response of[()=>new Response(BYTES,{headers:{'content-type':'image/webp','content-length':'9'}}),()=>new Response(new Uint8Array(9),{headers:{'content-type':'image/webp'}}),()=>new Response(new Uint8Array(7),{headers:{'content-type':'image/webp'}})]){const f=fixture({response});assert.equal((await f.handler(req(),context())).status,502);}
 const large=fixture({media:{byteSize:8*1024*1024},response:()=>new Response(new Uint8Array(8*1024*1024+1),{headers:{'content-type':'image/webp'}})});assert.equal((await large.handler(req(),context())).status,502);
});
test('hung upstream streams are cancelled at a finite deadline',async()=>{
 let cancelled=false;const f=fixture({budget:10,response:()=>new Response(new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array([1]));},cancel(){cancelled=true;}}),{headers:{'content-type':'image/webp'}})});
 const response=await f.handler(req(),context());assert.equal(response.status,504);assert.deepEqual(await response.json(),{code:'image_source_timeout'});assert.equal(cancelled,true);
});
test('runtime, credential resolution and fetch hangs are bounded before any untrusted continuation',async()=>{
 const auth=fixture({budget:10,auth:()=>new Promise(()=>{})});assert.equal((await auth.handler(req(),context())).status,504);assert.equal(auth.fetches(),0);assert.equal(auth.lists(),0);
 const fetch=fixture({budget:10,response:()=>new Promise(()=>{})});assert.equal((await fetch.handler(req(),context())).status,504);assert.equal(fetch.fetches(),1);
 const runtime=createToshiImageSourceHttpHandler({resolveRuntime:()=>new Promise(()=>{}),now:()=>NOW,requestId:()=>MEDIA,requestBudgetMs:10});assert.equal((await runtime(req(),context())).status,504);
});
test('forged authority headers, query parameters, missing cookies and catalog-denied roles fail before media access',async()=>{
 for(const[headers,suffix,status]of[[{'x-store-id':STORE},'',400],[{authorization:'Bearer caller'},'',400],[{},'?url=https://attacker.example',400],[{cookie:''},'',401]]as const){const f=fixture();assert.equal((await f.handler(req(headers,suffix),context())).status,status);assert.equal(f.fetches(),0);assert.equal(f.lists(),0);}
 for(const options of[{role:'analyst'},{storeStatus:'suspended'},{memberStatus:'inactive'}]){const f=fixture(options);assert.equal((await f.handler(req(),context())).status,403);assert.equal(f.fetches(),0);assert.equal(f.lists(),0);}
 const f=fixture();assert.equal((await f.handler(req(),{params:Promise.resolve({productId:'invalid',mediaId:MEDIA})})).status,400);assert.equal(f.fetches(),0);
});
