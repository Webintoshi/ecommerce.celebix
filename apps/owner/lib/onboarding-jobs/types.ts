import { normalizeExactHttpsOrigin } from '@celebix/saas-data';

export interface RegistrationAuthorityScope {
  ownerOrigin: string;
  panelOrigin: string;
  platformDomainSuffix: string;
}
export function normalizeOnboardingScope(scope: RegistrationAuthorityScope): Readonly<RegistrationAuthorityScope> {
  const ownerOrigin = normalizeExactHttpsOrigin(scope.ownerOrigin);
  const panelOrigin = normalizeExactHttpsOrigin(scope.panelOrigin);
  if (ownerOrigin !== scope.ownerOrigin || panelOrigin !== scope.panelOrigin ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(scope.platformDomainSuffix)) {
    throw new Error('onboarding_scope_invalid');
  }
  return Object.freeze({ ownerOrigin, panelOrigin, platformDomainSuffix: scope.platformDomainSuffix });
}
export const SAFE_CODES = ['access_ready', 'access_pending', 'access_unavailable', 'authority_invalid', 'completion_pending', 'completion_unavailable', 'completion_failed'] as const;
export type OnboardingSafeCode = typeof SAFE_CODES[number];
export interface OnboardingAccessSnapshot {
  attemptId: string;
  storeId: string;
  checkedAt: string;
  state: 'ready' | 'pending' | 'unavailable';
  safeCodes: readonly OnboardingSafeCode[];
}
export interface OnboardingJob {
  attemptId: string;
  leaseToken: string;
  failureCount: number;
  createdAt: string;
}
export interface FinishOnboardingJob {
  scope: RegistrationAuthorityScope;
  attemptId: string;
  leaseToken: string;
  now: Date;
  state: 'ready' | 'pending' | 'retry' | 'attention_required';
  safeCode: OnboardingSafeCode;
  snapshot?: OnboardingAccessSnapshot;
}
export interface OnboardingJobRepository {
  claim(input: { scope: RegistrationAuthorityScope; now: Date; limit: number }): Promise<OnboardingJob[]>;
  finish(input: FinishOnboardingJob): Promise<boolean>;
  heartbeat(scope: RegistrationAuthorityScope, now: Date): Promise<void>;
  readSnapshot(input: { scope: RegistrationAuthorityScope; attemptId: string; storeId?: string; now: Date }): Promise<OnboardingAccessSnapshot | undefined>;
}
export const SNAPSHOT_TTL_MS = 300_000;
export const HEARTBEAT_TTL_MS = 45_000;
