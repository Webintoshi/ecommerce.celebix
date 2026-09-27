import type { RegistrationAuthorityScope } from "../onboarding-jobs/types.ts";
export type OnboardingStage = "awaiting_identity" | "creating" | "checking_access" | "ready" | "attention_required" | "expired" | "failed";
export type OnboardingStatusProjection = Readonly<{stage:OnboardingStage;updatedAt:string;storeSlug?:string}>;
export type OnboardingStatusDto = Readonly<{stage:OnboardingStage;updatedAt:string;pollAfterMs:0|5000|15000;loginUrl?:string;storefrontUrl?:string;messageCode:string}>;
export type OnboardingStatusRead = Readonly<{kind:"status";projection:OnboardingStatusProjection}|{kind:"expired"|"unauthorized"|"unavailable"}>;
export interface OnboardingStatusReader {readStatus(input:{digest:string;scope:RegistrationAuthorityScope;now:Date}):Promise<OnboardingStatusRead>}
export function resolveOnboardingStatusEnabled(value:unknown):boolean { return value === "true"; }
