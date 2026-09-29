import type { ContentResearchRequest, ContentResearchResult, ContentResearchSource, ContentResearchStoredOperation, ContentResearchUsage, ContentResourceTarget, TenantContext } from '@celebix/saas-contracts';
import type { ContentGenerationDispatchClaim } from '../content-authoring/types.ts';
import type { PostgresPoolLike, PostgresTimeoutOptions } from '../postgres/pool.ts';
export interface ResearchAuthority { readonly tenantContext: TenantContext; readonly now: Date; readonly operationId: string }
export interface BeginContentResearchInput extends ResearchAuthority { readonly requestFingerprint: string; readonly target: ContentResourceTarget }
export interface ClaimContentResearchInput extends ResearchAuthority { readonly expectedVersion: number }
export interface CompleteContentResearchInput extends ClaimContentResearchInput { readonly claimToken: string; readonly sources: readonly ContentResearchSource[]; readonly usage: ContentResearchUsage }
export interface FailContentResearchInput extends ClaimContentResearchInput { readonly claimToken: string | null; readonly safeCode: string; readonly dispatchState: ContentResearchStoredOperation['dispatchState']; readonly usage: ContentResearchUsage }
export type BeginContentResearchResult = Readonly<{ kind: 'pending' | 'replayed-result' | 'existing-status'; operation: ContentResearchStoredOperation }>;
export interface ContentResearchRepository {
  begin(input: BeginContentResearchInput): Promise<BeginContentResearchResult>;
  claim(input: ClaimContentResearchInput): Promise<ContentGenerationDispatchClaim>;
  complete(input: CompleteContentResearchInput): Promise<ContentResearchStoredOperation>;
  fail(input: FailContentResearchInput): Promise<ContentResearchStoredOperation>;
  get(input: ResearchAuthority): Promise<ContentResearchStoredOperation>;
}
export interface PostgresContentResearchRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: 'celebix_saas_app';
  readonly timeouts: PostgresTimeoutOptions;
  readonly audit: (event: Readonly<{type:'content_research_commit_unknown'}>) => void | Promise<void>;
}
export type { ContentResearchRequest };
