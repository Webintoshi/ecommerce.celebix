import {randomUUID} from 'node:crypto';
import type {GoogleMerchantJobRepository} from '@celebix/saas-data';
import type {GoogleMerchantIssue} from '@celebix/saas-contracts';
import {openGoogleCredential,sealGoogleCredential,type GoogleCredential,type GoogleMarketingCredentialKeyring} from '../../../../packages/saas-data/src/google-marketing/credential-crypto.ts';
import {googleMarketingErrorCode} from '../../../../packages/saas-data/src/google-marketing/errors.ts';
import {GoogleMerchantProvider,googleMerchantOfferRevision} from '../../../../packages/saas-data/src/google-merchant/provider.ts';
type Options=Readonly<{repository:GoogleMerchantJobRepository;provider:Pick<GoogleMerchantProvider,'sendProduct'|'getProduct'|'deleteProduct'>;keyring:GoogleMarketingCredentialKeyring;refreshCredential(credential:GoogleCredential,now:Date):Promise<GoogleCredential>;now?:()=>Date;limit?:number}>;
export async function runGoogleMerchantWorkerOnce(options:Options):Promise<Readonly<{claimed:number;finished:number;deferred:number;stale:number}>>{
 const now=options.now??(()=>new Date()),limit=options.limit??2;
 if(!Number.isSafeInteger(limit)||limit<1||limit>2)throw TypeError('merchant_worker_limit_invalid');
 const jobs=await options.repository.claim({now:now(),limit,leaseId:randomUUID()});
 const counts={claimed:jobs.length,finished:0,deferred:0,stale:0};
 await Promise.all(jobs.map(async candidate=>{
  let job=candidate;
  try{
   const fresh=await options.repository.read({job,now:now()});if(!fresh){counts.stale++;return;}job=fresh;
   let credential=openGoogleCredential(job.credential,job.storeId,'merchant',options.keyring);
   if(!credential.scopes.includes('https://www.googleapis.com/auth/content'))throw TypeError('merchant_scope_invalid');
   if(Date.parse(credential.expiresAt)<=now().getTime()+60000){credential=await options.refreshCredential(credential,now());const result=await options.repository.saveCredential({job,now:now(),credential:sealGoogleCredential(credential,job.storeId,'merchant',options.keyring),subject:credential.subject});if(result==='stale'){counts.stale++;return;}}
   // Refreshing credentials may take long enough for the store policy or host to change.
   const authorized=await options.repository.read({job,now:now()});if(!authorized){counts.stale++;return;}job=authorized;
   const expectedId=`tr~TR~${job.variantId}`;
   if(job.googleProductId&&job.googleProductId!==expectedId)throw TypeError('merchant_product_identity_invalid');
   if(job.action==='delete'||!job.projection){
    // An earlier timed-out upsert may exist even when local acknowledgement is absent.
    await options.provider.deleteProduct(credential.accessToken,job.accountId,job.dataSourceId,expectedId);
    const result=await options.repository.finish({job,now:now(),result:job.issues.length?'excluded':'withdrawn',issues:job.issues});result==='stale'?counts.stale++:counts.finished++;return;
   }
   if(job.projection.offerId!==job.variantId||new URL(job.projection.link).hostname!==job.domain)throw TypeError('merchant_product_authority_invalid');
   if(job.action==='status'&&!job.renewal){
    const product=await options.provider.getProduct(credential.accessToken,job.accountId,expectedId);
    if(!product||product.revision!==googleMerchantOfferRevision(job.projection)||product.status==='pending'){
     const result=await options.repository.finish({job,now:now(),result:'pending',googleProductId:expectedId});result==='stale'?counts.stale++:counts.finished++;return;
    }
    if(product.offerId!==job.variantId||product.dataSourceId!==job.dataSourceId||product.contentLanguage!=='tr'||product.feedLabel!=='TR')throw TypeError('merchant_product_authority_invalid');
    const issues:GoogleMerchantIssue[]=product.issues.slice(0,30).map(i=>({code:i.code.toLowerCase().replace(/[^a-z0-9_]/g,'_').slice(0,80)||'google_product_issue',message:(i.description??'Google ürün bilgilerini kontrol etmenizi istiyor.').replace(/[\x00-\x1f\x7f<>]/g,' ').trim().slice(0,500)||'Google ürün bilgilerini kontrol etmenizi istiyor.'}));
    const result=await options.repository.finish({job,now:now(),result:product.status,googleProductId:expectedId,issues});result==='stale'?counts.stale++:counts.finished++;return;
   }
   const response=await options.provider.sendProduct(credential.accessToken,job.accountId,job.dataSourceId,job.projection,job.generation);
   if(response.productId!==expectedId)throw TypeError('merchant_product_identity_invalid');
   const result=await options.repository.finish({job,now:now(),result:'submitted',googleProductId:expectedId});result==='stale'?counts.stale++:counts.finished++;
  }catch(caught){
   const code=googleMarketingErrorCode(caught);
   const result=await options.repository.defer({job,now:now(),code,retryAfterSeconds:code==='provider_limit'?900:code==='needs_reconnect'?86400:60});result==='stale'?counts.stale++:counts.deferred++;
  }
 }));return counts;
}
