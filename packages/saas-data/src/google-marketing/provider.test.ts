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
