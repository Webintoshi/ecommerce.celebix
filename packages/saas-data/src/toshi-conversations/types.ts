import type { TenantContext, ToshiConversation, ToshiConversationSummary, ToshiSource } from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";
import type { ToshiConversationErrorCode } from "./errors.ts";
export interface ToshiConversationAuthorityInput { readonly tenantContext: TenantContext; readonly now: Date }
export interface GetToshiConversationInput extends ToshiConversationAuthorityInput { readonly conversationId: string }
export interface BeginToshiTurnInput extends ToshiConversationAuthorityInput { readonly operationId: string; readonly conversationId: string | null; readonly expectedVersion: number | null; readonly text: string }
export type BeginToshiTurnResult = Readonly<{ kind: "ready"; operationId: string; conversation: ToshiConversation; configId: string; credentialVersion: number }> | Readonly<{ kind: "replayed"; conversation: ToshiConversation }>;
export interface CompleteToshiTurnInput extends ToshiConversationAuthorityInput { readonly operationId: string; readonly assistantText: string; readonly sources: readonly ToshiSource[] }
export interface FailToshiTurnInput extends ToshiConversationAuthorityInput { readonly operationId: string; readonly code: ToshiConversationErrorCode }
export interface ToshiConversationRepository {
  list(input: ToshiConversationAuthorityInput): Promise<readonly ToshiConversationSummary[]>;
  get(input: GetToshiConversationInput): Promise<ToshiConversation>;
  beginTurn(input: BeginToshiTurnInput): Promise<BeginToshiTurnResult>;
  completeTurn(input: CompleteToshiTurnInput): Promise<ToshiConversation>;
  failTurn(input: FailToshiTurnInput): Promise<void>;
}
export interface PostgresToshiConversationRepositoryOptions { readonly pool: PostgresPoolLike; readonly role: "celebix_saas_app"; readonly timeouts: PostgresTimeoutOptions; readonly audit: (event: Readonly<{ type: "toshi_conversation_commit_unknown" }>) => void | Promise<void> }
