import type { EmailMarketingProvider } from '@celebix/saas-contracts';
import type { SealedEmailMarketingCredential } from './types.ts';
import type { EmailMarketingContactState, EmailMarketingProviderEvent } from './provider.ts';
export type EmailMarketingWorkerMode = 'off' | 'revoke_only' | 'full';
export type EmailMarketingSyncAction = 'subscribe' | 'update_profile' | 'add_membership' | 'unsubscribe' | 'remove_membership';
export interface EmailMarketingSyncJob {
    readonly id: string;
    readonly storeId: string;
    readonly connectionId: string;
    readonly generation: number;
    readonly credentialVersion: number;
    readonly email: string | null;
    readonly consentVersion: number | null;
    readonly kind: 'bootstrap' | 'profile' | 'subscribe' | 'unsubscribe' | 'remove_membership' | 'reconcile' | 'cleanup';
    readonly leaseToken: string;
    readonly leaseUntil: string;
    readonly phase: 'queued' | 'dispatched' | 'accepted' | 'unknown';
    readonly providerReference: string | null;
    readonly provider: EmailMarketingProvider;
    readonly listId: string;
    readonly credential: SealedEmailMarketingCredential;
    readonly profileId: string | null;
    readonly webhook?: Readonly<{
        id: string | null;
        credential: SealedEmailMarketingCredential | null;
        version: number;
        state: string | null;
        checkedAt: string | null;
    }>;
    readonly reconciliationCredential?: SealedEmailMarketingCredential;
    readonly reconciliationCredentialVersion?: number;
    readonly audience: Readonly<{
        kind: string;
        sequence: number;
        consentedAt: string | null;
        source: string;
        evidenceVersion: string | null;
        firstName?: string | null;
        lastName?: string | null;
    }> | null;
    readonly progress: Readonly<{
        action?: EmailMarketingSyncAction;
        dispatchedAt?: string;
        profileUpdated?: boolean;
        pollCursor?: string;
        pollWatermark?: string | null;
        pollStartedAt?: string;
        bootstrapCursor?: string;
        [key: string]: unknown;
    }>;
}
export type EmailMarketingSyncOutcome = Readonly<{
    status: 'verified' | 'blocked' | 'pending' | 'attention' | 'failed' | 'retry';
    state?: EmailMarketingContactState;
    errorCode?: string;
    profileUpdated?: boolean;
    retryAfterSeconds?: number;
    effectNotApplied?: boolean;
    credentialRejected?: boolean;
}>;
export interface EmailMarketingWorkflowRepository {
    claim(input: Readonly<{
        workerId: string;
        now: Date;
        leaseUntil: Date;
        limit: number;
        token: string;
        mode: EmailMarketingWorkerMode;
    }>): Promise<readonly EmailMarketingSyncJob[]>;
    checkpoint(input: Readonly<{
        jobId: string;
        leaseToken: string;
        now: Date;
        result: {
            phase: 'dispatched' | 'accepted' | 'unknown';
            action?: EmailMarketingSyncAction;
            credentialVersion?: number;
            providerReference?: string;
            state?: EmailMarketingContactState;
        };
    }>): Promise<boolean>;
    finish(input: Readonly<{
        jobId: string;
        leaseToken: string;
        now: Date;
        outcome: EmailMarketingSyncOutcome;
    }>): Promise<boolean>;
    hookCheckpoint(job: EmailMarketingSyncJob, result: Readonly<{
        state: 'dispatched' | 'unknown' | 'verified' | 'removing' | 'removed' | 'not_sent';
        credential?: SealedEmailMarketingCredential;
        tokenDigest?: string;
        id?: string;
    }>): Promise<boolean>;
    bootstrap(job: EmailMarketingSyncJob): Promise<boolean>;
    cleanup(job: EmailMarketingSyncJob): Promise<boolean>;
    poll(job: EmailMarketingSyncJob, page: Readonly<{
        events: readonly EmailMarketingProviderEvent[];
        nextCursor?: string;
        completedThrough: string | null;
    }>): Promise<boolean>;
    recordProviderEvent(input: Readonly<{
        connectionId: string;
        eventId: string;
        eventTime: string | null;
        receivedAt: Date;
        event: EmailMarketingProviderEvent;
    }>): Promise<'recorded' | 'replayed' | 'rejected'>;
    reconcileDue(input: Readonly<{
        now: Date;
        limit: number;
        mode: EmailMarketingWorkerMode;
    }>): Promise<number>;
    reserveRate(connectionId: string, provider: EmailMarketingProvider, bucket: string): Promise<void>;
}
export type EmailMarketingTickSummary = Readonly<{
    claimed: number;
    verified: number;
    blocked: number;
    pending: number;
    failed: number;
}>;
