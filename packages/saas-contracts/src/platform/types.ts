export interface PlatformOperatorContext {
 readonly operatorId:string; readonly principalId:string; readonly issuer:string; readonly subject:string;
 readonly email:string; readonly label:string; readonly assuranceLevel:'aal2';
}
export interface StoreSalesPolicy {
 readonly storeId:string; readonly paused:boolean; readonly reason?:string|null;
 readonly version:number; readonly updatedAt?:string|null;
}
export interface SupportSession {
 readonly id:string; readonly operatorId:string; readonly principalId:string; readonly storeId:string;
 readonly adminHost:string; readonly reason:string; readonly issuedAt:string; readonly expiresAt:string;
 readonly revokedAt:string|null; readonly version:number;
}
export interface PlatformBillingSummary {
 readonly currency:'TRY'; readonly collectedCents:number; readonly receivableCents:number;
 readonly overdueCents:number; readonly financialSetupRequired:number;
}
export const PLATFORM_RESOURCES=['overview','stores','memberships','invitations','plans','subscriptions','billing','operations','support-sessions','audit'] as const;
export type PlatformResource=typeof PLATFORM_RESOURCES[number];
export const PLATFORM_ACTIONS=['plan.publish','subscription.assign','billing.period.create','billing.period.adjust','billing.receipt.record','billing.receipt.reverse','ownership.invite','membership.update','sales.pause','sales.resume','support.issue','support.revoke','operations.retry'] as const;
export type PlatformAction=typeof PLATFORM_ACTIONS[number];
export interface PlatformMutation {readonly action:PlatformAction;readonly payload:Record<string,unknown>;readonly expectedVersion:number;readonly idempotencyKey:string}
export interface PlatformCommandResult {readonly outcome:'committed'|'replayed';readonly version:number;readonly result:Record<string,unknown>}
export interface PlatformReadEnvelope {readonly available:boolean;readonly observedAt:string|null;readonly stale?:boolean;readonly items?:readonly Record<string,unknown>[];readonly [key:string]:unknown}
