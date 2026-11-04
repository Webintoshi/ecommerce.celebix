import assert from 'node:assert/strict';
import test from 'node:test';
import {addPreparedLoyaltyReward} from './account-loyalty-client.ts';
const id='6e000000-0000-4000-8000-000000000001',product='6e000000-0000-4000-8000-000000000002',code=`L-${'a'.repeat(32)}`;
const prepared={operationId:id,rewardId:id,code,reward:{kind:'gift' as const,variantId:id,quantity:1},giftProductId:product,expiresAt:null};
test('using a gift adds only its missing quantity and applies its owner-bound code before navigating',async()=>{
 const calls:any[]=[];const cart={version:3,items:[]};
 const result=await addPreparedLoyaltyReward(prepared,{resolve:async()=>cart,add:async(input:any)=>{calls.push(input);return{...cart,version:4};},quotePromotionsWithDigest:async(kind:any,codes:any)=>{calls.push([kind,codes]);return{quote:{appliedPromotions:[{normalizedCode:code}],rejectedPromotions:[]}};}}as never,id);
 assert.deepEqual(calls,[{productId:product,variantId:id,quantity:1,expectedVersion:3,operationId:id},['cart',[code]]]);assert.equal(result,'/cart');
});
test('a repeated reward use never adds another gift when that variant is already in the cart',async()=>{
 let adds=0;await addPreparedLoyaltyReward(prepared,{resolve:async()=>({version:4,items:[{variantId:id,quantity:2}]}),add:async()=>{adds++;},quotePromotionsWithDigest:async()=>({quote:{appliedPromotions:[{normalizedCode:code}],rejectedPromotions:[]}})}as never,id);assert.equal(adds,0);
});
test('a rejected or unapplied reward does not redirect to a misleading success',async()=>{
 for(const quote of[{appliedPromotions:[],rejectedPromotions:[]},{appliedPromotions:[],rejectedPromotions:[{normalizedCode:code,reason:'not_eligible'}]}])await assert.rejects(addPreparedLoyaltyReward({...prepared,reward:{kind:'discount',amountMinor:100},giftProductId:null},{resolve:async()=>({items:[]}),quotePromotionsWithDigest:async()=>({quote})}as never,id),/Ödül/);
});
