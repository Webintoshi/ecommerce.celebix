import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlatformCommerceService } from './service.ts';
import { commerceDigest, sealCommercePayload } from './security.ts';

const ORDER='c4973846-bd22-434e-9b3b-a7d73ff7780a', ATTEMPT='9c235982-90a8-4a54-8ea7-b69759cf282c';
const KEY=Buffer.alloc(32,31), FINGERPRINT='a'.repeat(64), SESSION='b'.repeat(64), TOKEN='f4c65fb6-8846-44eb-8d0b-02ec9b91f8ac';
const order={orderId:ORDER,storeId:'861db050-3883-4476-828b-af5cf9325b07',storeName:'Test mağazası',storeSlug:'test-magazasi',kind:'tool',offerId:'contact_widget',offerName:'İletişim balonu',term:'once',netCents:99000,vatBps:2000,vatCents:19800,totalCents:118800,currency:'TRY',status:'processing',createdAt:'2026-10-26T10:00:00Z',expiresAt:'2026-10-27T10:00:00Z',attempt:{attemptId:ATTEMPT,status:'initializing'}};
const buyer={id:ORDER,name:'Ada',surname:'Örnek',identityNumber:'74300864791',email:'buyer@example.test',gsmNumber:'+905551112233',registrationAddress:'Örnek Mahallesi No 1',city:'Ordu',country:'Turkey'};
const start={orderId:ORDER,sessionDigest:SESSION,attemptId:ATTEMPT,buyer,ip:'203.0.113.20'};
const provider={token:TOKEN,paymentPageUrl:`https://cpp.iyzipay.com/?token=${TOKEN}&lang=tr`,expiresAt:'2026-10-26T10:30:00Z',credentialFingerprint:FINGERPRINT};
const attempt=(status='initializing')=>({attemptId:ATTEMPT,status,requestDigest:'c'.repeat(64),sealedBuyer:sealCommercePayload({buyer,ip:start.ip,credentialFingerprint:FINGERPRINT},KEY,`buyer:${ATTEMPT}`),tokenDigest:null as string|null,sealedProvider:null as string|null,expiresAt:null as string|null});
const ready=()=>({...attempt('ready'),tokenDigest:commerceDigest(TOKEN),sealedProvider:sealCommercePayload(provider,KEY,`provider:${ATTEMPT}`),expiresAt:provider.expiresAt});
const config=(command:any,gateway:any)=>({command,gateway,dataKey:KEY,credentialFingerprint:FINGERPRINT,now:()=>new Date('2026-10-26T10:05:00Z')});

test('a ready attempt resumes its own provider page without another initialize call',async()=>{
 let initialized=0;
 const service=createPlatformCommerceService(config(async()=>({outcome:'attempt_replayed',result_payload:{order,attempt:ready()}}),{initialize:async()=>{initialized++;throw Error('must not initialize');},retrieve:async()=>({status:'unknown'})}));
 assert.deepEqual(await service.execute('start',start),{status:'ready',paymentUrl:provider.paymentPageUrl});
 assert.equal(initialized,0);
});

test('an ambiguous provider initialization is recorded once and never automatically retried',async()=>{
 let initialized=0;const commands:any[]=[];
 const service=createPlatformCommerceService(config(async(action:any,args:any)=>{commands.push({action,args});return {outcome:action==='begin'?'initialization_claimed':'initialized',result_payload:{order,attempt:attempt()}};},{initialize:async()=>{initialized++;return{status:'unknown',code:'provider_unavailable'};},retrieve:async()=>({status:'unknown'})}));
 assert.deepEqual(await service.execute('start',start),{status:'unknown',code:'provider_unavailable'});
 assert.equal(initialized,1);
 assert.equal(commands[1].action,'initialized');assert.equal(commands[1].args.status,'unknown');
 assert.equal(JSON.stringify(commands).includes(buyer.identityNumber),false);
});

test('an unverified callback never settles a purchase or selects a latest order',async()=>{
 const commands:string[]=[];
 const service=createPlatformCommerceService(config(async(action:any)=>{commands.push(action);return{outcome:'found',result_payload:{order,attempt:ready()}};},{initialize:async()=>{throw Error();},retrieve:async()=>({status:'unknown',code:'provider_unavailable'})}));
 assert.deepEqual(await service.execute('callback',{attemptId:ATTEMPT,token:TOKEN}),{orderId:ORDER,state:'pending'});
 assert.deepEqual(commands,['lookup']);
});

test('signed approval is bound to the exact order, attempt and gross amount before native fulfillment',async()=>{
 const commands:any[]=[];
 const service=createPlatformCommerceService(config(async(action:any,args:any)=>{commands.push({action,args});return {outcome:action==='finish'?'fulfilled':'found',result_payload:{order:{...order,status:action==='finish'?'fulfilled':'processing'},attempt:ready()}};},{initialize:async()=>{throw Error();},retrieve:async()=>({status:'payment',paymentStatus:'approved',paymentId:'1267890',token:TOKEN,itemTransactions:[{itemId:ORDER,paymentTransactionId:'987654',priceCents:118800,paidPriceCents:118800}]})}));
 assert.deepEqual(await service.execute('callback',{attemptId:ATTEMPT,token:TOKEN}),{orderId:ORDER,state:'approved'});
 const proof=commands[1].args;
 assert.equal(proof.orderId,ORDER);assert.equal(proof.attemptId,ATTEMPT);assert.equal(proof.tokenDigest,commerceDigest(TOKEN));
 assert.equal(proof.priceCents,118800);assert.equal(proof.paidPriceCents,118800);assert.equal(proof.currency,'TRY');assert.equal(proof.fraudStatus,1);
 assert.deepEqual(proof.itemTransactions,[{itemId:ORDER,transactionId:'987654',priceCents:118800,paidPriceCents:118800}]);
});

test('read returns only the public order and never the encrypted buyer, bank token or credential fingerprint',async()=>{
 const service=createPlatformCommerceService(config(async()=>({outcome:'found',result_payload:{order:{...order,status:'fulfilled'},attempt:ready()}}),{initialize:async()=>{throw Error();},retrieve:async()=>{throw Error();}}));
 const result=await service.execute('read',{orderId:ORDER,sessionDigest:SESSION});
 assert.equal(result.order.id,ORDER);assert.equal(result.order.state,'approved');
 for(const privateValue of [buyer.identityNumber,TOKEN,FINGERPRINT,'sealedBuyer','sealedProvider'])assert.equal(JSON.stringify(result).includes(privateValue),false);
});

test('rotated credentials and altered ciphertext cannot resume or settle a prior payment',async()=>{
 const corrupt={...ready(),sealedProvider:sealCommercePayload({...provider,credentialFingerprint:'d'.repeat(64)},KEY,`provider:${ATTEMPT}`)};
 const service=createPlatformCommerceService(config(async()=>({outcome:'attempt_replayed',result_payload:{order,attempt:corrupt}}),{initialize:async()=>{throw Error();},retrieve:async()=>{throw Error();}}));
 await assert.rejects(service.execute('start',start),/platform_commerce_unavailable/);
});

test('a verified callback recovers an ambiguous initialization without another initialize',async()=>{
 const commands:any[]=[];
 const service=createPlatformCommerceService(config(async(action:any,args:any)=>{commands.push({action,args});return{outcome:action==='finish'?'pending':'found',result_payload:{order,attempt:attempt('unknown')}};},{initialize:async()=>{throw Error('must not initialize');},retrieve:async()=>({status:'payment',paymentStatus:'pending',paymentId:'1267890',token:TOKEN,itemTransactions:[{itemId:ORDER,paymentTransactionId:'987654',priceCents:118800,paidPriceCents:118800}]})}));
 assert.deepEqual(await service.execute('callback',{attemptId:ATTEMPT,token:TOKEN}),{orderId:ORDER,state:'pending'});
 assert.equal(typeof commands[1].args.sealedProvider,'string');
 assert.equal(commands[1].args.sealedProvider.includes(TOKEN),false);
});

test('a lost start response can resume the same ready payment from a scoped read',async()=>{
 let initialized=0;
 const service=createPlatformCommerceService(config(async()=>({outcome:'found',result_payload:{order,attempt:ready()}}),{initialize:async()=>{initialized++;throw Error();},retrieve:async()=>({status:'unknown',code:'provider_unavailable'})}));
 const result=await service.execute('read',{orderId:ORDER,sessionDigest:SESSION});
 assert.equal(result.order.paymentUrl,provider.paymentPageUrl);assert.equal(initialized,0);
});

for (const status of ['failed','fulfilled'] as const) test(`a late callback for a different pending attempt is reconciled when the order is ${status}`,async()=>{
 const commands:string[]=[];
 const service=createPlatformCommerceService(config(async(action:any)=>{commands.push(action);return{outcome:action==='finish'?'paid_review':'found',result_payload:{order:{...order,status:action==='finish'?'paid_review':status},attempt:ready()}};},{initialize:async()=>{throw Error();},retrieve:async()=>({status:'payment',paymentStatus:'approved',paymentId:'1267890',token:TOKEN,itemTransactions:[{itemId:ORDER,paymentTransactionId:'987654',priceCents:118800,paidPriceCents:118800}]})}));
 assert.deepEqual(await service.execute('callback',{attemptId:ATTEMPT,token:TOKEN}),{orderId:ORDER,state:'review'});
 assert.deepEqual(commands,['lookup','finish']);
});

test('a valid webhook only acknowledges a bank-verified result and native settlement',async()=>{
 const calls:string[]=[];
 const service=createPlatformCommerceService({...config(async(action:any)=>{calls.push(action);return{outcome:action==='finish'?'fulfilled':'found',result_payload:{order:{...order,status:action==='finish'?'fulfilled':'processing'},attempt:ready()}};},{initialize:async()=>{throw Error();},retrieve:async()=>({status:'payment',paymentStatus:'approved',paymentId:'1267890',token:TOKEN,itemTransactions:[{itemId:ORDER,paymentTransactionId:'987654',priceCents:118800,paidPriceCents:118800}]})}),verifyWebhook:()=>({attemptId:ATTEMPT,token:TOKEN})});
 assert.deepEqual(await service.execute('webhook',{body:'{}',signature:'a'.repeat(64)}),{ok:true});
 assert.deepEqual(calls,['lookup','finish']);
});

test('a webhook is not acknowledged during an uncertain bank retrieval so iyzico can retry',async()=>{
 const calls:string[]=[];
 const service=createPlatformCommerceService({...config(async(action:any)=>{calls.push(action);return{outcome:'found',result_payload:{order,attempt:ready()}};},{initialize:async()=>{throw Error();},retrieve:async()=>({status:'unknown',code:'provider_unavailable'})}),verifyWebhook:()=>({attemptId:ATTEMPT,token:TOKEN})});
 await assert.rejects(service.execute('webhook',{body:'{}',signature:'a'.repeat(64)}),/platform_commerce_unavailable/);
 assert.deepEqual(calls,['lookup']);
});

test('an invalid webhook signature cannot look up or settle a purchase',async()=>{
 let commands=0;
 const service=createPlatformCommerceService({...config(async()=>{commands++;throw Error();},{initialize:async()=>{throw Error();},retrieve:async()=>{throw Error();}}),verifyWebhook:()=>null});
 await assert.rejects(service.execute('webhook',{body:'{}',signature:'a'.repeat(64)}),/platform_commerce_unavailable/);
 assert.equal(commands,0);
});
