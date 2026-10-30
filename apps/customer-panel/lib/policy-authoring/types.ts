import { TOSHI_CREDIT_PRICES, type StorefrontPolicyKey, type ToshiCreditWallet } from '@celebix/saas-contracts';

export const POLICY_AUTHORING_CREDIT_COST = TOSHI_CREDIT_PRICES.description;
export type PolicyAuthoringRequest = Readonly<{
  kind: 'policy'; draftId: string; policyKey: StorefrontPolicyKey; policyVersion: number; currentBody: string; locale: 'tr';
}>;
export type PolicyAuthoringResult = Readonly<{
  kind: 'policy'; operationId: string; draftId: string; policyKey: StorefrontPolicyKey; policyVersion: number;
  requestFingerprint: string; body: string; suggestions: readonly string[]; chargedCredits: typeof POLICY_AUTHORING_CREDIT_COST; wallet: ToshiCreditWallet;
}>;
