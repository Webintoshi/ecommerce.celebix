import {calculateTrendyolPrice,parseTrendyolListingInput,trendyolInteger,trendyolUuid} from '@celebix/saas-contracts';
import {openTrendyolCredential} from './credential.ts';
import {TrendyolProviderError,type TrendyolProvider} from './provider.ts';
import {trendyolFence,trendyolFingerprint,type TrendyolJob,type TrendyolWorkflowRepository} from './repository.ts';
import type {MerchantProviderCredentialKeyring} from '../provider-execution/credential-crypto.ts';

type Provider=Pick<TrendyolProvider,'submitInventory'|'createProducts'|'productOrNull'|'product'|'batch'|'getInventory'|'orderStream'|'getOrder'|'registerWebhook'>;
type Options=Readonly<{repository:TrendyolWorkflowRepository;provider:Provider;keyring:MerchantProviderCredentialKeyring;panelOrigin:string;now?:()=>Date}>;
type Item=Record<string,unknown>;
type Outcome={variantId:string;status:'submitted'|'active'|'failed';mappingVersion:number;fingerprint?:string;requiresApproval?:boolean;requiresInventory?:boolean;requeue?:boolean;issue?:string};
function object(value:unknown):Item {if(!value||typeof value!=='object'||Array.isArray(value))throw new TrendyolProviderError('invalid_input');return value as Item;}
function items(value:unknown):Item[]{if(!Array.isArray(value)||value.length>50)throw new TrendyolProviderError('invalid_input');return value.map(object);}
function iso(value:unknown):string {if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new TrendyolProviderError('invalid_input');return new Date(value).toISOString();}
function text(value:unknown,max:number):string {if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value))throw new TrendyolProviderError('invalid_input');return value;}
export async function processTrendyolJobs(options:Options):Promise<{claimed:number;completed:number;deferred:number;stale:number}>{
 const now=options.now??(()=>new Date()),repository=options.repository,provider=options.provider;
 const jobs=await repository.claim(now(),2),stats={claimed:jobs.length,completed:0,deferred:0,stale:0};
 // Two native leases globally; each job bounds approval lookups so the120s lease is not stretched.
 await Promise.all(jobs.map(async claimed=>{
  const fence=trendyolFence(claimed);let wrote=false;
  const fresh=async()=>{const job=await repository.read(fence,now());if(!job)throw new StaleJob();return job;};
  try{
   const job=await fresh(),credential=openTrendyolCredential({storeId:job.storeId,version:job.credentialVersion,envelope:job.credential,keyring:options.keyring});
   if(credential.sellerId!==job.sellerId)throw new TrendyolProviderError('needs_reconnect');
   const finish=async(result:Item)=>{await repository.complete(fence,result,now());stats.completed++;};
   if(job.kind==='setup'){
    const base=new URL(options.panelOrigin);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new TrendyolProviderError('invalid_input');
    const url=new URL('/api/hooks/marketplace/'+trendyolUuid(job.storeId),base).toString();if(/trendyol|dolap|localhost/i.test(url))throw new TrendyolProviderError('invalid_input');
    await fresh();await provider.registerWebhook(credential,{url,secret:credential.webhookSecret});await finish({});return;
   }
   if(job.kind==='orders'){
    const page=await provider.orderStream(credential,{start:iso(job.payload.start),end:iso(job.payload.end),cursor:job.payload.cursor===null?null:text(job.payload.cursor,10000)});
    const orderNumbers=[...new Set(page.packages.map(p=>p.orderNumber))];
    if(page.hasMore!==Boolean(page.nextCursor))throw new TrendyolProviderError('order_evidence_invalid');
    await finish({orderNumbers,cursor:page.nextCursor,...(page.nextCursor?{}:{nextStart:iso(job.payload.end)})});return;
   }
   if(job.kind==='order'){
    const result=await provider.getOrder(credential,text(job.payload.orderNumber,200));await fresh();
    await repository.importPackages(fence,result.packages,now());await finish({});return;
   }
   if(job.kind==='batch'){
    const original=items(job.payload.items),outcomes:Outcome[]=[],previous=Array.isArray(job.payload.outcomes)?items(job.payload.outcomes):[];
    const batchComplete=job.payload.batchComplete===true;
    let batch:Awaited<ReturnType<Provider['batch']>>|null;
    try{batch=batchComplete?null:await provider.batch(credential,text(job.payload.batchId,200));}
    catch(error){
     if(!(error instanceof TrendyolProviderError)||error.httpStatus!==404)throw error;
     // Expired batch evidence does not authorize replaying the original write.
     const expired:Outcome[]=original.map(item=>{
      const variantId=trendyolUuid(item.variantId),mappingVersion=trendyolInteger(item.mappingVersion,1,Number.MAX_SAFE_INTEGER),prior=previous.find(p=>p.variantId===variantId);
      const settled=prior?.status==='active'||prior?.status==='failed';
      return {variantId,mappingVersion,status:settled?prior.status as 'active'|'failed':'failed',...(typeof item.requiresApproval==='boolean'?{requiresApproval:item.requiresApproval}:{}),...(typeof item.fingerprint==='string'?{fingerprint:item.fingerprint}:{}),...(!settled||prior.issue==='provider_outcome_unknown'?{issue:'provider_outcome_unknown'}:{})};
     });
     await finish({items:expired,pending:false,batchComplete:true});return;
    }
    let lookups=0;
    for(const item of original){
     const variantId=trendyolUuid(item.variantId),mappingVersion=trendyolInteger(item.mappingVersion,1,Number.MAX_SAFE_INTEGER),mapping=parseTrendyolListingInput(item.mapping);
     const prior=previous.find(p=>p.variantId===variantId),result=batch?.items.find(p=>p.barcode===mapping.barcode);
     let status:Outcome['status']='submitted';
     if(prior?.status==='active'||prior?.status==='failed')status=prior.status;
     else if(result?.status==='failed')status='failed';
     else if(batchComplete||result?.status==='success'){
      if(item.requiresApproval===false)status='active';
      else if(lookups++<4){const product=await provider.product(credential,mapping.barcode);if(product.approved&&!product.archived)status='active';else if(product.archived)status='failed';}
     }else if(batch?.complete)status='failed'; // A complete response must account for every submitted barcode.
     const requeue=status==='active'&&item.requiresInventory===true;
     outcomes.push({variantId,mappingVersion,status,...(typeof item.requiresApproval==='boolean'?{requiresApproval:item.requiresApproval}:{}),...(item.requiresInventory===true?{requiresInventory:true}:{}),...(requeue?{requeue:true}:typeof item.fingerprint==='string'?{fingerprint:item.fingerprint}:{})});
    }
    await finish({items:outcomes,pending:outcomes.some(o=>o.status==='submitted'),batchComplete:batchComplete||batch?.complete===true});return;
   }
   const catalog=items(job.payload.items),outcomes:Outcome[]=[],inventory:{barcode:string;quantity:number;salePriceCents?:number}[]=[],creation:Item[]=[],submitted:Outcome[]=[];
   let group:'inventory'|'create'|null=null,lookups=0;
   for(const item of catalog){
    const variantId=trendyolUuid(item.variantId),mappingVersion=trendyolInteger(item.mappingVersion,1,Number.MAX_SAFE_INTEGER),base={variantId,mappingVersion};
    // An unknown queued write may still apply later; neither an old fingerprint nor a current read proves settlement.
    if(item.issue==='provider_outcome_unknown'){outcomes.push({...base,status:'failed',issue:'provider_outcome_unknown'});continue;}
    let mapping;try{mapping=parseTrendyolListingInput(item.mapping);}catch{outcomes.push({...base,status:'failed'});continue;}
    const withdraw=!mapping.enabled||item.webPriceCents===null;
    let quantity=withdraw?0:Math.min(trendyolInteger(item.quantity,0,Number.MAX_SAFE_INTEGER),20000);
    const target=withdraw?{barcode:mapping.barcode,quantity}:{barcode:mapping.barcode,quantity,salePriceCents:calculateTrendyolPrice(trendyolInteger(item.webPriceCents,1,999999999999),{...job.pricing,productVatBps:mapping.vatRate*100}).salePriceCents};
    const fingerprint=trendyolFingerprint(target),outcome:Outcome={...base,status:'submitted',fingerprint};
    if(item.lastPayloadFingerprint===fingerprint){outcomes.push({...outcome,status:'active'});continue;}
    if(withdraw&&mapping.mode==='create'&&item.providerSubmitted!==true){outcomes.push({...outcome,status:'active'});continue;}
    let create=mapping.mode==='create'&&item.providerSubmitted!==true&&!withdraw;
    if(create){
     if(group==='inventory'||lookups>=4)continue;lookups++;
     const existing=await provider.productOrNull(credential,mapping.barcode);
     if(existing){
      if(existing.archived){outcomes.push({...outcome,status:'failed'});continue;}
      if(!existing.approved){outcomes.push({...outcome,requiresApproval:true,requiresInventory:true});continue;}
      create=false;
     }
    }
    const nextGroup=create?'create':'inventory';if(group&&group!==nextGroup)continue;group=nextGroup;
    if(create){
     try{
      const images=Array.isArray(item.images)?item.images.slice(0,8):[];
      if(images.length<1||images.length>8)throw TypeError();
      const attrs=mapping.attributes.map(a=>a.valueId===undefined?{attributeId:a.attributeId,attributeValue:a.value}:{attributeId:a.attributeId,attributeValueIds:[a.valueId]});
      if(!attrs.length)throw TypeError();
      creation.push({barcode:mapping.barcode,title:text(item.title,100),description:text(item.description,30000),productMainId:trendyolUuid(item.productId),brandId:mapping.brandId,categoryId:mapping.categoryId,quantity,vatRate:mapping.vatRate,listPrice:('salePriceCents'in target?target.salePriceCents!:0)/100,salePrice:('salePriceCents'in target?target.salePriceCents!:0)/100,dimensionalWeight:mapping.dimensionalWeight,images:images.map(url=>({url:text(url,2048)})),attributes:attrs,cargoProviders:[mapping.cargoProviderCode],...(typeof item.sku==='string'&&item.sku?{stockCode:item.sku}:{})});submitted.push({...outcome,requiresApproval:true});
     }catch{outcomes.push({...outcome,status:'failed'});}
    }else{inventory.push(target);submitted.push({...outcome,requiresApproval:false});}
   }
   if(submitted.length){
    await fresh();if(!await repository.beginDispatch(fence,now()))throw new StaleJob();wrote=true;
    const batch=creation.length?await provider.createProducts(credential,creation):await provider.submitInventory(credential,inventory);
    await finish({batchId:batch.batchId,items:[...outcomes,...submitted]});
   }else await finish({items:outcomes});
  }catch(error){
   if(error instanceof StaleJob){stats.stale++;return;}
   let code=error instanceof TrendyolProviderError?error.code:'provider_unavailable';
   // Lost persistence or a conflicting queued write requires reconciliation before another POST.
   if(wrote&&(!(error instanceof TrendyolProviderError)||code==='provider_conflict'))code='provider_outcome_unknown';
   const delay=error instanceof TrendyolProviderError?error.retryAfterSeconds??60:60;
   try{await repository.defer(fence,code,now(),Math.min(delay,3600));stats.deferred++;}catch{/* Lease expiry safely hands work back to the durable queue. */}
  }
 }));return stats;
}
class StaleJob extends Error{}
