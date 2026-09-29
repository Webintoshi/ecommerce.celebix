import type { TenantContext } from '@celebix/saas-contracts';
import type { ContentAuthoringDraft, ContentGenerationView } from '../../../saas-contracts/src/content-authoring/types.ts';
import type { PostgresPoolLike, PostgresTimeoutOptions } from '../postgres/pool.ts';
export interface ContentGenerationUsage {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
}
export interface ContentGeneration {
    readonly id: string;
    readonly draftId: string;
    readonly productId: string | null;
    readonly status: 'pending' | 'completed' | 'failed' | 'unknown';
    readonly requestFingerprint: string;
    readonly sourceFingerprint: string;
    readonly configId: string;
    readonly provider: string;
    readonly model: string;
    readonly credentialVersion: number;
    readonly promptVersion: string;
    readonly version: number;
    readonly dispatchState: 'not_dispatched' | 'dispatched' | 'unknown';
    readonly claimToken: string | null;
    readonly leaseExpiresAt: string | null;
    readonly usage: ContentGenerationUsage | null;
    readonly draft: ContentAuthoringDraft | null;
    readonly safeCode: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly finishedAt: string | null;
}
export type { ContentGenerationView } from '../../../saas-contracts/src/content-authoring/types.ts';
export interface ContentGenerationAuthorityInput {
    readonly tenantContext: TenantContext;
    readonly now: Date;
}
export interface GetContentGenerationInput extends ContentGenerationAuthorityInput {
    readonly operationId: string;
}
export interface BeginContentGenerationInput extends GetContentGenerationInput {
    readonly requestFingerprint: string;
    readonly providerBinding: Readonly<{
        configId: string;
        provider: string;
        model: string;
        credentialVersion: number;
        promptVersion: string;
    }>;
    readonly envelope: Readonly<{
        draftId: string;
        productId: string | null;
        sourceFingerprint: string;
    }>;
}
export interface ClaimContentGenerationInput extends GetContentGenerationInput {
    readonly expectedVersion: number;
}
export interface CompleteContentGenerationInput extends ClaimContentGenerationInput {
    readonly claimToken: string;
    readonly validatedDraft: ContentAuthoringDraft;
    readonly usage: ContentGenerationUsage | null;
}
export interface FailContentGenerationInput extends ClaimContentGenerationInput {
    readonly claimToken: string | null;
    readonly safeCode: string;
    readonly dispatchState: ContentGeneration['dispatchState'];
}
export type BeginContentGenerationResult = Readonly<{
    kind: 'pending' | 'replayed-result' | 'existing-status';
    generation: ContentGeneration;
}>;
export interface ContentGenerationDispatchClaim {
    readonly claimToken: string;
    readonly version: number;
    readonly leaseExpiresAt: string;
}
export interface ContentAuthoringRepository {
    beginGeneration(input: BeginContentGenerationInput): Promise<BeginContentGenerationResult>;
    claimGenerationDispatch(input: ClaimContentGenerationInput): Promise<ContentGenerationDispatchClaim>;
    completeGeneration(input: CompleteContentGenerationInput): Promise<ContentGeneration>;
    failGeneration(input: FailContentGenerationInput): Promise<ContentGeneration>;
    getGeneration(input: GetContentGenerationInput): Promise<ContentGeneration>;
    setDailyLimit(input: ContentGenerationAuthorityInput & Readonly<{
        dailyLimit: number;
    }>): Promise<number>;
}
export interface PostgresContentAuthoringRepositoryOptions {
    readonly pool: PostgresPoolLike;
    readonly role: 'celebix_saas_app';
    readonly timeouts: PostgresTimeoutOptions;
    readonly audit: (event: Readonly<{
        type: 'content_authoring_commit_unknown';
    }>) => void | Promise<void>;
}
