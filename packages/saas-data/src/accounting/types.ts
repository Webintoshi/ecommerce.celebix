import type {AccountingProfitability,AccountingProfitabilityFilters} from '../../../saas-contracts/src/accounting/index.ts';
import type {AccountingSupplierAction,AccountingSupplierIntentMap,AccountingSupplierFilters,AccountingSupplierList,AccountingSupplierDetail,AccountingSupplierResult} from '../../../saas-contracts/src/accounting/index.ts';
import type { TenantContext } from '@celebix/saas-contracts';
import type { AccountingAccounts,AccountingCollectionAccounts,AccountingCollectionPreview,AccountingCustomerAccount,AccountingExpenses,AccountingFilters,AccountingIntentMap,AccountingMutation,AccountingMutationResult,AccountingOrderFinance,AccountingOverview,AccountingReceivables } from '../../../saas-contracts/src/accounting/index.ts';
import type { PostgresPoolLike,PostgresTimeoutOptions } from '../postgres/pool.ts';
import type {AccountingScheduleFilters,AccountingDebtSchedule,AccountingSchedules,AccountingScheduleIntent,AccountingScheduleResult} from '../../../saas-contracts/src/accounting/index.ts';
import type {AccountingCashAction,AccountingCashIntentMap,AccountingCashResult,AccountingCashSessions} from '../../../saas-contracts/src/accounting/index.ts';
export interface AccountingAuthorityInput { readonly tenantContext:TenantContext; readonly now:Date; }
export interface AccountingReadInput extends AccountingAuthorityInput { readonly filters?:AccountingFilters; }
export interface AccountingProfitabilityInput extends AccountingAuthorityInput {readonly filters:AccountingProfitabilityFilters;}
export interface AccountingCustomerInput extends AccountingAuthorityInput { readonly customerId:string; readonly currency?:string; }
export interface AccountingOrderInput extends AccountingAuthorityInput { readonly orderId:string; }
export interface AccountingPreviewInput extends AccountingCustomerInput { readonly amountCents:number; readonly orderId?:string; }
export interface AccountingMutationInput<K extends AccountingMutation> extends AccountingAuthorityInput { readonly operationId:string; readonly intent:AccountingIntentMap[K]; }
export interface AccountingOperationInput extends AccountingAuthorityInput { readonly operationId:string; }
export interface AccountingSchedulesInput extends AccountingAuthorityInput {readonly filters?:AccountingScheduleFilters;}
export interface AccountingScheduleInput extends AccountingAuthorityInput {readonly receivableId:string;}
export interface AccountingScheduleSaveInput extends AccountingAuthorityInput {readonly operationId:string;readonly intent:AccountingScheduleIntent;}
export interface AccountingCashListInput extends AccountingAuthorityInput {readonly accountId:string;}
export interface AccountingCashMutationInput<K extends AccountingCashAction> extends AccountingAuthorityInput {readonly kind:K;readonly operationId:string;readonly intent:AccountingCashIntentMap[K];}
export interface PostgresAccountingRepositoryOptions { readonly pool:PostgresPoolLike; readonly role:'celebix_saas_app'; readonly timeouts:PostgresTimeoutOptions; }
export interface AccountingSuppliersInput extends AccountingAuthorityInput {readonly filters?:AccountingSupplierFilters;}
export interface AccountingSupplierInput extends AccountingAuthorityInput {readonly debtId:string;}
export interface AccountingSupplierMutationInput<K extends AccountingSupplierAction> extends AccountingAuthorityInput {readonly kind:K;readonly operationId:string;readonly intent:AccountingSupplierIntentMap[K];}
export interface AccountingRepository {
 profitability(input:AccountingProfitabilityInput):Promise<AccountingProfitability>;
 suppliers(input:AccountingSuppliersInput):Promise<AccountingSupplierList>;
 supplier(input:AccountingSupplierInput):Promise<AccountingSupplierDetail>;
 supplierMutate<K extends AccountingSupplierAction>(input:AccountingSupplierMutationInput<K>):Promise<AccountingSupplierResult>;
 supplierOperation(input:AccountingOperationInput):Promise<AccountingSupplierResult|null>;
 cashSessions(input:AccountingCashListInput):Promise<AccountingCashSessions>;
 cashMutate<K extends AccountingCashAction>(input:AccountingCashMutationInput<K>):Promise<AccountingCashResult>;
 cashOperation(input:AccountingOperationInput):Promise<AccountingCashResult|null>;
 schedules(input:AccountingSchedulesInput):Promise<AccountingSchedules>;
 schedule(input:AccountingScheduleInput):Promise<AccountingDebtSchedule>;
 saveSchedule(input:AccountingScheduleSaveInput):Promise<AccountingScheduleResult>;
 scheduleOperation(input:AccountingOperationInput):Promise<AccountingScheduleResult|null>;
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
