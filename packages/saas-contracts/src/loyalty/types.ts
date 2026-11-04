export const LOYALTY_TEMPLATES = ['product_gift','purchase_gift','spend_discount','purchase_shipping'] as const;
export type LoyaltyTemplate = typeof LOYALTY_TEMPLATES[number];
export type LoyaltyReward = Readonly<{kind:'gift';variantId:string;quantity:number}|{kind:'discount';amountMinor:number}|{kind:'shipping';shippingMethodIds:readonly string[]}>;
export type LoyaltyConfig = Readonly<{
 schemaVersion:1;template:LoyaltyTemplate;target:number;eligibleProductIds:readonly string[];reward:LoyaltyReward;
 minimumBasketMinor:number;rewardMinimumBasketMinor:number;channels:readonly ('storefront'|'in_store'|'manual')[];
 startsAt:string|null;endsAt:string|null;timezone:string;repeat:boolean;maxOncePerDay:boolean;
 allowMultiplePrograms:boolean;allowCombination:boolean;progressExpiryDays:number|null;rewardExpiryDays:number|null;
}>;
export type LoyaltyProgram = Readonly<{id:string;name:string;status:'active'|'scheduled'|'paused';version:number;config:LoyaltyConfig;createdAt:string;updatedAt:string}>;
export type LoyaltyProgramList = Readonly<{programs:readonly LoyaltyProgram[]}>;
export type LoyaltyMember = Readonly<{customerId:string;customerName:string;progress:number;target:number;earned:number;used:number;available:number}>;
export type LoyaltyReport = Readonly<{
 program:LoyaltyProgram;summary:Readonly<{members:number;earned:number;used:number;available:number;reserved:number;knownCostMinor:number|null;unknownCostRewards:number}>;
 members:readonly LoyaltyMember[];nextCursor:string|null;
}>;
export type LoyaltyProgramMutation = Readonly<{operationId:string;program:LoyaltyProgram}>;
export type LoyaltyAdjustmentResult = Readonly<{operationId:string;customerId:string;programId:string;progress:number}>;
export type LoyaltyPosApproval = Readonly<{operationId:string;customerId:string;approvalId:string;expiresAt:string;availableRewards:readonly LoyaltyCustomerReward[]}>;
export type LoyaltyCustomerProgress = Readonly<{programId:string;name:string;template:LoyaltyTemplate;progress:number;target:number;reward:LoyaltyReward}>;
export type LoyaltyCustomerReward = Readonly<{id:string;programId:string;programName:string;reward:LoyaltyReward;status:'available'|'reserved'|'used'|'revoked'|'expired';earnedAt:string;expiresAt:string|null}>;
export type LoyaltyCustomerList = Readonly<{programs:readonly LoyaltyCustomerProgress[];rewards:readonly LoyaltyCustomerReward[]}>;
export type LoyaltyPreparedReward = Readonly<{operationId:string;rewardId:string;code:string;reward:LoyaltyReward;giftProductId:string|null;expiresAt:string|null}>;
export type LoyaltyCustomerPosApproval = Omit<LoyaltyPosApproval,'availableRewards'> & Readonly<{token:string}>;
export type LoyaltyAdminPayloadMap = {
 list:Readonly<Record<string,never>>;
 report:Readonly<{programId:string;limit?:number;cursor?:string}>;
 save:Readonly<{programId?:string;expectedVersion?:number;name:string;enabled:boolean;config:LoyaltyConfig}>;
 pause:Readonly<{programId:string;expectedVersion:number}>;
 duplicate:Readonly<{programId:string;expectedVersion:number}>;
 adjust:Readonly<{programId:string;customerId:string;delta:number;reason:string}>;
 'approve-pos':Readonly<{token:string;saleId?:string}>;
 'prepare-pos-reward':Readonly<{saleId:string;rewardId:string|null;expectedVersion:number}>;
};
export type LoyaltyAdminAction = keyof LoyaltyAdminPayloadMap;
export type LoyaltyAdminResultMap = {
 list:LoyaltyProgramList;report:LoyaltyReport;save:LoyaltyProgramMutation;pause:LoyaltyProgramMutation;
 duplicate:LoyaltyProgramMutation;adjust:LoyaltyAdjustmentResult;'approve-pos':LoyaltyPosApproval;'prepare-pos-reward':InStoreSaleResult;
};
export type LoyaltyCustomerPayloadMap = {list:Readonly<Record<string,never>>;'prepare-reward':Readonly<{rewardId:string}>;'approve-pos':Readonly<Record<string,never>>};
export type LoyaltyCustomerAction = keyof LoyaltyCustomerPayloadMap;
export type LoyaltyCustomerResultMap = {list:LoyaltyCustomerList;'prepare-reward':LoyaltyPreparedReward;'approve-pos':LoyaltyCustomerPosApproval};
export type LoyaltyAdminResult = LoyaltyAdminResultMap[LoyaltyAdminAction];
export type LoyaltyCustomerResult = LoyaltyCustomerResultMap[LoyaltyCustomerAction];
import type {InStoreSaleResult} from '../in-store-sales/types.ts';
