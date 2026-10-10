import { createDefaultLuckyWheelConfig, luckyWheelRewardLabel, type LuckyWheelCampaign } from '@celebix/saas-contracts';
import { createPromotionDraft, promotionRuleDocument, updatePromotionDraft } from '../promotion-ui/model.ts';
export const WHEEL_ID='78000000-0000-4000-8000-000000000002', OP_ID='78000000-0000-4000-8000-000000000001';
export function wheelFixture(version=1):LuckyWheelCampaign {
 const rule=promotionRuleDocument(updatePromotionDraft(createPromotionDraft('custom'),{perCustomerUsage:null,salesChannels:['storefront']}));
 const config={...createDefaultLuckyWheelConfig(),prizes:Array.from({length:4},(_,i)=>({id:`78000000-0000-4000-8000-00000000000${i+3}`,promotionId:WHEEL_ID,weightBps:2500,issuanceLimit:null}))};
 return {id:WHEEL_ID,name:'Karşılama',status:'active',enabled:true,version,config,prizes:config.prizes.map(p=>({...p,rewardRevisionId:p.id,managedPromotionId:p.id,used:0,label:luckyWheelRewardLabel(rule),issued:0,ruleDocument:rule})),blockedReason:null,stats:{issued:0,used:0,discountMinor:0,revenueMinor:0,currency:'TRY'},createdAt:'2026-10-10T10:00:00.000Z',updatedAt:'2026-10-10T10:00:00.000Z',legacy:false,legacyConfig:null};
}
