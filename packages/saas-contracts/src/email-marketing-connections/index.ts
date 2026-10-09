export const EMAIL_MARKETING_PROVIDERS = ['brevo', 'klaviyo'] as const;
export type EmailMarketingProvider = typeof EMAIL_MARKETING_PROVIDERS[number];
export type EmailMarketingSenderStatus = 'verified' | 'pending' | 'unknown';
export type EmailMarketingConnection = Readonly<{
  id: string; provider: EmailMarketingProvider; version: number; generation: number; credentialVersion: number;
  accountId: string | null; accountName: string | null; listId: string | null; listName: string | null;
  status: 'disconnected' | 'connected' | 'draining' | 'needs_reconnect' | 'error';
  senderStatus: EmailMarketingSenderStatus; lastCheckedAt: string | null; lastSyncedAt: string | null; errorCode: string | null;
}>;
export type EmailMarketingAudiencePreview = Readonly<{
  eligible: number; denied: number; missingEvidence: number; needsRenewal: number;
  providerBlocked: number | null; unchecked: number; overLimit: number | null; providerCheckedAt: string | null;
}>;
export type EmailMarketingSyncSummary = Readonly<{
  queued: number; verified: number; blocked: number; failed: number; pendingVerification: number;
  asOf: string; suppressionCheckedAt: string | null;
}>;
export type EmailMarketingOverview = Readonly<{connections: readonly EmailMarketingConnection[]; sync: EmailMarketingSyncSummary; configured: boolean}>;
export type EmailMarketingSelection = Readonly<{kind: 'existing'; listId: string}> | Readonly<{kind: 'create'; name: string}>;
export type EmailMarketingApplyIntent = Readonly<{candidateId: string; expectedVersion: number; selection: EmailMarketingSelection}>;
export type EmailMarketingList = Readonly<{id: string; name: string}>;
export type EmailMarketingAccount = Readonly<{id: string; name: string; senderStatus: EmailMarketingSenderStatus}>;
export * from './validation.ts';
