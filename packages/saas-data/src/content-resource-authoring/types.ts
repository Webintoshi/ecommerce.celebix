import type { TenantContext, ContentResourceTarget, ContentResourceGeneration, ContentResourceDraft, ContentOutline } from '@celebix/saas-contracts';
import type { ContentGenerationUsage, ContentGenerationDispatchClaim, BeginContentGenerationInput } from '../content-authoring/types.ts';
import type { PostgresPoolLike, PostgresTimeoutOptions } from '../postgres/pool.ts';
export type { ContentResourceGeneration } from '@celebix/saas-contracts';
export interface ResourceGenerationAuthority {
    readonly tenantContext: TenantContext;
    readonly now: Date;
    readonly operationId: string;
}
export interface BeginContentResourceGenerationInput extends ResourceGenerationAuthority {
    readonly requestFingerprint: string;
    readonly sourceFingerprint: string;
    readonly target: ContentResourceTarget;
    readonly stage: 'outline' | 'draft';
    readonly providerBinding: BeginContentGenerationInput['providerBinding'];
}
export interface ClaimContentResourceGenerationInput extends ResourceGenerationAuthority {
    readonly expectedVersion: number;
}
export interface CompleteContentResourceGenerationInput extends ClaimContentResourceGenerationInput {
    readonly claimToken: string;
    readonly outline: ContentOutline | null;
    readonly draft: ContentResourceDraft | null;
    readonly usage: ContentGenerationUsage | null;
}
export interface FailContentResourceGenerationInput extends ClaimContentResourceGenerationInput {
    readonly claimToken: string | null;
    readonly safeCode: string;
    readonly dispatchState: ContentResourceGeneration['dispatchState'];
    readonly usage?: ContentGenerationUsage | null;
}
export type BeginContentResourceGenerationResult = Readonly<{
    kind: 'pending' | 'replayed-result' | 'existing-status';
    generation: ContentResourceGeneration;
}>;
export interface ContentResourceAuthoringRepository {
    beginGeneration(input: BeginContentResourceGenerationInput): Promise<BeginContentResourceGenerationResult>;
    claimGenerationDispatch(input: ClaimContentResourceGenerationInput): Promise<ContentGenerationDispatchClaim>;
    completeGeneration(input: CompleteContentResourceGenerationInput): Promise<ContentResourceGeneration>;
    failGeneration(input: FailContentResourceGenerationInput): Promise<ContentResourceGeneration>;
    getGeneration(input: ResourceGenerationAuthority): Promise<ContentResourceGeneration>;
}
export interface PostgresContentResourceAuthoringRepositoryOptions {
    readonly pool: PostgresPoolLike;
    readonly role: 'celebix_saas_app';
    readonly timeouts: PostgresTimeoutOptions;
    readonly audit: (event: Readonly<{
        type: 'content_resource_authoring_commit_unknown';
    }>) => void | Promise<void>;
}
