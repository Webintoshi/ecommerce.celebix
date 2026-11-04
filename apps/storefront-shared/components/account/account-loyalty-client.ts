import {parseLoyaltyCustomerResult,type LoyaltyCustomerAction,type LoyaltyCustomerPayloadMap,type LoyaltyCustomerResultMap,type LoyaltyPreparedReward} from '@celebix/saas-contracts';
import type {StorefrontCartClient} from '../../lib/cart/types.ts';

function csrf(){if(typeof document==='undefined')return '';const values=document.cookie.split(';').map(x=>x.trim()).filter(x=>x.startsWith('__Host-celebix_account_csrf=')).map(x=>x.slice('__Host-celebix_account_csrf='.length));return values.length===1?values[0]!:'';}
export async function accountLoyaltyCommand<A extends LoyaltyCustomerAction>(action:A,payload:LoyaltyCustomerPayloadMap[A],operationId?:string,transport:typeof fetch=fetch):Promise<LoyaltyCustomerResultMap[A]>{
 const response=await transport('/api/account/loyalty',{method:action==='list'?'GET':'POST',credentials:'same-origin',cache:'no-store',...(action==='list'?{}:{headers:{'content-type':'application/json','x-celebix-account-csrf':csrf()},body:JSON.stringify({action,payload,operationId})})});
 const value=await response.json().catch(()=>null) as unknown;
 if(!response.ok)throw new Error(value&&typeof value==='object'&&'message'in value&&typeof value.message==='string'?value.message:'Sadakat işlemi tamamlanamadı. Tekrar deneyebilirsiniz.');
 return parseLoyaltyCustomerResult(action,value);
}
export async function addPreparedLoyaltyReward(prepared:LoyaltyPreparedReward,cart:Pick<StorefrontCartClient,'resolve'|'add'|'quotePromotionsWithDigest'>,operationId:string):Promise<'/cart'>{
 if(prepared.reward.kind==='gift'){
  if(!prepared.giftProductId)throw new Error('Ödül ürünü şu anda kullanılamıyor. Hakkınız korunuyor.');
  const reward=prepared.reward,current=await cart.resolve(),quantity=current.items.find(x=>x.variantId===reward.variantId)?.quantity??0;
  if(quantity<reward.quantity)try{await cart.add({productId:prepared.giftProductId,variantId:reward.variantId,quantity:reward.quantity-quantity,expectedVersion:current.version,operationId});}catch(error){if(error!==null&&typeof error==='object'&&'code'in error&&error.code==='stock_unavailable')throw new Error('Hediye şu anda stokta yok. Ödül hakkınız korunuyor.');throw error;}
 }
 const {quote}=await cart.quotePromotionsWithDigest('cart',[prepared.code]);
 if(quote.rejectedPromotions.some(x=>x.normalizedCode===prepared.code)||!quote.appliedPromotions.some(x=>x.normalizedCode===prepared.code))throw new Error('Ödül bu sepete uygulanamadı. Sepetteki ürünleri ve ödülün kullanım koşullarını kontrol edin. Hakkınız korunuyor.');
 return '/cart';
}
