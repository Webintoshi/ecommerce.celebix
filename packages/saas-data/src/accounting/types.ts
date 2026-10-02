import type { TenantContext } from '@celebix/saas-contracts';
import type { AccountingAccounts,AccountingCollectionAccounts,AccountingCollectionPreview,AccountingCustomerAccount,AccountingExpenses,AccountingFilters,AccountingIntentMap,AccountingMutation,AccountingMutationResult,AccountingOrderFinance,AccountingOverview,AccountingReceivables } from '../../../saas-contracts/src/accounting/index.ts';
import type { PostgresPoolLike,PostgresTimeoutOptions } from '../postgres/pool.ts';
export interface AccountingAuthorityInput { readonly tenantContext:TenantContext; readonly now:Date; }
export interface AccountingReadInput extends AccountingAuthorityInput { readonly filters?:AccountingFilters; }
export interface AccountingCustomerInput extends AccountingAuthorityInput { readonly customerId:string; readonly currency?:string; }
export interface AccountingOrderInput extends AccountingAuthorityInput { readonly orderId:string; }
export interface AccountingPreviewInput extends AccountingCustomerInput { readonly amountCents:number; readonly orderId?:string; }
export interface AccountingMutationInput<K extends AccountingMutation> extends AccountingAuthorityInput { readonly operationId:string; readonly intent:AccountingIntentMap[K]; }
export interface AccountingOperationInput extends AccountingAuthorityInput { readonly operationId:string; }
export interface PostgresAccountingRepositoryOptions { readonly pool:PostgresPoolLike; readonly role:'celebix_saas_app'; readonly timeouts:PostgresTimeoutOptions; }
export interface AccountingRepository {
 overview(input:AccountingReadInput):Promise<AccountingOverview>;
 receivables(input:AccountingReadInput):Promise<AccountingReceivables>;
 customerAccount(input:AccountingCustomerInput):Promise<AccountingCustomerAccount>;
 orderFinance(input:AccountingOrderInput):Promise<AccountingOrderFinance|null>;
 previewCollection(input:AccountingPreviewInput):Promise<AccountingCollectionPreview>;
 accounts(input:AccountingReadInput):Promise<AccountingAccounts>;
 collectionAccounts(input:AccountingAuthorityInput):Promise<AccountingCollectionAccounts>;
 expenses(input:AccountingReadInput):Promise<AccountingExpenses>;
 collect(input:AccountingMutationInput<'collect'>):Promise<AccountingMutationResult>;
 openingDebt(input:AccountingMutationInput<'openingDebt'>):Promise<AccountingMutationResult>;
 saveAccount(input:AccountingMutationInput<'saveAccount'>):Promise<AccountingMutationResult>;
 openBalance(input:AccountingMutationInput<'openBalance'>):Promise<AccountingMutationResult>;
 expense(input:AccountingMutationInput<'expense'>):Promise<AccountingMutationResult>;
 transfer(input:AccountingMutationInput<'transfer'>):Promise<AccountingMutationResult>;
 settleCard(input:AccountingMutationInput<'settleCard'>):Promise<AccountingMutationResult>;
 reverse(input:AccountingMutationInput<'reverse'>):Promise<AccountingMutationResult>;
 returnCredit(input:AccountingMutationInput<'returnCredit'>):Promise<AccountingMutationResult>;
 refund(input:AccountingMutationInput<'refund'>):Promise<AccountingMutationResult>;
 operation(input:AccountingOperationInput):Promise<AccountingMutationResult|null>;
}
