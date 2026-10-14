import assert from 'node:assert/strict';
import test from 'node:test';
import { GoogleMerchantProvider, googleMerchantOfferRevision } from './provider.ts';

const storeId='10000000-0000-4000-8000-000000000001';
const offerId='40000000-0000-4000-8000-000000000001';
const offer={offerId,contentLanguage:'tr',feedLabel:'TR',title:'Pamuklu gömlek',description:'Mavi pamuklu gömlek',link:`https://store.example.com/products/gomlek?variant=${offerId}`,imageLink:'https://media.example.com/gomlek.webp',additionalImageLinks:[],price:{amountMicros:'99000000',currencyCode:'TRY'},availability:'in_stock',condition:'new',brand:'Gerçek Marka',gtin:'8680000000006',itemGroupId:'50000000-0000-4000-8000-000000000001',color:'Mavi',size:'M'} as const;
const errorCode=(code:string)=>(error:any)=>error.code===code&&!String(error).includes('SECRET');

test('Merchant rejects restricted and coupon GTIN ranges before any transmission',async()=>{
 let calls=0;const provider=new GoogleMerchantProvider(async()=>{calls++;return Response.json({});});
 const checked=(prefix:string)=>{const stem=prefix.padEnd(12,'0');let sum=0;for(let i=stem.length-1,w=3;i>=0;i--,w=w===3?1:3)sum+=Number(stem[i])*w;return stem+String((10-sum%10)%10);};
 for(const prefix of ['02','04','05','2','98','99']){
  const gtin=checked(prefix);
  await assert.rejects(()=>provider.sendProduct('SECRET','123','456',{...offer,gtin},1),errorCode('invalid_input'));
  await assert.rejects(()=>provider.sendProduct('SECRET','123','456',{...offer,gtin:'0'+gtin},1),errorCode('invalid_input'));
 }
 assert.equal(calls,0);
});

test('Merchant discovers Google-authorized accounts and rejects an unlisted caller selection',async()=>{
 const calls:string[]=[];const provider=new GoogleMerchantProvider(async url=>{calls.push(String(url));return Response.json({accounts:[{name:'accounts/123',accountId:'123',accountName:'My store',homePageUri:'https://store.example.com/'}]});});
 assert.deepEqual(await provider.resources('token'),{accounts:[{id:'123',name:'My store'}],resources:[]});
 await assert.rejects(()=>provider.resources('token','999'),errorCode('resource_denied'));
 assert.ok(calls.every(url=>new URL(url).hostname==='merchantapi.googleapis.com'));
});

test('Merchant setup rejects a foreign or unclaimed homepage before any Google mutation',async()=>{
 for(const homepage of [{uri:'https://other.example.com/',claimed:true},{uri:'https://store.example.com/',claimed:false}]){
  let writes=0;const provider=new GoogleMerchantProvider(async(url,init)=>{if((init?.method??'GET')!=='GET')writes++;const path=new URL(String(url)).pathname;return Response.json(path.endsWith('/accounts')?{accounts:[{accountId:'123',accountName:'Store'}]}:homepage);});
  await assert.rejects(()=>provider.setup('token',{accountId:'123',resourceId:'123',resourceName:'Caller title'},'store.example.com',storeId,{},async()=>{}),errorCode(homepage.claimed?'wrong_domain':'merchant_domain_unverified'));
  assert.equal(writes,0);
 }
});

test('Merchant accepts a claimed www homepage only after proving its redirect to the canonical store',async()=>{
 let proofs=0,posts=0;const progress:Record<string,unknown>[]=[];
 const provider=new GoogleMerchantProvider(async(url,init)=>{
  const path=new URL(String(url)).pathname;
  if(path.endsWith('/accounts'))return Response.json({accounts:[{accountId:'123',accountName:'Store'}]});
  if(path.endsWith('/homepage'))return Response.json({uri:'https://www.store.example.com',claimed:true});
  if(init?.method==='POST'){posts++;return Response.json({name:'accounts/123/dataSources/456',dataSourceId:'456',displayName:`Celebix ${storeId}`,input:'API',primaryProductDataSource:{feedLabel:'TR',contentLanguage:'tr',countries:['TR']}});}
  return Response.json({dataSources:[]});
 },async(homepage,canonical)=>{proofs++;assert.equal(homepage.hostname,'www.store.example.com');assert.equal(canonical,'store.example.com');return true;});
 const result=await provider.setup('SECRET',{accountId:'123',resourceId:'123',resourceName:'Store'},'store.example.com',storeId,{},async p=>{progress.push(p);});
 assert.equal(result.resourceId,'456');assert.equal(proofs,1);assert.equal(posts,1);
 assert.ok(progress.every(p=>p.merchantDomain==='store.example.com'));
});

test('Merchant www proof never permits other domains or malformed and unclaimed Google homepages',async()=>{
 for(const [uri,claimed,expected,proofsExpected]of [
  ['https://www.store.example.com/',true,'wrong_domain',1],
  ['https://other.example.com/',true,'wrong_domain',0],
  ['https://shop.store.example.com/',true,'wrong_domain',0],
  ['https://www.store.example.com.attacker.test/',true,'wrong_domain',0],
  ['http://www.store.example.com/',true,'wrong_domain',0],
  ['https://user@www.store.example.com/',true,'wrong_domain',0],
  ['https://www.store.example.com:444/',true,'wrong_domain',0],
  ['https://www.store.example.com/shop',true,'wrong_domain',0],
  ['https://www.store.example.com/?x=1',true,'wrong_domain',0],
  ['https://www.store.example.com/#x',true,'wrong_domain',0],
  ['https://www.store.example.com/',false,'merchant_domain_unverified',0],
 ] as const){
  let proofs=0,writes=0;const provider=new GoogleMerchantProvider(async(url,init)=>{
   if((init?.method??'GET')!=='GET')writes++;
   return Response.json(new URL(String(url)).pathname.endsWith('/accounts')?{accounts:[{accountId:'123',accountName:'Store'}]}:{uri,claimed});
  },async()=>{proofs++;return false;});
  await assert.rejects(()=>provider.setup('SECRET',{accountId:'123',resourceId:'123',resourceName:'Store'},'store.example.com',storeId,{},async()=>{}),errorCode(expected));
  assert.equal(writes,0);assert.equal(proofs,proofsExpected,uri);
 }
});

test('Merchant refuses a caller data source that was never selected from its owned source before creation',async()=>{
 let writes=0;const provider=new GoogleMerchantProvider(async(url,init)=>{if((init?.method??'GET')!=='GET')writes++;const path=new URL(String(url)).pathname;return Response.json(path.endsWith('/accounts')?{accounts:[{accountId:'123',accountName:'Store'}]}:path.endsWith('/homepage')?{uri:'https://store.example.com/',claimed:true}:{dataSources:[]});});
 await assert.rejects(()=>provider.setup('token',{accountId:'123',resourceId:'999',resourceName:'Caller title'},'store.example.com',storeId,{},async()=>{}),errorCode('resource_denied'));
 assert.equal(writes,0);
});

test('Merchant resumes an uncertain owned source creation using its marker, without touching external sources',async()=>{
 let created=false,posts=0;const progress:any[]=[];const provider=new GoogleMerchantProvider(async(url,init)=>{
  const path=new URL(String(url)).pathname;if(path.endsWith('/accounts'))return Response.json({accounts:[{accountId:'123',accountName:'Store'}]});
  if(path.endsWith('/homepage'))return Response.json({name:'accounts/123/homepage',uri:'https://store.example.com/',claimed:true});
  if(path.endsWith('/dataSources')&&(init?.method??'GET')==='POST'){posts++;created=true;throw Error('SECRET lost response');}
  if(path.endsWith('/dataSources'))return Response.json({dataSources:[{name:'accounts/123/dataSources/1',dataSourceId:'1',displayName:'External feed',input:'API',primaryProductDataSource:{feedLabel:'TR',contentLanguage:'tr',countries:['TR']}},...(created?[{name:'accounts/123/dataSources/456',dataSourceId:'456',displayName:`Celebix ${storeId}`,input:'API',primaryProductDataSource:{feedLabel:'TR',contentLanguage:'tr',countries:['TR']}}]:[])]});
  throw Error('Unexpected fixture endpoint');
 });
 const selection={accountId:'123',resourceId:'123',resourceName:'Caller title'};
 await assert.rejects(()=>provider.setup('token',selection,'store.example.com',storeId,{},async p=>{progress.push(p);}),errorCode('provider_unavailable'));
 const resumed=await provider.setup('token',selection,'store.example.com',storeId,progress.at(-1)??{},async p=>{progress.push(p);});
 assert.equal(resumed.resourceId,'456');assert.equal(resumed.resourceName,'Store');assert.equal(posts,1);assert.equal(progress.at(-1).merchantDataSourceId,'456');assert.equal(progress.at(-1).merchantDomain,'store.example.com');
});

test('Merchant retries the same operation after a definitive business prerequisite rejection',async()=>{
 let ready=false,posts=0;let progress:Record<string,unknown>={};
 const provider=new GoogleMerchantProvider(async(url,init)=>{
  const path=new URL(String(url)).pathname;if(path.endsWith('/accounts'))return Response.json({accounts:[{accountId:'123',accountName:'Store'}]});
  if(path.endsWith('/homepage'))return Response.json({uri:'https://store.example.com/',claimed:true});
  if(path.endsWith('/dataSources')&&(init?.method??'GET')==='POST'){posts++;return ready?Response.json({name:'accounts/123/dataSources/456',dataSourceId:'456',displayName:`Celebix ${storeId}`,input:'API',primaryProductDataSource:{contentLanguage:'tr',feedLabel:'TR',countries:['TR']}}):Response.json({error:{details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:'INVALID_DESTINATION_NOT_ENABLED'}]}},{status:400});}
  return Response.json({dataSources:[]});
 });
 const selection={accountId:'123',resourceId:'123',resourceName:'Store'},checkpoint=async(p:Record<string,unknown>)=>{progress=p;};
 await assert.rejects(()=>provider.setup('token',selection,'store.example.com',storeId,progress,checkpoint),errorCode('merchant_business_incomplete'));
 assert.deepEqual(progress,{merchantDomain:'store.example.com'});ready=true;
 assert.equal((await provider.setup('token',selection,'store.example.com',storeId,progress,checkpoint)).resourceId,'456');assert.equal(posts,2);
});

test('Merchant product upload uses fixed v1 source and honest variant attributes, without leaking unrelated data',async()=>{
 let captured:any;const provider=new GoogleMerchantProvider(async(url,init)=>{captured={url:String(url),init,body:JSON.parse(String(init?.body))};return Response.json({name:`accounts/123/productInputs/tr~TR~${offerId}`,product:`accounts/123/products/tr~TR~${offerId}`,offerId,contentLanguage:'tr',feedLabel:'TR'});});
 assert.deepEqual(await provider.sendProduct('SECRET','123','456',offer,1),{productId:`tr~TR~${offerId}`});
 assert.equal(new URL(captured.url).pathname,'/products/v1/accounts/123/productInputs:insert');assert.equal(new URL(captured.url).searchParams.get('dataSource'),'accounts/123/dataSources/456');
 assert.equal(captured.body.productAttributes.availability,'IN_STOCK');assert.equal(captured.body.productAttributes.gtins[0],offer.gtin);assert.equal(captured.body.productAttributes.mpn,undefined);assert.equal(captured.body.productAttributes.price.currencyCode,'TRY');
 assert.equal(captured.body.versionNumber,'1');
 assert.equal(captured.body.productAttributes.customLabel4,`cbxrev_${googleMerchantOfferRevision(offer)}`);
 assert.equal(captured.init.redirect,'error');assert.ok(captured.init.signal instanceof AbortSignal);assert.doesNotMatch(JSON.stringify(captured.body),/SECRET|customer|phone|cost/);
});

test('Merchant processed status carries the exact export revision and price changes produce a new revision',async()=>{
 const revision=googleMerchantOfferRevision(offer);assert.match(revision,/^[a-f0-9]{64}$/);
 assert.notEqual(googleMerchantOfferRevision({...offer,price:{...offer.price,amountMicros:'100000000'}}),revision);
 assert.equal(googleMerchantOfferRevision({...offer}),revision);
 const base={name:`accounts/123/products/tr~TR~${offerId}`,offerId,contentLanguage:'tr',feedLabel:'TR',dataSource:'accounts/123/dataSources/456'};
 for(const [label,expected]of [[`cbxrev_${revision}`,revision],['foreign',null],[undefined,null]] as const){
  const provider=new GoogleMerchantProvider(async()=>Response.json({...base,productAttributes:{customLabel4:label}}));assert.equal((await provider.getProduct('SECRET','123',`tr~TR~${offerId}`))!.revision,expected);
 }
});

test('Merchant rejects internal barcode and mismatched response identity instead of claiming submission',async()=>{
 let calls=0;const provider=new GoogleMerchantProvider(async()=>{calls++;return Response.json({name:'accounts/999/productInputs/tr~TR~foreign',product:'accounts/999/products/tr~TR~foreign'});});
 await assert.rejects(()=>provider.sendProduct('SECRET','123','456',{...offer,gtin:'9800000000004'},1),errorCode('invalid_input'));assert.equal(calls,0);
 await assert.rejects(()=>provider.sendProduct('SECRET','123','456',offer,1),errorCode('provider_unavailable'));
});

test('Merchant refuses contradictory identifiers and all-zero GTIN before transport',async()=>{
 let calls=0;const provider=new GoogleMerchantProvider(async()=>{calls++;return Response.json({});});
 for(const invalid of [{...offer,gtin:'0000000000000'},{...offer,identifierExists:false},{...offer,gtin:undefined,mpn:'manufacturer-part',identifierExists:false}])await assert.rejects(()=>provider.sendProduct('SECRET','123','456',invalid,1),errorCode('invalid_input'));
 assert.equal(calls,0);
});

test('Merchant status is approved only from Google free listing evidence for Turkey',async()=>{
 const base={name:`accounts/123/products/tr~TR~${offerId}`,offerId,contentLanguage:'tr',feedLabel:'TR',dataSource:'accounts/123/dataSources/456'};
 for(const [productStatus,status]of [[{},'pending'],[{destinationStatuses:[{reportingContext:'SHOPPING_ADS',approvedCountries:['TR']}]},'pending'],[{destinationStatuses:[{reportingContext:'FREE_LISTINGS',approvedCountries:['US']}]},'pending'],[{destinationStatuses:[{reportingContext:'FREE_LISTINGS',approvedCountries:['TR']}]},'approved'],[{destinationStatuses:[{reportingContext:'FREE_LISTINGS',disapprovedCountries:['TR']}]},'disapproved']] as const){
  const provider=new GoogleMerchantProvider(async()=>Response.json({...base,productStatus}));assert.equal((await provider.getProduct('SECRET','123',`tr~TR~${offerId}`))!.status,status);
 }
 const missing=new GoogleMerchantProvider(async()=>new Response(null,{status:404}));assert.equal(await missing.getProduct('SECRET','123',`tr~TR~${offerId}`),null);
});

test('Merchant developer/API prerequisites are actionable and provider details remain private',async()=>{
 for(const [status,payload,code]of [[401,{error:{message:'GCP project with id SECRET and number 123 is not registered with the merchant account.'}},'merchant_developer_unregistered'],[403,{error:{details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:'SERVICE_DISABLED'}]}},'merchant_api_disabled'],[403,{error:{details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:'PERMISSION_DENIED_TERMS_OF_SERVICE_UNSIGNED'}]}},'merchant_business_incomplete'],[401,{error:{message:'SECRET token expired'}},'needs_reconnect']] as const){
  const provider=new GoogleMerchantProvider(async()=>Response.json(payload,{status}));await assert.rejects(()=>provider.resources('SECRET'),errorCode(code));
 }
});

test('Merchant rejects unsafe freshness generations before sending a versioned primary insertion',async()=>{
 let calls=0;const provider=new GoogleMerchantProvider(async()=>{calls++;return Response.json({});});
 for(const generation of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1,NaN,'1'] as const)await assert.rejects(()=>provider.sendProduct('SECRET','123','456',offer,generation as number),errorCode('invalid_input'));
 assert.equal(calls,0);
});
