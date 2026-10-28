import type { TenantContext, ToshiCreditWallet } from '@celebix/saas-contracts';
import type { PostgresPoolLike, PostgresTimeoutOptions } from '../postgres/pool.ts';
export interface ToshiCreditAuthorityInput { readonly tenantContext: TenantContext; readonly now: Date }
export interface ReserveToshiCreditsInput extends ToshiCreditAuthorityInput { readonly operationId: string; readonly fingerprint: string; readonly cost: number }
export type ReserveToshiCreditsResult = Readonly<{ kind: 'created' | 'replayed' | 'pending'; status: 'reserved' | 'completed' | 'failed' | 'unknown'; result: unknown | null; chargedCredits: number }>;
export interface CompleteToshiCreditsInput extends ToshiCreditAuthorityInput { readonly operationId: string; readonly fingerprint: string; readonly result: unknown; readonly chargedCredits: number }
export interface FailToshiCreditsInput extends ToshiCreditAuthorityInput { readonly operationId: string; readonly fingerprint: string; readonly safeCode: string; readonly unknown?: boolean }
export interface ToshiCreditRepository {
  getWallet(input: ToshiCreditAuthorityInput): Promise<ToshiCreditWallet>;
  reserve(input: ReserveToshiCreditsInput): Promise<ReserveToshiCreditsResult>;
  complete(input: CompleteToshiCreditsInput): Promise<ToshiCreditWallet>;
  fail(input: FailToshiCreditsInput): Promise<ToshiCreditWallet>;
}
export interface PostgresToshiCreditRepositoryOptions { readonly pool: PostgresPoolLike; readonly role: 'celebix_saas_app'; readonly timeouts: PostgresTimeoutOptions; readonly audit: (event: Readonly<{ type: 'toshi_credit_commit_unknown' }>) => void | Promise<void> }
