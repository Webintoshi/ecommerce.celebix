import assert from 'node:assert/strict';
import test from 'node:test';
import { GoogleMarketingProvider } from './provider.ts';
import { sealGoogleCredential,openGoogleCredential } from './credential-crypto.ts';
const keyring={activeKeyId:'k1',keys:[{keyId:'k1',key:new Uint8Array(32).fill(8)}]};
test('Google encrypted credentials bind service and tenant and authenticate ciphertext',()=>{
 const envelope=sealGoogleCredential({accessToken:'secret',refreshToken:'refresh',expiresAt:'2026-10-08T12:00:00Z',scopes:[],subject:'google1',email:'owner@test.com'},'store1','gtm',keyring);
 assert.equal(openGoogleCredential(envelope,'store1','gtm',keyring).accessToken,'secret');
 assert.throws(()=>openGoogleCredential(envelope,'store2','gtm',keyring));
 assert.throws(()=>openGoogleCredential(envelope,'store1','ads',keyring));
 assert.throws(()=>sealGoogleCredential({accessToken:'secret',refreshToken:'refresh',expiresAt:'2026-10-08T12:00:00Z',scopes:[],subject:'google1',email:'owner@test.com'},'store1','gtm',{activeKeyId:'k',keys:[{keyId:'k',key:new Uint8Array(31)}]}));
});
test('provider redacts OAuth errors and does not follow redirects',async()=>{
 let observed:RequestInit|undefined;
 const provider=new GoogleMarketingProvider({clientId:'client',clientSecret:'private',panelOrigin:'https://panel.example.com'},async(_url,init)=>{observed=init;return new Response(JSON.stringify({error:'secret_access_token_from_provider'}),{status:400});});
 await assert.rejects(()=>provider.exchange('private-code',new Date()),(error:any)=>error.code==='oauth_denied'&&!String(error).includes('secret'));
 assert.equal(observed?.redirect,'error');
});
test('Ads discovers the actual manual website purchase snippet and no developer-token header',async()=>{
 const calls:Array<{url:string,init?:RequestInit}>=[];
 const provider=new GoogleMarketingProvider({adsProjectId:'production-project'},async(url,init)=>{
  calls.push({url:String(url),init});
  if(String(url).endsWith('customers:listAccessibleCustomers'))return Response.json({resourceNames:['customers/123']});
  const query=JSON.parse(String(init?.body)).query;
  if(query.includes('FROM customer_client'))return Response.json({results:[]});
  if(query.includes('FROM customer'))return Response.json({results:[{customer:{id:'123',descriptiveName:'Store',manager:false}}]});
  return Response.json({results:[{conversionAction:{id:'456',name:'Purchase',type:'WEBPAGE',category:'PURCHASE',status:'ENABLED',tagSnippets:[{type:'WEBPAGE',pageFormat:'HTML',eventSnippet:"gtag('event', 'conversion', {'send_to': 'AW-987654/real_Label'});"}]}}]});
 });
 const resources=await provider.resources('ads','access','123');
 assert.equal(resources.resources[0]?.tagId,'AW-987654');assert.equal(resources.resources[0]?.conversionLabel,'real_Label');
 assert.ok(calls.every(call=>!new Headers(call.init?.headers).has('developer-token')));
});

type AdsFixtureErrorCode={authorizationError?:string;authenticationError?:string};
function adsFixtureFailure(status:number,codes?:readonly AdsFixtureErrorCode[]):Response{
 return Response.json({error:{code:status,message:'TEST_PROVIDER_DETAIL',status:status===401?'UNAUTHENTICATED':status===404?'NOT_FOUND':'PERMISSION_DENIED',...(codes?{details:[{'@type':'type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure',errors:codes.map(errorCode=>({errorCode,message:'TEST_PROVIDER_DETAIL'})),requestId:'test-request'}]}:{})}},{status});
}
function adsRootFixture(roots:readonly string[],failure:()=>Response,initialFailure?:()=>Response):GoogleMarketingProvider{
 return new GoogleMarketingProvider({adsProjectId:'production-project'},async(url,init)=>{
  const path=new URL(String(url)).pathname;
  if(path.endsWith('customers:listAccessibleCustomers'))return initialFailure?initialFailure():Response.json({resourceNames:roots.map(id=>`customers/${id}`)});
  if(path.includes('/customers/789/'))return failure();
  if(!path.includes('/customers/123/'))throw new Error('Unexpected Ads fixture customer');
  const query=JSON.parse(String(init?.body)).query;
  if(query.includes('conversion_tracking_setting'))return Response.json({results:[{customer:{conversionTrackingSetting:{googleAdsConversionCustomer:'customers/123'}}}]});
  if(query.includes('FROM customer'))return Response.json({results:[{customer:{id:'123',descriptiveName:'Ready store',manager:false,testAccount:false}}]});
  if(query.includes('FROM conversion_action'))return Response.json({results:[{conversionAction:{id:'456',name:'Purchase',type:'WEBPAGE',category:'PURCHASE',status:'ENABLED',tagSnippets:[{type:'WEBPAGE',pageFormat:'HTML',eventSnippet:"gtag('event','conversion',{'send_to':'AW-987654/real_Label'});"}]}}]});
  throw new Error('Unexpected Ads fixture query');
 });
}
const unavailableAdsRoots=[
 {name:'INCOMPLETE_SIGNUP',status:403,errorCode:{authorizationError:'INCOMPLETE_SIGNUP'}},
 {name:'CUSTOMER_NOT_ENABLED',status:403,errorCode:{authorizationError:'CUSTOMER_NOT_ENABLED'}},
 {name:'CUSTOMER_NOT_FOUND',status:404,errorCode:{authenticationError:'CUSTOMER_NOT_FOUND'}},
] as const;
for(const unavailable of unavailableAdsRoots){
 for(const roots of [['789','123'],['123','789']] as const)test(`Ads retains a ready account when ${unavailable.name} root is ${roots[0]==='789'?'first':'last'}`,async()=>{
  const provider=adsRootFixture(roots,()=>adsFixtureFailure(unavailable.status,[unavailable.errorCode]));
  assert.deepEqual(await provider.resources('ads','access'),{accounts:[{id:'123',name:'Ready store'}],resources:[]});
 });
 test(`Ads reads the selected ready account purchase despite a ${unavailable.name} root`,async()=>{
  const provider=adsRootFixture(['789','123'],()=>adsFixtureFailure(unavailable.status,[unavailable.errorCode]));
  assert.deepEqual(await provider.resources('ads','access','123'),{accounts:[{id:'123',name:'Ready store'}],resources:[{id:'456',name:'Purchase',parentId:'123',tagId:'AW-987654',conversionLabel:'real_Label'}]});
 });
 test(`Ads reports provider_denied when every discovered root is ${unavailable.name}`,async()=>{
  const provider=adsRootFixture(['789'],()=>adsFixtureFailure(unavailable.status,[unavailable.errorCode]));
  await assert.rejects(()=>provider.resources('ads','access'),(error:any)=>error.code==='provider_denied'&&!String(error).includes('TEST_PROVIDER_DETAIL'));
 });
}
for(const failure of [
 {name:'unclassified HTTP 403',status:403,codes:undefined,expected:'provider_denied'},
 {name:'unclassified HTTP 401',status:401,codes:undefined,expected:'needs_reconnect'},
 {name:'Cloud production approval error',status:403,codes:[{authorizationError:'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION'}],expected:'ads_project_unapproved'},
 {name:'mixed unavailable and user permission errors',status:403,codes:[{authorizationError:'CUSTOMER_NOT_ENABLED'},{authorizationError:'USER_PERMISSION_DENIED'}],expected:'provider_denied'},
 {name:'mixed unavailable and Cloud approval errors',status:403,codes:[{authorizationError:'CUSTOMER_NOT_ENABLED'},{authorizationError:'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION'}],expected:'ads_project_unapproved'},
])test(`Ads fails closed on ${failure.name} even after reading a ready account`,async()=>{
 const provider=adsRootFixture(['123','789'],()=>adsFixtureFailure(failure.status,failure.codes));
 await assert.rejects(()=>provider.resources('ads','access'),(error:any)=>error.code===failure.expected&&!String(error).includes('TEST_PROVIDER_DETAIL'));
});
test('Ads never skips an account-state error from the initial accessible-customer request',async()=>{
 const failure=()=>adsFixtureFailure(403,[{authorizationError:'CUSTOMER_NOT_ENABLED'}]);
 const provider=adsRootFixture(['123'],failure,failure);
 await assert.rejects(()=>provider.resources('ads','access'),(error:any)=>error.code==='provider_denied');
});
test('Ads distinguishes a genuinely empty accessible-account list from unavailable roots',async()=>{
 const provider=adsRootFixture([],()=>adsFixtureFailure(403));
 assert.deepEqual(await provider.resources('ads','access'),{accounts:[],resources:[]});
});
test('Ads denies selecting an unavailable account while another account remains ready',async()=>{
 for(const unavailable of unavailableAdsRoots){
  const provider=adsRootFixture(['123','789'],()=>adsFixtureFailure(unavailable.status,[unavailable.errorCode]));
  await assert.rejects(()=>provider.validateSelection('ads','access',{accountId:'789',resourceId:'456',resourceName:'Purchase',tagId:'AW-987654',conversionLabel:'real_Label'},'store.example.com'),(error:any)=>error.code==='resource_denied');
 }
});
test('Ads never skips malformed or untyped account-state failures',async()=>{
 const type='type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure';
 const errors=[{errorCode:{authorizationError:'CUSTOMER_NOT_ENABLED'},message:'TEST_PROVIDER_DETAIL'}];
 for(const detail of [
  {'@type':'type.googleapis.com/google.rpc.ErrorInfo',errors},
  {errors},
  {'@type':[type],errors},
  {'@type':type,errors:[{errorCode:{authorizationError:['CUSTOMER_NOT_ENABLED']},message:'TEST_PROVIDER_DETAIL'}]},
 ]){
  const provider=adsRootFixture(['123','789'],()=>Response.json({error:{code:403,status:'PERMISSION_DENIED',message:'TEST_PROVIDER_DETAIL',details:[detail]}},{status:403}));
  await assert.rejects(()=>provider.resources('ads','access'),(error:any)=>error.code==='provider_denied');
 }
});
test('Ads never skips account-state failures containing extra or unknown error codes',async()=>{
 for(const codes of [
  [{authorizationError:'CUSTOMER_NOT_ENABLED',unknownError:'FUTURE_ERROR'}],
  [{authorizationError:'CUSTOMER_NOT_ENABLED'},{authorizationError:'FUTURE_ERROR'}],
 ]){
  const provider=adsRootFixture(['123','789'],()=>adsFixtureFailure(403,codes));
  await assert.rejects(()=>provider.resources('ads','access'),(error:any)=>error.code==='provider_denied');
 }
});
test('GTM refuses existing custom HTML without modifying any Google entity',async()=>{
 const methods:string[]=[];
 const provider=new GoogleMarketingProvider({},async(url,init)=>{methods.push(init?.method??'GET'); if(new URL(String(url)).pathname.endsWith('/accounts'))return Response.json({account:[{accountId:'1',name:'Tenant'}]});if(new URL(String(url)).pathname.endsWith('/containers'))return Response.json({container:[{containerId:'2',name:'Web',publicId:'GTM-ABC123',usageContext:['web']}]});return Response.json({containerVersion:{containerVersionId:'3',fingerprint:'fp',tag:[{type:'html',name:'unsafe'}]}});});
 await assert.rejects(()=>provider.applyGtm('access',{accountId:'1',resourceId:'2',resourceName:'Web'},'store.example.com','operation',{},async()=>{}),(error:any)=>error.code==='unsafe_container');
 assert.ok(methods.every(method=>method==='GET'));
});
test('GTM preserves native tags and recovers lost publish response using checkpointed version',async()=>{
 const checkpoints:any[]=[];const writes:Array<{path:string,method:string,body:any}>=[];let liveId='3';let lost=true;
 const provider=new GoogleMarketingProvider({},async(url,init)=>{
  const path=new URL(String(url)).pathname;const method=init?.method??'GET';const body=init?.body?JSON.parse(String(init.body)):null;if(method!=='GET')writes.push({path,method,body});
  if(path.endsWith('/accounts'))return Response.json({account:[{accountId:'1',name:'Tenant'}]});
  if(path.endsWith('/containers'))return Response.json({container:[{containerId:'2',name:'Web',publicId:'GTM-ABC123',usageContext:['web']}]});
  if(path.endsWith('/versions:live'))return Response.json({containerVersionId:liveId,fingerprint:'live-fp',tag:[{type:'googtag',name:'Existing Google native tag',tagId:'10'}]});
  if(path.endsWith('/version_headers:latest'))return Response.json({containerVersionId:liveId});
  if(path.endsWith('/version_headers'))return Response.json({});
  if(path.endsWith('/workspaces'))return Response.json(method==='POST'?{workspaceId:'4'}:{workspace:[]});
  if(path.endsWith('/tags'))return Response.json(method==='POST'?{tagId:'11',...body}:{tag:[{type:'googtag',name:'Existing Google native tag',tagId:'10'}]});
  if(path.endsWith('/status'))return Response.json({mergeConflict:[]});
  if(path.endsWith(':create_version'))return Response.json({containerVersion:{containerVersionId:'5',tag:[{type:'googtag',name:'Existing Google native tag',tagId:'10'},{type:'gclidw',name:'Celebix conversion linker',notes:'Managed by Celebix. Native Google conversion linker.',tagId:'11'}]}});
  if(path.endsWith('/versions/5'))return Response.json({containerVersionId:'5',fingerprint:'version-fp',tag:[{type:'googtag',name:'Existing Google native tag',tagId:'10'},{type:'gclidw',name:'Celebix conversion linker',notes:'Managed by Celebix. Native Google conversion linker.',tagId:'11'}]});
  if(path.endsWith(':publish')){liveId='5';if(lost){lost=false;throw new Error('secret transport response lost');}return Response.json({});}
  throw new Error(`unexpected fixture ${path}`);
 });
 const selection={accountId:'1',resourceId:'2',resourceName:'Web'};
 await assert.rejects(()=>provider.applyGtm('secret',selection,'store.example.com','operation',{},async p=>{checkpoints.push(p);}),(error:any)=>error.code==='provider_unavailable');
 const recovery=await provider.applyGtm('secret',selection,'store.example.com','operation',checkpoints.at(-1),async p=>{checkpoints.push(p);});
 assert.equal(recovery.tagId,'GTM-ABC123');assert.equal(writes.filter(w=>w.path.endsWith(':publish')).length,1);assert.ok(writes.every(w=>!w.path.endsWith('/tags/10')&&w.method!=='DELETE'));assert.equal(writes.find(w=>w.path.endsWith('/tags'))?.body.type,'gclidw');
});
test('Search Console rejects a different store domain before sending provider requests',async()=>{
 let calls=0;const provider=new GoogleMarketingProvider({},async()=>{calls++;return Response.json({});});
 await assert.rejects(()=>provider.applySearchConsole('secret',{accountId:'site',resourceId:'https://other.example.com/',resourceName:'Other',create:true},'store.example.com',{},async()=>{}),(error:any)=>error.code==='wrong_domain');assert.equal(calls,0);
});
test('Search Console checkpoints meta token before verification and retries without generating a new token',async()=>{
 const checkpoints:any[]=[];const calls:string[]=[];let confirmed=false;
 const provider=new GoogleMarketingProvider({},async(url)=>{const path=new URL(String(url)).pathname;calls.push(path);if(path.endsWith('/token'))return Response.json({token:'safe-meta-token'});if(path.endsWith('/webResource')){assert.equal(checkpoints[0]?.verificationToken,'safe-meta-token');return confirmed?Response.json({id:'verified'}):Response.json({error:{message:'ownership not proven; SECRET'}},{status:400});}return Response.json({});});
 const selection={accountId:'site',resourceId:'https://store.example.com/',resourceName:'Store',create:true};
 await assert.rejects(()=>provider.applySearchConsole('secret',selection,'store.example.com',{},async p=>{checkpoints.push(p);}),(error:any)=>error.code==='verification_pending'&&!String(error).includes('SECRET'));
 confirmed=true;const result=await provider.applySearchConsole('secret',selection,'store.example.com',checkpoints.at(-1),async p=>{checkpoints.push(p);});assert.equal(result.verificationToken,'safe-meta-token');assert.equal(calls.filter(p=>p.endsWith('/token')).length,1);assert.ok(calls.at(-1)?.includes('/sitemaps/'));
});
test('Search Console extracts only the content from the Google META response before checkpointing and retry',async()=>{
 const checkpoints:any[]=[];let tokenRequests=0;let confirmed=false;
 const provider=new GoogleMarketingProvider({},async(url)=>{const path=new URL(String(url)).pathname;
  if(path.endsWith('/token')){tokenRequests++;return Response.json({method:'META',token:'<meta name="google-site-verification" content="safe-meta-token" />'});}
  if(path.endsWith('/webResource')){assert.equal(checkpoints[0]?.verificationToken,'safe-meta-token');return confirmed?Response.json({id:'verified'}):Response.json({error:{message:'not propagated'}},{status:400});}
  return new Response(null,{status:204});
 });
 const selection={accountId:'site',resourceId:'https://store.example.com/',resourceName:'Store',create:true};
 await assert.rejects(()=>provider.applySearchConsole('access',selection,'store.example.com',{},async p=>{checkpoints.push(p);}),(error:any)=>error.code==='verification_pending');
 confirmed=true;
 const result=await provider.applySearchConsole('access',selection,'store.example.com',checkpoints.at(-1),async p=>{checkpoints.push(p);});
 assert.equal(result.verificationToken,'safe-meta-token');assert.equal(tokenRequests,1);assert.ok(checkpoints.every(p=>!/</.test(p.verificationToken)));
});
test('Search Console accepts quoted META attribute ordering but rejects executable or ambiguous HTML',async()=>{
 const selection={accountId:'site',resourceId:'https://store.example.com/',resourceName:'Store',create:true};
 for(const token of ["<meta content='safe-meta-token' name='google-site-verification'>",' <META name = "google-site-verification" content = "safe-meta-token"> ']){
  const checkpoints:any[]=[];const provider=new GoogleMarketingProvider({},async(url)=>new URL(String(url)).pathname.endsWith('/token')?Response.json({method:'META',token}):new Response(null,{status:204}));
  const result=await provider.applySearchConsole('access',selection,'store.example.com',{},async p=>{checkpoints.push(p);});assert.equal(result.verificationToken,'safe-meta-token');assert.equal(checkpoints[0].verificationToken,'safe-meta-token');
 }
 for(const token of ['<script>alert(1)</script><meta name="google-site-verification" content="safe-meta-token">','<meta name="google-site-verification" content="safe-meta-token" onload="alert(1)">','<meta name="other" content="safe-meta-token">','<meta name="google-site-verification" content="first" content="second">','<meta name="google-site-verification" content="bad&lt;token">','<meta name="google-site-verification" content="'+ 'a'.repeat(129) +'">']){
  let checkpoints=0;const provider=new GoogleMarketingProvider({},async()=>Response.json({method:'META',token}));
  await assert.rejects(()=>provider.applySearchConsole('access',selection,'store.example.com',{},async()=>{checkpoints++;}),(error:any)=>error.code==='provider_unavailable');assert.equal(checkpoints,0);
 }
});
test('Ads uses the effective conversion owner of the selected advertiser account',async()=>{
 const owners:string[]=[];const provider=new GoogleMarketingProvider({adsProjectId:'production-project'},async(url,init)=>{const path=new URL(String(url)).pathname;if(path.endsWith('customers:listAccessibleCustomers'))return Response.json({resourceNames:['customers/123']});const query=JSON.parse(String(init?.body)).query;if(query.includes('conversion_tracking_setting'))return Response.json({results:[{customer:{conversionTrackingSetting:{googleAdsConversionCustomer:'customers/999'}}}]});if(query.includes('FROM customer'))return Response.json({results:[{customer:{id:'123',descriptiveName:'Advertiser',manager:false}}]});owners.push(path);return Response.json({results:[{conversionAction:{id:'456',name:'Purchase',type:'WEBPAGE',category:'PURCHASE',status:'ENABLED',tagSnippets:[{eventSnippet:"gtag('event','conversion',{'send_to':'AW-999999/owner_Label'});"}]}}]});});
 const resources=await provider.resources('ads','access','123');assert.equal(resources.resources[0]?.tagId,'AW-999999');assert.ok(owners[0]?.includes('/customers/999/'));assert.equal(resources.resources[0]?.parentId,'123');
});
test('GTM refuses an unpublished latest draft instead of silently publishing another editor changes',async()=>{
 const writes:string[]=[];const provider=new GoogleMarketingProvider({},async(url,init)=>{const path=new URL(String(url)).pathname;if((init?.method??'GET')!=='GET')writes.push(path);if(path.endsWith('/accounts'))return Response.json({account:[{accountId:'1',name:'Tenant'}]});if(path.endsWith('/containers'))return Response.json({container:[{containerId:'2',name:'Web',publicId:'GTM-ABC123',usageContext:['web']}]});if(path.endsWith('/versions:live'))return Response.json({containerVersionId:'3',tag:[]});if(path.endsWith('/version_headers:latest'))return Response.json({containerVersionId:'4',name:'Unpublished other editor draft'});return Response.json({});});
 await assert.rejects(()=>provider.applyGtm('secret',{accountId:'1',resourceId:'2',resourceName:'Web'},'store.example.com','operation',{},async()=>{}),(error:any)=>error.code==='live_version_conflict');assert.equal(writes.length,0);
});
